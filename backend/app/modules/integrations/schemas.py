import re
from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.ssrf_guard import is_public_hostname_literal

IntegrationType = Literal[
    "slack",
    "discord",
    "teams",
    "webhook",
    "clickup",
    "trello",
    "jira",
    "asana",
    "github",
    "gitlab",
    "linear",
]
IntegrationKind = Literal["notifier", "tracker"]
AuthMode = Literal["webhook", "api_token", "oauth"]

_TEAMS_HOST_SUFFIXES = (
    "logic.azure.com",
    "powerplatform.com",
    "powerautomate.com",
    "webhook.office.com",
)
_DISCORD_HOSTS = {"discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"}
_GITHUB_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _host_matches(host: str, suffix: str) -> bool:
    return host == suffix or host.endswith("." + suffix)


def _normalized_https_origin(value: str, *, label: str) -> str:
    """`https://host[/path]` without a trailing slash - accepts a bare host too, since
    that's what people copy out of a browser's address bar."""
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    parsed = urlsplit(candidate)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError(f"{label} must be an https:// address.")
    if not is_public_hostname_literal(parsed.hostname):
        raise ValueError(f"{label} must be a public address.")
    return f"https://{parsed.netloc}{parsed.path}".rstrip("/")


class _NotifyToggles(BaseModel):
    notify_status_changes: bool = True
    # 17.2: "team-only comments never post to a shared Slack channel unless the admin
    # explicitly configures a private channel" - there's no way to detect from a webhook
    # URL alone whether the channel behind it is private, so this is an explicit opt-in
    # the connect-flow UI must warn about, not an automatic detection.
    notify_team_layer: bool = False
    notify_project_updates: bool = True


class SlackIntegrationCreate(_NotifyToggles):
    type: Literal["slack"] = "slack"
    webhook_url: str = Field(min_length=1)

    @field_validator("webhook_url")
    @classmethod
    def webhook_must_be_slack(cls, value: str) -> str:
        # SSRF guard: without this, the backend will POST to any URL an admin (or
        # anyone with integration:manage) supplies, both at connect-test time and on
        # every future comment/status event - this is a real outbound request the
        # server makes, not something the browser makes on the user's behalf.
        parsed = urlsplit(value)
        if parsed.scheme != "https" or parsed.hostname != "hooks.slack.com":
            raise ValueError("Webhook URL must be a real https://hooks.slack.com/... URL.")
        return value


class DiscordIntegrationCreate(_NotifyToggles):
    type: Literal["discord"] = "discord"
    webhook_url: str = Field(min_length=1)

    @field_validator("webhook_url")
    @classmethod
    def webhook_must_be_discord(cls, value: str) -> str:
        parsed = urlsplit(value.strip())
        if (
            parsed.scheme != "https"
            or parsed.hostname not in _DISCORD_HOSTS
            or not parsed.path.startswith("/api/webhooks/")
        ):
            raise ValueError("Webhook URL must be a https://discord.com/api/webhooks/... URL.")
        return value.strip()


class TeamsIntegrationCreate(_NotifyToggles):
    type: Literal["teams"] = "teams"
    webhook_url: str = Field(min_length=1)

    @field_validator("webhook_url")
    @classmethod
    def webhook_must_be_microsoft(cls, value: str) -> str:
        parsed = urlsplit(value.strip())
        host = parsed.hostname or ""
        is_microsoft = any(_host_matches(host, s) for s in _TEAMS_HOST_SUFFIXES)
        if parsed.scheme != "https" or not is_microsoft:
            raise ValueError(
                "Webhook URL must be a Teams Workflows (Power Automate) or Teams "
                "incoming-webhook URL."
            )
        return value.strip()


class WebhookIntegrationCreate(_NotifyToggles):
    type: Literal["webhook"] = "webhook"
    url: str = Field(min_length=1, max_length=2000)
    # Optional: supply your own to match an existing receiver; otherwise one is
    # generated and shown once in the create response (IntegrationOut.signing_secret).
    secret: str | None = Field(default=None, min_length=16, max_length=200)

    @field_validator("url")
    @classmethod
    def url_must_be_public_https(cls, value: str) -> str:
        parsed = urlsplit(value.strip())
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("Webhook URL must be an https:// address.")
        if parsed.hostname == "localhost" or not is_public_hostname_literal(parsed.hostname):
            raise ValueError("Webhook URL must be a public address.")
        return value.strip()


class TrelloIntegrationCreate(BaseModel):
    type: Literal["trello"] = "trello"
    api_key: str = Field(min_length=1)
    token: str = Field(min_length=1)
    # Optional since the destination picker: choose the list after connecting
    # (PATCH /integrations/{id}). Still accepted here for API callers that know it.
    list_id: str | None = None


class ClickUpIntegrationCreate(BaseModel):
    """Either an OAuth `code` (needs the operator's ClickUp OAuth app) or a personal
    API token (`pk_...`, from ClickUp Settings -> Apps) - exactly one."""

    type: Literal["clickup"] = "clickup"
    oauth_code: str | None = Field(default=None, min_length=1)
    api_token: str | None = Field(default=None, min_length=1)
    list_id: str | None = None

    @model_validator(mode="after")
    def one_credential(self) -> "ClickUpIntegrationCreate":
        if bool(self.oauth_code) == bool(self.api_token):
            raise ValueError("Provide either an OAuth code or a personal API token.")
        return self


class JiraIntegrationCreate(BaseModel):
    """Either an OAuth `code` (needs the operator's Atlassian OAuth app) or the site
    URL + account email + API token (id.atlassian.com -> Security -> API tokens)."""

    type: Literal["jira"] = "jira"
    oauth_code: str | None = Field(default=None, min_length=1)
    site_url: str | None = None
    email: str | None = Field(default=None, max_length=320)
    api_token: str | None = Field(default=None, min_length=1)
    project_key: str | None = None

    @field_validator("site_url")
    @classmethod
    def site_must_be_jira_cloud(cls, value: str | None) -> str | None:
        if value is None:
            return None
        origin = _normalized_https_origin(value, label="Jira site URL")
        host = urlsplit(origin).hostname or ""
        if not (_host_matches(host, "atlassian.net") or _host_matches(host, "jira.com")):
            raise ValueError("Jira site URL must look like https://your-team.atlassian.net.")
        return f"https://{host}"

    @model_validator(mode="after")
    def one_credential(self) -> "JiraIntegrationCreate":
        token_mode = bool(self.api_token or self.email or self.site_url)
        if bool(self.oauth_code) == token_mode:
            raise ValueError(
                "Provide either an OAuth code, or a site URL, account email and API token."
            )
        if token_mode and not (self.api_token and self.email and self.site_url):
            raise ValueError("A Jira API token needs the site URL and the account email too.")
        return self


class AsanaIntegrationCreate(BaseModel):
    """Either an OAuth `code` (needs the operator's Asana OAuth app) or a personal
    access token (Asana -> My settings -> Apps -> Developer apps)."""

    type: Literal["asana"] = "asana"
    oauth_code: str | None = Field(default=None, min_length=1)
    access_token: str | None = Field(default=None, min_length=1)
    project_gid: str | None = None

    @model_validator(mode="after")
    def one_credential(self) -> "AsanaIntegrationCreate":
        if bool(self.oauth_code) == bool(self.access_token):
            raise ValueError("Provide either an OAuth code or a personal access token.")
        return self


class GitHubIntegrationCreate(BaseModel):
    type: Literal["github"] = "github"
    token: str = Field(min_length=1)
    repository: str | None = None

    @field_validator("repository")
    @classmethod
    def repository_is_owner_slash_name(cls, value: str | None) -> str | None:
        if value is not None and not _GITHUB_REPOSITORY.match(value):
            raise ValueError("Repository must look like owner/name.")
        return value


class GitLabIntegrationCreate(BaseModel):
    type: Literal["gitlab"] = "gitlab"
    token: str = Field(min_length=1)
    base_url: str = "https://gitlab.com"
    project_id: str | None = None

    @field_validator("base_url")
    @classmethod
    def base_url_is_https(cls, value: str) -> str:
        return _normalized_https_origin(value, label="GitLab URL")


class LinearIntegrationCreate(BaseModel):
    type: Literal["linear"] = "linear"
    api_key: str = Field(min_length=1)
    team_id: str | None = None


IntegrationCreate = Annotated[
    SlackIntegrationCreate
    | DiscordIntegrationCreate
    | TeamsIntegrationCreate
    | WebhookIntegrationCreate
    | TrelloIntegrationCreate
    | ClickUpIntegrationCreate
    | JiraIntegrationCreate
    | AsanaIntegrationCreate
    | GitHubIntegrationCreate
    | GitLabIntegrationCreate
    | LinearIntegrationCreate,
    Field(discriminator="type"),
]


class IntegrationUpdate(BaseModel):
    """Everything about a connection that can change without reconnecting. Toggles
    apply to notifiers, `destination_id` to trackers (one of the ids returned by
    GET /integrations/{id}/destinations)."""

    destination_id: str | None = Field(default=None, min_length=1, max_length=300)
    notify_status_changes: bool | None = None
    notify_team_layer: bool | None = None
    notify_project_updates: bool | None = None


class IntegrationOut(BaseModel):
    id: str
    workspace_id: str
    type: IntegrationType
    # Never the secret (webhook_url, api_key/token, oauth_token_encrypted) - just enough
    # non-sensitive config to render the connected state in the UI.
    config_summary: dict[str, Any]
    connected_by: str
    created_at: datetime
    kind: IntegrationKind = "notifier"
    auth_mode: AuthMode = "webhook"
    destination_id: str | None = None
    destination_label: str | None = None
    # A tracker connected without choosing where tickets go yet - "Send to" stays
    # unavailable until PATCH /integrations/{id} sets one.
    needs_destination: bool = False
    # Only in the create response of a `webhook` integration, and only once: the
    # receiver needs it to verify X-Backline-Signature, and it's never shown again.
    signing_secret: str | None = None


class DestinationOut(BaseModel):
    id: str
    name: str
    group: str | None = None


class IntegrationTestResult(BaseModel):
    ok: bool
    message: str


class OAuthAppOut(BaseModel):
    """An OAuth connect option the operator has configured (client id and secret both
    set). The frontend appends its own anti-CSRF `state` to `authorize_url`."""

    type: Literal["clickup", "jira", "asana"]
    authorize_url: str


class ExternalLinkOut(BaseModel):
    """A ticket filed in a tracker from a Backline comment. Member-only: never part of
    CommentOut, which guests and the guest realtime channel also receive."""

    id: str
    comment_id: str
    integration_id: str
    type: IntegrationType
    external_id: str
    url: str
    created_by: str
    created_at: datetime


class CreateClickUpTaskResult(BaseModel):
    task_url: str
    task_id: str


class CreateTrelloCardResult(BaseModel):
    card_url: str
    card_id: str


class CreateJiraIssueResult(BaseModel):
    issue_url: str
    issue_key: str


class CreateAsanaTaskResult(BaseModel):
    task_url: str
    task_id: str
