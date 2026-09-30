"""Shared request-string types."""

from typing import Annotated

from pydantic import StringConstraints

# A name, label or comment typed by a person. Surrounding whitespace is dropped before
# the field's own min_length/max_length apply, so "   " is rejected as empty rather
# than saved as a blank workspace, project or comment. Not for passwords, tokens or
# anything else whose spaces are part of the value.
Trimmed = Annotated[str, StringConstraints(strip_whitespace=True)]
