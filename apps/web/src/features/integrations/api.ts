import type { Schemas } from "@backline/types";

import { apiFetch } from "../../lib/api-client";

export type IntegrationOut = Schemas["IntegrationOut"];
export type IntegrationType = IntegrationOut["type"];
export type IntegrationUpdate = Schemas["IntegrationUpdate"];
export type DestinationOut = Schemas["DestinationOut"];
export type IntegrationTestResult = Schemas["IntegrationTestResult"];
export type OAuthAppOut = Schemas["OAuthAppOut"];
export type ExternalLinkOut = Schemas["ExternalLinkOut"];
export type CreateClickUpTaskResult = Schemas["CreateClickUpTaskResult"];
export type CreateTrelloCardResult = Schemas["CreateTrelloCardResult"];
export type CreateJiraIssueResult = Schemas["CreateJiraIssueResult"];
export type CreateAsanaTaskResult = Schemas["CreateAsanaTaskResult"];

/** Any provider's connect body - the backend's discriminated union on `type`. */
export type IntegrationCreate =
  | Schemas["SlackIntegrationCreate"]
  | Schemas["DiscordIntegrationCreate"]
  | Schemas["TeamsIntegrationCreate"]
  | Schemas["WebhookIntegrationCreate"]
  | Schemas["TrelloIntegrationCreate"]
  | Schemas["ClickUpIntegrationCreate"]
  | Schemas["JiraIntegrationCreate"]
  | Schemas["AsanaIntegrationCreate"]
  | Schemas["GitHubIntegrationCreate"]
  | Schemas["GitLabIntegrationCreate"]
  | Schemas["LinearIntegrationCreate"];

export function listIntegrations(workspaceId: string): Promise<IntegrationOut[]> {
  return apiFetch<IntegrationOut[]>(`/api/v1/workspaces/${workspaceId}/integrations`);
}

export function connectIntegration(workspaceId: string, body: IntegrationCreate): Promise<IntegrationOut> {
  return apiFetch<IntegrationOut>(`/api/v1/workspaces/${workspaceId}/integrations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listOAuthApps(): Promise<OAuthAppOut[]> {
  return apiFetch<OAuthAppOut[]>("/api/v1/integrations/oauth-apps");
}

export function updateIntegration(integrationId: string, patch: IntegrationUpdate): Promise<IntegrationOut> {
  return apiFetch<IntegrationOut>(`/api/v1/integrations/${integrationId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function listDestinations(integrationId: string): Promise<DestinationOut[]> {
  return apiFetch<DestinationOut[]>(`/api/v1/integrations/${integrationId}/destinations`);
}

export function testIntegration(integrationId: string): Promise<IntegrationTestResult> {
  return apiFetch<IntegrationTestResult>(`/api/v1/integrations/${integrationId}/test`, { method: "POST" });
}

export function disconnectIntegration(integrationId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/integrations/${integrationId}`, { method: "DELETE" });
}

/** File a comment in a connected tracker. Idempotent per (comment, connection). */
export function sendToTracker(commentId: string, integrationId: string): Promise<ExternalLinkOut> {
  return apiFetch<ExternalLinkOut>(`/api/v1/comments/${commentId}/integrations/${integrationId}/send`, {
    method: "POST",
  });
}

export function listCommentLinks(commentId: string): Promise<ExternalLinkOut[]> {
  return apiFetch<ExternalLinkOut[]>(`/api/v1/comments/${commentId}/integration-links`);
}

// OAuth callback pages finish the connection with the code the provider sent back.

export function connectClickUp(workspaceId: string, options: { oauthCode: string; listId?: string }) {
  return connectIntegration(workspaceId, {
    type: "clickup",
    oauth_code: options.oauthCode,
    list_id: options.listId || null,
  });
}

export function connectJira(workspaceId: string, options: { oauthCode: string; projectKey?: string }) {
  return connectIntegration(workspaceId, {
    type: "jira",
    oauth_code: options.oauthCode,
    project_key: options.projectKey || null,
  });
}

export function connectAsana(workspaceId: string, options: { oauthCode: string; projectGid?: string }) {
  return connectIntegration(workspaceId, {
    type: "asana",
    oauth_code: options.oauthCode,
    project_gid: options.projectGid || null,
  });
}

// The per-provider create endpoints the Board page still uses.

export function createClickUpTask(commentId: string, integrationId: string): Promise<CreateClickUpTaskResult> {
  return apiFetch<CreateClickUpTaskResult>(
    `/api/v1/comments/${commentId}/integrations/clickup/create-task?integration_id=${integrationId}`,
    { method: "POST" },
  );
}

export function createTrelloCard(commentId: string, integrationId: string): Promise<CreateTrelloCardResult> {
  return apiFetch<CreateTrelloCardResult>(
    `/api/v1/comments/${commentId}/integrations/trello/create-card?integration_id=${integrationId}`,
    { method: "POST" },
  );
}

export function createJiraIssue(commentId: string, integrationId: string): Promise<CreateJiraIssueResult> {
  return apiFetch<CreateJiraIssueResult>(
    `/api/v1/comments/${commentId}/integrations/jira/create-issue?integration_id=${integrationId}`,
    { method: "POST" },
  );
}

export function createAsanaTask(commentId: string, integrationId: string): Promise<CreateAsanaTaskResult> {
  return apiFetch<CreateAsanaTaskResult>(
    `/api/v1/comments/${commentId}/integrations/asana/create-task?integration_id=${integrationId}`,
    { method: "POST" },
  );
}
