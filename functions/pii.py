"""Shared PII redaction helpers.

Kept dependency-free so every service module can import it without pulling in
`main` (which would be a circular import). The data-doc uid IS the user's phone
number by design (AUTH_SPEC §2), so any `... user {uid}` / `{phone}` log line
leaks PII in the clear — route those through `mask_phone` first.
"""


def mask_phone(value) -> str:
    """Redact a phone number (or phone-keyed uid) for logging — keep the last 4.

    >>> mask_phone("+15551234567")
    '***4567'
    >>> mask_phone(None)
    '***'
    """
    s = str(value or "")
    return f"***{s[-4:]}" if len(s) >= 4 else "***"


def mask_email(value) -> str:
    """Redact an email address for logging — keep the first char + domain.

    >>> mask_email("jane.doe@example.com")
    'j***@example.com'
    >>> mask_email("x")
    '***'
    """
    s = str(value or "")
    if "@" not in s:
        return "***"
    local, _, domain = s.partition("@")
    head = local[0] if local else ""
    return f"{head}***@{domain}"
