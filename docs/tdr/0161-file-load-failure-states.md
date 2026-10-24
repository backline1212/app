# TDR-0161: File projects always open, with honest failure states

Date: 2026-10-25. Source: owner priority - image/PDF projects must at least load.

## Decisions

- A file whose object is gone from storage now returns 404 `FILE_MISSING`
  (`StoredFileMissingError`) instead of a 502 "try again" that could never succeed; other
  storage errors stay 502 and retryable.
- The file area says "<file> is missing from storage. Upload it again from Manage files;
  its comments stay in the Comments panel." with Manage files (for the team) and Retry
  file. Other failures keep their message and Retry.
- The status bar reflects failure ("couldn't be shown — comments are still available",
  red dot) instead of a permanent "Loading <file>…".
- The project page, file tabs, comments panel and share actions keep working whatever
  the file's state.

## Verification

Workspace lint/typecheck/build, backend ruff/mypy. Chromium with stored objects removed:
PDF and image projects open, show the missing-file message with Manage files/Retry, the
status bar shows the failure, and comments remain listed.
