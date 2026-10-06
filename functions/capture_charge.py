"""At-most-once refunds for queued captures.

A queued capture (share sheet, durable web save, image retry, bulk import) is
charged one quota unit when it is enqueued. Several parties can later decide
the user got nothing for it and give the unit back: the worker
(``process_link_background``) when analysis fails or the card was deleted while
queued, the processing janitor when a card sat in ``processing`` too long, and
the janitor's queue prune when a job was abandoned. Before this module each of
them refunded on its own judgement, so one charge could be refunded twice
(janitor times a card out, then the worker runs late and fails it again) and
the janitor could refund cards nobody had charged (an offline placeholder that
was never enqueued, an ``/api/analyze`` retry that refunds itself).

The rule now: **a charge is a token, and only whoever removes the token may
refund.** ``charge: {"kind": "saves" | "imports"}`` is written on the queue doc
in the same write that enqueues the job. When the worker picks the job up it
MOVES the token onto the card in one transaction (the job loses it, the card
gains it). From then on the card holds it:

- the worker's success write replaces the card without the token (the charge
  was spent on a real card, nothing to refund);
- the worker's failure write replaces the card without the token and refunds
  the kind it removed;
- the janitor's time-out write removes the token and refunds that kind.

Each of those reads and clears the token inside a transaction, so two of them
can never both see it. A job whose token never reached a card (card deleted
while queued, placeholder write failed, job abandoned in the queue) is
refunded by claiming the token off the job doc instead, again transactionally.
Cards and jobs without a token (legacy docs, client-only placeholders,
``/api/analyze`` retries, which refund themselves) are never refunded here.

Consequence worth knowing: if the janitor times a card out and refunds it, and
the worker later runs anyway (the job was only slow), the worker still finishes
the card, but there is no token left to spend or refund, so that save is free.
A user is never charged twice and never refunded twice.

**One run per job.** Firestore triggers are delivered at least once, so the
same job can reach the worker twice, even concurrently. ``start_job`` is the
worker's first write and it CLAIMS the job: only a job that still exists and is
still ``queued`` can be started, and starting it marks it ``processing`` in the
same transaction that writes the card. A second delivery finds it started (or
gone, once the first run finished) and does nothing: no card, no Gemini call,
no refund.
"""

from datetime import datetime, timezone
from typing import Callable, Optional

from google.cloud import firestore

CHARGE_FIELD = "charge"
_KINDS = ("saves", "imports")

# A queue doc's `status` while it waits for a worker (every enqueue path writes
# it), and the one ``start_job`` moves it to.
QUEUED = "queued"
STARTED_STATUS = "processing"

# ``start_job`` outcomes.
STARTED = "started"            # this run owns the job; the card is written
DUPLICATE = "duplicate"        # gone or already started: another run owns it
CARD_GONE = "card_gone"        # the existing card was deleted while it waited
CARD_SETTLED = "card_settled"  # the existing card is not waiting for this job


def token(kind: str) -> dict:
    """The charge token to store on a queue doc at enqueue time."""
    return {"kind": kind}


def _snap_dict(snap) -> Optional[dict]:
    """The snapshot's data, or None when the doc does not exist."""
    if snap is None or not getattr(snap, "exists", False):
        return None
    to_dict = getattr(snap, "to_dict", None)
    d = to_dict() if callable(to_dict) else None
    return d if isinstance(d, dict) else {}


def charge_kind(doc: Optional[dict]) -> Optional[str]:
    """The kind a doc's token was charged as, or None when it carries none."""
    c = (doc or {}).get(CHARGE_FIELD)
    if isinstance(c, dict) and c.get("kind") in _KINDS:
        return c["kind"]
    return None


def run_transaction(db, fn: Callable):
    """Run ``fn(transaction)`` in a Firestore transaction (retried on
    contention, so ``fn`` must only read through the transaction and write
    through it). Tests swap this for a direct call."""
    @firestore.transactional
    def _txn(tx):
        return fn(tx)
    return _txn(db.transaction())


def claim(db, ref) -> Optional[str]:
    """Remove the token from ``ref`` and return its kind (the caller refunds
    it), or None when there is no doc or no token."""
    def _body(tx):
        kind = charge_kind(_snap_dict(ref.get(transaction=tx)))
        if kind:
            tx.update(ref, {CHARGE_FIELD: firestore.DELETE_FIELD})
        return kind
    return run_transaction(db, _body)


def job_claimable(job: Optional[dict]) -> bool:
    """True while a queue doc is still waiting for its first run. A doc with no
    `status` at all predates the field and counts as waiting; ``start_job``
    stamps one, so even such a doc can be started only once."""
    return job is not None and job.get("status", QUEUED) == QUEUED


def start_job(db, job_ref, card_ref, card_fields: Optional[dict], *, create: bool = False,
              job_fields: Optional[dict] = None, accepts: Optional[Callable[[dict], bool]] = None,
              move_token: bool = True) -> str:
    """Claim a queued job for this run and start its card, atomically.

    In one transaction: the job must still exist and be ``queued`` (and, for
    ``create``, must not name a card yet), else DUPLICATE and nothing is
    written. An existing card must still exist (else CARD_GONE) and pass
    ``accepts`` (else CARD_SETTLED); in both cases nothing is written and the
    token stays on the job for the caller to refund with ``claim``. On STARTED
    the job is marked ``processing`` with ``startedAt`` (plus ``job_fields``),
    ``card_fields`` are written to the card (``create`` sets a fresh card,
    otherwise the card is updated) and, with ``move_token``, the job's token
    moves onto the card."""
    def _body(tx):
        job = _snap_dict(job_ref.get(transaction=tx))
        if not job_claimable(job) or (create and job.get("cardId")):
            return DUPLICATE
        if not create and card_ref is not None:
            card = _snap_dict(card_ref.get(transaction=tx))
            if card is None:
                return CARD_GONE
            if accepts is not None and not accepts(card):
                return CARD_SETTLED
        kind = charge_kind(job) if move_token else None
        jf = {"status": STARTED_STATUS, "startedAt": datetime.now(timezone.utc).isoformat()}
        jf.update(job_fields or {})
        if card_ref is not None and card_fields is not None:
            fields = dict(card_fields)
            if kind:
                fields[CHARGE_FIELD] = token(kind)
                jf[CHARGE_FIELD] = firestore.DELETE_FIELD
            if create:
                tx.set(card_ref, fields)
            else:
                tx.update(card_ref, fields)
        tx.update(job_ref, jf)
        return STARTED
    return run_transaction(db, _body)


def finalize_card(db, card_ref, build: Callable[[dict], dict]) -> tuple:
    """Replace the card with ``build(current_card)``, never re-creating a card
    the user deleted. The new doc never carries the token (``build`` output is
    stripped of it). Returns ``(written, removed_kind)``: the caller refunds
    ``removed_kind`` only on a FAILURE write; on success the charge was spent."""
    def _body(tx):
        current = _snap_dict(card_ref.get(transaction=tx))
        if current is None:
            return False, None
        data = dict(build(current))
        data.pop(CHARGE_FIELD, None)
        tx.set(card_ref, data)
        return True, charge_kind(current)
    return run_transaction(db, _body)


def fail_if_processing(db, card_ref, fields: dict) -> tuple:
    """The janitor's time-out write: apply ``fields`` and remove the token,
    but only while the card is still ``processing`` (the worker may have
    finished it between the janitor's query and this write). Returns
    ``(failed, removed_kind)``."""
    def _body(tx):
        current = _snap_dict(card_ref.get(transaction=tx))
        if current is None or current.get("status") != "processing":
            return False, None
        kind = charge_kind(current)
        update = dict(fields)
        if kind:
            update[CHARGE_FIELD] = firestore.DELETE_FIELD
        tx.update(card_ref, update)
        return True, kind
    return run_transaction(db, _body)
