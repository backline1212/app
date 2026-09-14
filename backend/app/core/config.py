from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Dev-only default secrets. Must never be reachable outside `environment == "local"` -
# see Settings.check_production_secrets below.
_DEV_JWT_SIGNING_KEY = "dev-only-change-me"
_DEV_INTEGRATIONS_ENCRYPTION_KEY = "3BlglP1BAPCTRMmqdD-QptnHVoxDjZpU0p6dhbXEVmg="


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "local"

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "backline_local"
    redis_url: str = "redis://localhost:6379"

    r2_account_id: str = "local"
    r2_access_key_id: str = "backline-local"
    r2_secret_access_key: str = "backline-local-secret"
    r2_bucket_name: str = "backline-local"
    r2_endpoint_url: str = "http://localhost:9000"
    r2_region: str = "auto"

    jwt_signing_key: str = _DEV_JWT_SIGNING_KEY
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:5173/auth/callback"

    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5

    resend_api_key: str = ""
    resend_from_address: str = "Backline <onboarding@backline.app>"

    google_apps_script_url: str = ""
    google_apps_script_secret: str = ""

    clickup_oauth_client_id: str = ""
    clickup_oauth_client_secret: str = ""
    clickup_oauth_redirect_uri: str = "http://localhost:5173/integrations/clickup/callback"

    jira_oauth_client_id: str = ""
    jira_oauth_client_secret: str = ""
    jira_oauth_redirect_uri: str = "http://localhost:5173/integrations/jira/callback"

    asana_oauth_client_id: str = ""
    asana_oauth_client_secret: str = ""
    asana_oauth_redirect_uri: str = "http://localhost:5173/integrations/asana/callback"

    # Fernet key (32 url-safe base64-encoded bytes) for encrypting OAuth tokens at the
    # application layer before they reach Mongo (Rule 6, §17.3's "encrypted at the
    # application layer" requirement) - `Fernet.generate_key()` for a real one.
    integrations_encryption_key: str = _DEV_INTEGRATIONS_ENCRYPTION_KEY

    cors_allow_origins: list[str] = ["http://localhost:5173"]

    guest_token_ttl_days: int = 30
    review_resolve_rate_limit_per_minute: int = 30
    guest_session_rate_limit_per_minute: int = 10
    proxy_rate_limit_per_minute: int = 300

    # Milestone 11 rate-limiting audit (docs/tdr/0010): every write endpoint reachable
    # by an unauthenticated guest session needs its own budget, not just the
    # session-creation/resolve endpoints already covered - otherwise a guest token is a
    # free pass to spam comments, pages, snapshots, or presigned upload URLs.
    otp_request_rate_limit_per_minute: int = 5
    page_register_rate_limit_per_minute: int = 30
    snapshot_submit_rate_limit_per_minute: int = 30
    comment_create_rate_limit_per_minute: int = 20
    upload_rate_limit_per_minute: int = 20
    # Real per-engine headless-browser renders are actual CPU/memory cost, unlike the
    # writes above - kept deliberately low so one workspace can't queue enough
    # concurrent Playwright launches to starve the single worker process (see
    # app/workers/main.py's note on why there's exactly one).
    browser_render_rate_limit_per_minute: int = 6

    # Where a reviewer's browser can reach this API from - used to build the absolute
    # widget script src/apiBaseUrl injected server-side in proxy mode
    # (03-System-Architecture.md §3.3), since there's no agency-authored <script> tag to
    # carry that information the way there is in snippet mode.
    public_api_base_url: str = "http://localhost:8000"
    # The dashboard's own origin - used to build backlinks from a ClickUp task/Trello
    # card back to the comment's Board (17.3's "deep link back to the comment's pin").
    public_dashboard_base_url: str = "http://localhost:5173"

    # Milestone 12 (docs/tdr/0011): error tracking. Empty means disabled - same
    # credential-gated-no-op pattern as every other optional integration in this file
    # (RESEND_API_KEY, GOOGLE_OAUTH_CLIENT_ID, ...), since no real Sentry project exists
    # for this build.
    sentry_dsn: str = ""

    @model_validator(mode="after")
    def check_production_secrets(self) -> "Settings":
        if self.environment != "local":
            if self.jwt_signing_key == _DEV_JWT_SIGNING_KEY:
                raise ValueError(
                    "JWT_SIGNING_KEY is unset (using the dev-only default) outside a "
                    "local environment. Set a real, secret value before starting the app."
                )
            if self.integrations_encryption_key == _DEV_INTEGRATIONS_ENCRYPTION_KEY:
                raise ValueError(
                    "INTEGRATIONS_ENCRYPTION_KEY is unset (using the committed dev-only "
                    "default) outside a local environment. Set a real, secret Fernet key "
                    "before starting the app - `Fernet.generate_key()` to generate one."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
