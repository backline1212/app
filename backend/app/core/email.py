import asyncio
import logging

import httpx

from app.core.config import get_settings
from app.core.errors import ExternalServiceError

logger = logging.getLogger("backline.email")


async def send_email(
    *, to: str, subject: str, html: str, idempotency_key: str | None = None
) -> None:
    """Report success only after a provider accepts the email (except local mode)."""
    settings = get_settings()

    # Priority 1: Google Apps Script Web App (Staging fallback)
    if settings.google_apps_script_url and not (idempotency_key and settings.resend_api_key):
        try:
            async with asyncio.timeout(20), httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    settings.google_apps_script_url,
                    json={
                        "to": to,
                        "subject": subject,
                        "html": html,
                        "secret": settings.google_apps_script_secret,
                        **({"idempotency_key": idempotency_key} if idempotency_key else {}),
                    },
                    follow_redirects=True,
                )
                response.raise_for_status()
                res_data = response.json()
                if res_data.get("status") != "success":
                    message = res_data.get("message", "Unknown error from Google Apps Script")
                    raise Exception(message)
                logger.info("Email accepted by Google Apps Script")
                return
        except Exception as e:
            # Fall through to Resend (Priority 2) instead of re-raising - previously a
            # Google Apps Script outage took down all email (OTP codes, invites) even
            # when Resend was also configured, silently defeating the intended fallback
            # chain the "Priority 1/2/3" comments here describe.
            # Provider errors can include request bodies, tokens and inbox addresses.
            logger.warning("Google Apps Script email failed (%s)", type(e).__name__)

    # Priority 2: Resend (Production standard)
    if settings.resend_api_key:
        try:
            headers = {"Authorization": f"Bearer {settings.resend_api_key}"}
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key
            # The pinned SDK sends requests without a timeout. Bounded async HTTP
            # prevents a stalled provider from outliving a notification worker lease.
            async with asyncio.timeout(20), httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers=headers,
                    json={
                        "from": settings.resend_from_address,
                        "to": [to],
                        "subject": subject,
                        "html": html,
                    },
                )
                response.raise_for_status()
                accepted = response.json()
                if not isinstance(accepted, dict) or not accepted.get("id"):
                    raise ValueError("Email provider did not return an accepted message ID.")
            return
        except Exception as e:
            logger.warning("Resend email failed (%s)", type(e).__name__)
            raise ExternalServiceError(
                "Email could not be sent. Please try again shortly."
            ) from None

    # An explicitly local environment may use inbox logs; never hide an actual
    # configured-provider outage behind this development convenience.
    if settings.environment == "local" and not settings.google_apps_script_url:
        logger.warning("Local-only email preview: to=%s subject=%s\n%s", to, subject, html)
        return
    raise ExternalServiceError("Email is currently unavailable. Please try again shortly.")
