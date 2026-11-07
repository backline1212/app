from cryptography.fernet import Fernet

from app.core.config import get_settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(get_settings().integrations_encryption_key.encode())
    return _fernet


def encrypt_secret(value: str) -> str:
    """Application-layer encryption for values that must be recoverable (unlike
    hash_secret's one-way hashing) - OAuth tokens (17-Notifications-Integrations.md
    §17.3's `oauth_token_encrypted`), which the integration needs back in plaintext to
    call the third-party API. Never store `value` itself in Mongo, only this."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()


def chat_webhook_url(config: dict[str, object]) -> str:
    """A Slack/Discord/Teams integration's webhook URL - the credential itself. New
    integrations store it encrypted (TDR-0231); older rows still hold it in plain text."""
    encrypted = config.get("webhook_url_encrypted")
    if isinstance(encrypted, str):
        return decrypt_secret(encrypted)
    return str(config["webhook_url"])
