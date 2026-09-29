from app.modules.integrations.asana import AsanaIntegration
from app.modules.integrations.base import IntegrationContext, Notifier, Tracker
from app.modules.integrations.clickup import ClickUpIntegration
from app.modules.integrations.discord import DiscordIntegration
from app.modules.integrations.github import GitHubIntegration
from app.modules.integrations.gitlab import GitLabIntegration
from app.modules.integrations.jira import JiraIntegration
from app.modules.integrations.linear import LinearIntegration
from app.modules.integrations.slack import SlackIntegration
from app.modules.integrations.teams import TeamsIntegration
from app.modules.integrations.trello import TrelloIntegration
from app.modules.integrations.webhook import WebhookIntegration

# Post automatically on comment/status/project events (dispatched through Arq, with
# §17.7's retry schedule).
_NOTIFIERS: dict[str, type[Notifier]] = {
    "slack": SlackIntegration,
    "discord": DiscordIntegration,
    "teams": TeamsIntegration,
    "webhook": WebhookIntegration,
}

# File a ticket on a member's request ("Send to Jira"), into one chosen destination.
_TRACKERS: dict[str, type[Tracker]] = {
    "clickup": ClickUpIntegration,
    "trello": TrelloIntegration,
    "jira": JiraIntegration,
    "asana": AsanaIntegration,
    "github": GitHubIntegration,
    "gitlab": GitLabIntegration,
    "linear": LinearIntegration,
}

NOTIFIER_TYPES = tuple(_NOTIFIERS)
TRACKER_TYPES = tuple(_TRACKERS)


def get_notifier(integration_type: str) -> Notifier:
    notifier_cls = _NOTIFIERS.get(integration_type)
    if notifier_cls is None:
        raise ValueError(f"Not a notification integration: {integration_type}")
    return notifier_cls()


def get_tracker(integration_type: str) -> Tracker:
    tracker_cls = _TRACKERS.get(integration_type)
    if tracker_cls is None:
        raise ValueError(f"Not a ticket-tracker integration: {integration_type}")
    return tracker_cls()


async def test_connection(integration_type: str, ctx: IntegrationContext) -> bool:
    """17.1: adding a provider means one class in one registry above - never a change
    to dispatch/service code that calls this factory."""
    if integration_type in _NOTIFIERS:
        return await get_notifier(integration_type).test_connection(ctx)
    return await get_tracker(integration_type).test_connection(ctx)
