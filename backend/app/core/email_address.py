"""Sign-in email addresses, compared without regard to case.

Pydantic's EmailStr lowercases only the domain, so "Bob@acme.com" and "bob@acme.com"
used to be two accounts: an invite typed with a capital, then a Google or code sign-in
(which arrive lowercase), created a second, empty user. Addresses are now lowercased at
the request boundary and stored that way; UserRepository.find_by_email still finds
accounts stored with their original case before this change.
"""

from typing import Annotated

from pydantic import AfterValidator, EmailStr


def normalize_email(value: str) -> str:
    return value.strip().lower()


NormalizedEmail = Annotated[EmailStr, AfterValidator(normalize_email)]
