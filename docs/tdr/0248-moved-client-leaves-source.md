# TDR-0248: A moved client leaves with its last project

Date: 2026-11-28. Amends TDR-0245 (move choices: "the source keeps its own").

## Context

After a project moved with its client, the client's name and contact were listed in both
workspaces. Review asked for them to move.

## Decision

When the move brings the client (linked, with contact, or name only) and no other project
in the source belongs to it, archived projects included, the source client is archived in
the move's transaction and a `client.archived` event is recorded.

It stays listed when the client is not brought, or when another project uses it. The move
window says which will happen (`client_shared` in the preview); the result reports
`client_left_source`.

## Consequences

- Archived, not deleted: the contact details remain in the database. The dashboard has no
  archived client list, so restoring one needs the API.
- With "name only", the destination gets no contact details.
- Earlier activity entries in the source still name the client.
- A project given the same client in the source while its last project is moving could be
  left pointing at an archived client.

## Verification

A one-off run of the move's client step on a temporary database: six cases (contact, name
only, linked, not brought, shared with an active project, shared with an archived one).
Web type check, backend ruff and mypy.
