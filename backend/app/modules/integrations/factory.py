from app.modules.integrations.asana import AsanaIntegration
from app.modules.integrations.base import Integration
from app.modules.integrations.clickup import ClickUpIntegration
from app.modules.integrations.jira import JiraIntegration
from app.modules.integrations.slack import SlackIntegration
from app.modules.integrations.trello import TrelloIntegration

_REGISTRY: dict[str, type[Integration]] = {
    "slack": SlackIntegration,
    "clickup": ClickUpIntegration,
    "trello": TrelloIntegration,
    "jira": JiraIntegration,
    "asana": AsanaIntegration,
}


def get_integration(integration_type: str) -> Integration:
    """17.1: adding Asana later (§17.5) means adding one class here - never touching
    dispatch/service code that calls this factory."""
    integration_cls = _REGISTRY.get(integration_type)
    if integration_cls is None:
        raise ValueError(f"Unknown integration type: {integration_type}")
    return integration_cls()
