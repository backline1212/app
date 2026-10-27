import logging
from typing import Any

from app.core.db import get_db
from app.modules.billing.renewal_reminders import send_renewal_reminders

logger = logging.getLogger("backline.renewal_reminders")


async def send_renewal_reminders_job(ctx: dict[str, Any]) -> int:
    """Hourly: owners hear 7 days and 1 day before a prepaid plan ends (TDR-0222)."""
    sent = await send_renewal_reminders(get_db())
    if sent:
        logger.info("Sent %d renewal reminder(s)", sent)
    return sent
