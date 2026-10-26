# TDR-0210: File review tag default, reviewer initials, pin markers in ticket views

Date: 2026-10-27. Source: phone walkthrough of a client reviewing an image project, and
the team opening the resulting ticket.

## Findings

- The file-review composer preselected a tag ("Design", sticking to the last one used),
  so a colour note was saved as "Copy". Same problem the website composer had (TDR-0207).
- Its avatar used the first two letters of the name ("KI" for Kim Lee).
- The ticket dialog and the side-panel ticket showed the client's screenshot without the
  marker the screenshot view draws, so the team had to guess what was pointed at. The
  screenshot view itself positioned markers against a cropped frame, so a tall capture's
  marker could sit lower than the element.

## Decisions

- File-review tags start empty and toggle off on a second click; the comment is saved
  with no tag unless one is chosen.
- Initials are first + last name ("KL"), or the first two letters of a single name.
- `MarkedShot` draws the pin (with its ticket number) or the drawn area on a screenshot,
  positioned on the image's own box. Used in the ticket dialog, the side-panel ticket and
  the screenshot view (whose frame now crops a full-width image from the top instead of
  using `object-fit: cover`, keeping markers aligned).
