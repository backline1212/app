# TDR-0236: "Get started" on a new workspace's home page

Date: 2026-11-08. Source: walking sign-up as a new agency owner.

A new owner landed on the home page with the sample project and an "Add a website" tile,
and nothing said what else to do (share with a client, invite the team, connect tools).

- Owners and admins see a "Get started" card on the home page (not when searching,
  filtering by type or viewing archived): add a project for a client, get your first
  feedback, invite a teammate, and optionally connect Slack/Jira/GitHub. Each step is
  ticked from real data - non-sample projects, comments on them, member count,
  integrations - and links straight to the action (new project, review links, the
  invite dialog via `/members?invite=email`, Integrations).
- It disappears once the three main steps are done, or when hidden (per browser).
- `ProjectOut.is_sample` (additive) lets the card look past the seeded example project.
