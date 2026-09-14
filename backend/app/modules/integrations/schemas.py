from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

IntegrationType = Literal["slack", "clickup", "trello", "jira", "asana"]


class SlackIntegrationCreate(BaseModel):
    type: Literal["slack"] = "slack"
    webhook_url: str = Field(min_length=1)
    notify_status_changes: bool = True

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

    # 17.2: "team-only comments never post to a shared Slack channel unless the admin
    # explicitly configures a private channel" - there's no way to detect from a webhook
    # URL alone whether the channel behind it is private, so this is an explicit opt-in
    # the connect-flow UI must warn about, not an automatic detection.
    notify_team_layer: bool = False


class TrelloIntegrationCreate(BaseModel):
    type: Literal["trello"] = "trello"
    api_key: str = Field(min_length=1)
    token: str = Field(min_length=1)
    list_id: str = Field(min_length=1)


class ClickUpIntegrationCreate(BaseModel):
    type: Literal["clickup"] = "clickup"
    oauth_code: str = Field(min_length=1)
    list_id: str = Field(min_length=1)


class JiraIntegrationCreate(BaseModel):
    type: Literal["jira"] = "jira"
    oauth_code: str = Field(min_length=1)
    project_key: str = Field(min_length=1)


class AsanaIntegrationCreate(BaseModel):
    type: Literal["asana"] = "asana"
    oauth_code: str = Field(min_length=1)
    project_gid: str = Field(min_length=1)


IntegrationCreate = Annotated[
    SlackIntegrationCreate
    | TrelloIntegrationCreate
    | ClickUpIntegrationCreate
    | JiraIntegrationCreate
    | AsanaIntegrationCreate,
    Field(discriminator="type"),
]


class IntegrationOut(BaseModel):
    id: str
    workspace_id: str
    type: IntegrationType
    # Never the secret (webhook_url, api_key/token, oauth_token_encrypted) - just enough
    # non-sensitive config to render the connected state in the UI.
    config_summary: dict[str, Any]
    connected_by: str
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
