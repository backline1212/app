# TDR-0212: Activity names who/what; approval confirmation on phones

Date: 2026-10-27. Source: owner page sweep and a phone approval walkthrough.

## Findings

- The activity feed showed "Maya Rao invited" and "Maya Rao workspace plan changed": the
  member and plan events carried their subject in the payload but the feed never read it.
- On a phone, "Approve v1 with 1 open comment?" overlapped the file tab beside it.

## Decisions

- The activity API names the subject of member events (the member's name, or the
  invited email) and the new plan for `workspace.plan_changed`: "invited Sam Patel",
  "changed the role of Sam Patel to admin", "changed the plan to Solo Pro". Names are read
  in one batch per page.
- Below 760 px the approve confirmation takes its own full-width row under the file tabs.
