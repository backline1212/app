# Backend and API implementation plan

This is the original Final Draft implementation plan. Check the
[current inventory](pending-backlog-2026-10-24.md) and
[delivery ledger](06-delivery.md) for later source, rollout and acceptance
status before treating planned routes or provider behavior as unfinished.

## Boundaries

Keep FastAPI routers thin; services authorize/validate/orchestrate; repositories alone query MongoDB. Reuse `Session`, `require_permission`, `require_workspace_match`, typed errors, events and Redis channels. Add `clients` and `dashboard` modules; dashboard composes read models for project summaries, workspace tickets and activity rather than implementing a second comment system.

## Planned contract

All routes use `/api/v1` and authenticated workspace membership unless explicitly marked guest.

| Route | Purpose |
|---|---|
| GET/POST `/workspaces/{id}/clients` | Scoped client listing/creation |
| PATCH/DELETE `/workspaces/{id}/clients/{client_id}` | Contact update/soft archive |
| GET `/workspaces/{id}/dashboard` | Project/thread/assignment/status aggregates |
| GET `/workspaces/{id}/tickets` | Paginated root comments with project/page context and filters |
| POST `/projects/{id}/tickets` | Standalone project ticket |
| GET `/workspaces/{id}/activity` | Paginated safe event projection |
| GET `/workspaces/{id}/projects?include_archived=true` | Existing project list extended |
| PATCH `/projects/{id}` | Name/origin/environment/client changes |
| POST `/projects/{id}/restore` | Reversible archive |
| PATCH `/comments/{id}` | Existing comment moderation extended with workflow metadata |

Schemas are the API source of truth. Keep old required fields/routes valid; explicitly document compatibility projections. Reject malformed IDs/foreign resources before mutations. Requested lists are bounded (limit <= 100; deterministic created_at/_id tie-break). Match workspace/project/page/deleted/parent scopes before paging; lookup only metadata for the returned page. Member IDs are validated against memberships before persistence and assignment notification.

## Security and semantics

The authenticated workspace ID must match URL context. Dashboard/ticket/client/activity APIs are member-only. Guests keep the existing project-scoped token and hard-coded client layer. Archive checks belong at the common actor/project access boundary, not only UI navigation. Nullable PATCH uses Pydantic's set-field information; explicit null clears optional fields and may never null required ones. Audit events record stable IDs, not complete sensitive documents. Client contact data is never emitted to guest channels.

## Side effects

Use existing event/notification/integration hooks for comment changes. Multiple new assignees receive notifications; removals do not. Do not notify foreign IDs. Closed work clears waiting-on state. Provider operations run through existing jobs where applicable; no automated email invitations are sent during this implementation session. New external integrations/AI/billing must report unconfigured status until configured and verified.
