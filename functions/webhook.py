"""WhatsApp webhook (Twilio) — inbound message ingestion + inline commands.

Respond-First Pattern: link/image messages are queued into
`pending_processing` and answered 200 immediately; conversational commands
(digest controls, reminders) are handled inline.

`whatsapp_webhook` is re-exported from main.py so Firebase's entrypoint scan
still discovers it under the same deployed name.
"""

import os
import re
import json
import logging
from datetime import datetime, timezone

from firebase_functions import https_fn

from db import get_db
from models import WebhookPayload
from link_service import find_user_by_phone, is_hebrew
from reminder_service import handle_reminder_intent, set_reminder, format_local_time
from rate_limit import check_rate_limit, client_ip, _RATE_LIMITS

logger = logging.getLogger(__name__)


def _mask_phone(value) -> str:
    """Redact a phone number for logging — keep only the last 4 digits.

    Inbound WhatsApp numbers are PII; never log them in the clear.
    """
    s = str(value or "")
    return f"***{s[-4:]}" if len(s) >= 4 else "***"


def _verify_twilio_signature(request) -> bool:
    """Validate an inbound Twilio webhook via the X-Twilio-Signature header.

    Returns True if the signature is valid, OR if verification is not configured
    (no TWILIO_AUTH_TOKEN) so local/dev testing still works. Returns False only
    when a token IS configured and the signature is missing/invalid — which is
    how we reject spoofed webhooks (anyone could otherwise POST a victim's phone
    number and act as them).
    """
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not auth_token:
        # Fail CLOSED in production: an unsigned webhook lets anyone POST a
        # victim's phone number and act as them. Only allow the unverified path
        # under the local Functions emulator, never on deployed Cloud Run.
        if os.environ.get("FUNCTIONS_EMULATOR", "").lower() in ("1", "true", "yes"):
            logger.warning("TWILIO_AUTH_TOKEN not set — skipping signature check (emulator only)")
            return True
        logger.error("TWILIO_AUTH_TOKEN not set in production — rejecting webhook")
        return False

    from twilio.request_validator import RequestValidator
    validator = RequestValidator(auth_token)

    signature = request.headers.get("X-Twilio-Signature", "")
    # Twilio signs against the public HTTPS URL it posted to. Behind Cloud Run /
    # Hosting the internally-seen scheme can be http, so normalize to https.
    url = request.url
    if request.headers.get("X-Forwarded-Proto") == "https" and url.startswith("http://"):
        url = "https://" + url[len("http://"):]

    params = request.form.to_dict() if request.form else {}
    return validator.validate(url, params, signature)


@https_fn.on_request()
def whatsapp_webhook(request):
    """
    WhatsApp webhook endpoint.
    Respond-First Pattern: Saves to pending_processing and returns 200 immediately.
    """
    # whatsapp_handler pulls the Twilio SDK — imported lazily (see top-of-file note).
    from whatsapp_handler import send_whatsapp_message

    # Reject spoofed webhooks before doing any work (phone-number impersonation).
    if not _verify_twilio_signature(request):
        logger.warning("Rejected WhatsApp webhook: invalid/missing Twilio signature")
        return https_fn.Response(
            json.dumps({"error": "Forbidden"}), status=403, mimetype="application/json"
        )

    if check_rate_limit(f"whatsapp:{client_ip(request)}", *_RATE_LIMITS["whatsapp"]) is False:
        logger.warning("Rate limit exceeded: whatsapp:%s", client_ip(request))
        return https_fn.Response(
            json.dumps({"error": "Too many requests"}), status=429, mimetype="application/json"
        )

    try:
        if request.content_type == 'application/x-www-form-urlencoded':
            data = request.form.to_dict()
        else:
            data = request.get_json()

        # Do NOT log the raw payload — it carries the sender's phone number
        # (From) and full message body (PII). Log only routing metadata.
        logger.info(
            "Received webhook payload (sid=%s, num_media=%s, fields=%d)",
            (data or {}).get("MessageSid") or (data or {}).get("SmsMessageSid") or "?",
            (data or {}).get("NumMedia", "0"),
            len(data) if isinstance(data, dict) else 0,
        )
        payload = WebhookPayload(**data)
    except Exception as e:
        logger.error(f"Payload parse error: {e}")
        return https_fn.Response(json.dumps({"error": "Invalid payload"}), status=400, mimetype="application/json")

    db = get_db()

    # Find user by phone number
    uid = find_user_by_phone(payload.from_number)

    # Normalize UID
    if uid and uid.startswith("whatsapp:"):
        uid = uid.replace("whatsapp:", "")

    # Detect language from incoming message
    user_msg_is_hebrew = is_hebrew(payload.body)

    if not uid:
        logger.warning(f"Unauthorized number: {_mask_phone(payload.from_number)}")
        msg = "❌ מצטערים, מספר הטלפון שלך לא מזוהה. אנא וודא שהוא תואם להגדרות." if user_msg_is_hebrew else "❌ Sorry, your phone number is not recognized. Please make sure it matches the number in your Machina AI settings."
        send_whatsapp_message(payload.from_number, msg)
        return https_fn.Response(json.dumps({"error": "User not found"}), status=403, mimetype="application/json")

    # Extract URL from message body
    url_match = re.search(r'https?://[^\s]+', payload.body)

    # 1. Image Support: Check if media is attached
    if payload.num_media > 0 and payload.media_url0:
        logger.info(f"Media detected: {payload.media_url0} (Type: {payload.media_content_type0})")

        process_ref = db.collection('pending_processing').document()
        process_ref.set({
            "uid": uid,
            "url": payload.media_url0,
            "mimeType": payload.media_content_type0,
            "fromNumber": payload.from_number,
            "body": payload.body,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": "queued",
            "isImage": True,
            "attempts": 0
        })
        return https_fn.Response(json.dumps({"success": True, "queued": True, "id": process_ref.id}), status=200, mimetype="application/json")

    if not url_match:
        # Handling conversational commands (Reminders)
        logger.info("No URL found, checking for commands")

        msg_lower = payload.body.lower().strip()

        # Digest controls over WhatsApp: pause / resume the curated digest.
        if msg_lower in ("stop digest", "pause digest", "digest off"):
            db.collection('users').document(uid).set(
                {"settings": {"digest_enabled": False}}, merge=True
            )
            msg = ("✅ Digest paused. Reply *START DIGEST* to turn it back on, "
                   "or manage it anytime in Settings.")
            if user_msg_is_hebrew:
                msg = "✅ הדייג'סט הושהה. השב/י *START DIGEST* כדי להפעיל מחדש."
            send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        if msg_lower in ("start digest", "resume digest", "digest on"):
            db.collection('users').document(uid).set(
                {"settings": {"digest_enabled": True}}, merge=True
            )
            msg = "✅ Digest resumed. You'll get your curated cards on schedule."
            if user_msg_is_hebrew:
                msg = "✅ הדייג'סט חזר לפעול. תקבל/י כרטיסים נבחרים לפי לוח הזמנים."
            send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        if msg_lower in ("digest", "digest now", "דייג'סט"):
            # On-demand digest. Since the request came over WhatsApp, always
            # reply over WhatsApp regardless of the user's configured channels.
            from digest_service import build_and_send_digest
            user_doc = db.collection('users').document(uid).get()
            user_data = user_doc.to_dict() or {}
            user_data["settings"] = {**user_data.get("settings", {}), "digest_channels": ["whatsapp"]}
            res = build_and_send_digest(uid, user_data, force=True)
            if not res.get("sent"):
                msg = ("📭 אין עדיין מה לאסוף — שמור/י כמה לינקים קודם!" if user_msg_is_hebrew
                       else "📭 Nothing to curate yet — save a few links first!")
                send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"success": True, **res}), status=200, mimetype="application/json")

        if msg_lower == "reminder" or msg_lower == "תזכורת":
            is_he = (msg_lower == "תזכורת") or user_msg_is_hebrew
            if is_he:
                menu = "מתי להזכיר לך?\nהשב/י עם מספר הימים — *1*, *2*, *3* או *7*\nאו *S* לחזרה מרווחת (spaced repetition)"
            else:
                menu = "When should I remind you?\nReply with the number of days — *1*, *2*, *3* or *7*\nOr *S* for spaced repetition"
            send_whatsapp_message(payload.from_number, menu)
            return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

        reminder_time = handle_reminder_intent(payload.body)

        if reminder_time:
            user_doc = db.collection('users').document(uid).get()
            last_link_id = user_doc.to_dict().get('lastSavedLinkId')
            if last_link_id:
                link_doc = db.collection('users').document(uid).collection('links').document(last_link_id).get()
                if link_doc.exists:
                    reply = payload.body.strip().lower()
                    is_spaced = reply in ("s", "spaced")
                    profile = "spaced" if is_spaced else "once"
                    set_reminder(uid, last_link_id, reminder_time, profile=profile)

                    link_data = link_doc.to_dict()
                    title = link_data.get('title', 'Unknown Link')
                    category = link_data.get('category', 'General')

                    user_tz = user_doc.to_dict().get('timezone')
                    date_str = format_local_time(reminder_time, user_tz, user_msg_is_hebrew)

                    if user_msg_is_hebrew:
                        extra = "\n🔁 חזרה מרווחת — אזכיר שוב בהמשך" if is_spaced else ""
                        change = "\n\n_טעית במספר? השב/י מספר אחר (1/2/3/7) או S לעדכון._"
                        msg = f"⏰ *התזכורת נקבעה*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}{extra}{change}"
                    else:
                        extra = "\n🔁 Spaced repetition — I'll keep nudging you" if is_spaced else ""
                        change = "\n\n_Wrong number? Reply a different one (1/2/3/7) or S to change it._"
                        msg = f"⏰ *Reminder Set*\n\n📄 *{title}*\n📂 {category}\n📅 {date_str}{extra}{change}"

                    send_whatsapp_message(payload.from_number, msg)
                    return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

            msg = "❌ לא נמצא לינק קודם. שלח לינק קודם!" if user_msg_is_hebrew else "❌ No previous link found. Send a link first!"
            send_whatsapp_message(payload.from_number, msg)
            return https_fn.Response(json.dumps({"error": "No context"}), status=200, mimetype="application/json")

        msg = "אני יכול לשמור לינקים או לקבוע תזכורות. נסה לשלוח לינק!" if user_msg_is_hebrew else "I can save links or set reminders. Try sending a URL!"
        send_whatsapp_message(payload.from_number, msg)
        return https_fn.Response(json.dumps({"success": True}), status=200, mimetype="application/json")

    # URL FOUND -> Save to pending_processing for Background Processing
    url = url_match.group(0)
    logger.info(f"Queueing URL for processing: {url}")

    process_ref = db.collection('pending_processing').document()
    process_ref.set({
        "uid": uid,
        "url": url,
        "fromNumber": payload.from_number,
        "body": payload.body,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "attempts": 0
    })

    return https_fn.Response(json.dumps({"success": True, "queued": True, "id": process_ref.id}), status=200, mimetype="application/json")
