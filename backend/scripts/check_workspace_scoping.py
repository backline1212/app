#!/usr/bin/env python3
"""Workspace-scoping lint rule (06-Backend-Architecture.md §6.4, Milestone 11).

Rule 6 (Security Is a Feature) requires every query against tenant-owned data to be
workspace-scoped. In practice, most repository methods in this codebase don't filter by
`workspace_id` directly - they filter by `_id` (or another foreign key that is itself a
globally-unique ObjectId, like `page_id`/`project_id`/`share_link_id`) and rely on the
calling service having already verified that id belongs to the caller's workspace
earlier in the same request (the "find-by-id-then-verify-then-mutate" pattern used
throughout `modules/*/service.py`). That's a legitimate, deliberately-chosen pattern,
not a bug - but it means a naive "every query must literally contain workspace_id"
check would fail on dozens of correct call sites.

So: this script flags any `db.<collection>.<find|find_one|update_one|update_many|
delete_one|delete_many|count_documents>(...)` call in `app/modules/**/repository.py`
whose filter dict has no `workspace_id` key, UNLESS either (a) the collection is in
`GLOBAL_COLLECTIONS` (not tenant-owned at all - users, refresh_tokens, otp_codes,
workspaces themselves; 03-System-Architecture.md §3.5's explicit exemption), or (b) the
call has a `# workspace-scope-exempt: <reason>` comment on the same line or the line
directly above it, explaining why the filter is safe without workspace_id (e.g. "id
already verified against workspace_id in the calling service").

This makes every exemption an explicit, reviewed, in-code decision instead of a silent
gap - a new query that forgets workspace_id fails CI until a human either adds the
scope or writes down why it doesn't need it.
"""

import ast
import sys
from pathlib import Path

MODULES_DIR = Path(__file__).resolve().parent.parent / "app" / "modules"

SCOPED_METHODS = {
    "find",
    "find_one",
    "update_one",
    "update_many",
    "delete_one",
    "delete_many",
    "count_documents",
}

# Not tenant-owned data at all (03-System-Architecture.md §3.5): a user can belong to
# many workspaces, and workspaces are the tenant boundary itself, not a tenant's data.
GLOBAL_COLLECTIONS = {"users", "refresh_tokens", "otp_codes", "workspaces"}

EXEMPT_MARKER = "workspace-scope-exempt:"


class Violation(ast.NodeVisitor):
    def __init__(self, source_lines: list[str]) -> None:
        self.source_lines = source_lines
        self.violations: list[tuple[int, str]] = []

    def visit_Call(self, node: ast.Call) -> None:
        self.generic_visit(node)
        func = node.func
        if not isinstance(func, ast.Attribute):
            return
        method_name = func.attr
        if method_name not in SCOPED_METHODS:
            return

        # Expect self.db.<collection>.<method>(...)
        collection_attr = func.value
        if not isinstance(collection_attr, ast.Attribute):
            return
        collection_name = collection_attr.attr
        db_expr = collection_attr.value
        if not (isinstance(db_expr, ast.Attribute) and db_expr.attr == "db"):
            return

        if collection_name in GLOBAL_COLLECTIONS:
            return

        if not node.args:
            return
        filter_arg = node.args[0]
        if not isinstance(filter_arg, ast.Dict):
            # Not a literal dict (e.g. a variable built up earlier) - can't statically
            # check its keys, so trust it; `query: dict[str, Any] = {...}` patterns
            # elsewhere in this codebase are already covered because the *assignment*
            # to that variable is itself a dict literal check would need to trace back
            # to. To keep this script simple and low-false-positive, only literal
            # dict arguments are checked directly.
            return

        keys = {
            key.value
            for key in filter_arg.keys
            if isinstance(key, ast.Constant) and isinstance(key.value, str)
        }
        if "workspace_id" in keys:
            return

        if self._has_exemption_comment(node.lineno):
            return

        self.violations.append(
            (node.lineno, f"db.{collection_name}.{method_name}(...) has no workspace_id filter")
        )

    def _has_exemption_comment(self, lineno: int) -> bool:
        # Exemption explanations are often multi-line, but the `# workspace-scope-exempt:`
        # marker itself only appears once, on the first line of the comment block - so
        # walk upward through the whole contiguous run of comment lines directly above
        # the call (plus the call's own line, for inline trailing comments), not just the
        # single line immediately preceding it.
        check_line = lineno
        while 1 <= check_line <= len(self.source_lines):
            line = self.source_lines[check_line - 1]
            if EXEMPT_MARKER in line:
                return True
            if check_line == lineno or line.strip().startswith("#"):
                check_line -= 1
                continue
            break
        return False


def check_file(path: Path) -> list[tuple[int, str]]:
    source = path.read_text()
    tree = ast.parse(source, filename=str(path))
    checker = Violation(source.splitlines())
    checker.visit(tree)
    return checker.violations


def main() -> int:
    repository_files = sorted(MODULES_DIR.glob("*/*repository.py"))
    total_violations = 0
    for path in repository_files:
        for lineno, message in check_file(path):
            rel = path.relative_to(MODULES_DIR.parent.parent)
            print(f"{rel}:{lineno}: {message}")
            total_violations += 1

    if total_violations:
        print(
            f"\n{total_violations} workspace-scoping violation(s) found. Add a "
            f"'workspace_id' filter key, or a '# {EXEMPT_MARKER} <reason>' comment "
            "if the query is safe without one (06-Backend-Architecture.md §6.4)."
        )
        return 1

    print(f"Workspace-scoping check passed ({len(repository_files)} repository files).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
