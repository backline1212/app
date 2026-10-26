# TDR-0211: Project limit up front; paid plans list what they add

Date: 2026-10-27. Source: walkthrough of a Free workspace reaching its project limit and
upgrading.

## Findings

- With every project in use, New project still let the owner choose a type, fill in the
  form and upload files, and only failed on "Create project".
- The plan cards listed more features under Free than under Solo Pro (recording, console
  capture, extension review are on every plan but were only listed under Free), so
  upgrading looked like losing features.

## Decisions

- At the limit, the type cards are disabled and the footer offers "Archive a project"
  and "See plans" instead of Continue. The warning above them is unchanged.
- Each paid plan's list starts with "Everything in <previous plan>, plus:" (shown as a
  heading line, not a checked item); Solo Pro no longer repeats "Unlimited guest & client
  reviewers". Plan content only; limits and prices are unchanged.

Walkthrough also confirmed: sandbox checkout says it's a test payment, the plan activates,
and the sidebar's usage card updates without a reload.
