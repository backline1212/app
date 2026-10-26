# TDR-0206: Review URL check, readable validation errors, plan usage in the sidebar

Date: 2026-10-27. Source: a new-user walkthrough (sign up → workspace → first project).

## Findings

- A review URL typed without a scheme (`staging.client.com`, `localhost:3000`) was saved
  as https. An http-only staging site then sat on "Loading..." in the canvas with no
  explanation; nothing told the person the address was wrong before the project existed.
- Field validation errors showed Pydantic's developer text, e.g. "email: value is not a
  valid email address: The part after the @-sign is a special-use or reserved name...".
- The sidebar plan card said "Free plan · 1 project" with no limit, so the allowance was
  only visible on the billing page.
- The "Project created" next steps rendered as three centred run-on lines.

## Decisions

- `POST /workspaces/{id}/projects/check-url` (project:manage, 20/min per member) checks
  an address through the SSRF-guarded client with the same rules as saving it. Without a
  typed scheme it tries https, then http. It returns the address to use and one of: loads
  (`ok`), asks for sign-in (401/403 or a login redirect), bot protection (Cloudflare-style
  challenge), error status, unreachable - each with a sentence for the form.
- The new-project form checks the URL 0.7 s after typing stops, switches the field to
  `http://...` when only http answers, and shows the verdict under the field. Saving is
  never blocked: the site may be down now, or only reachable over a VPN.
- API validation errors become short sentences ("Enter a valid email address.",
  "Project name can't be empty.", "... can be at most 200 characters.").
- The plan card shows "1 of 2 projects" and "3 of 20 AI credits this month" from the
  subscription usage (not for viewers, who can't read billing), and "Upgrade for more
  projects" when the project allowance is used. Project mutations refresh it.
- The created-project steps are a numbered, left-aligned checklist.
