# TDR-0209: Invited teammates say their name on first sign-in

Date: 2026-10-27. Source: invite walkthrough (owner invites, teammate signs in from the
email).

## Findings

- An invited teammate's account is named after the email prefix ("dev.sam"); nothing
  asked for a real name, so the greeting, assignee lists, mentions and client emails
  showed "dev.sam".
- The Team table showed a "Joined" date for someone who had only been invited.

## Decisions

- The first sign-in step ("Set a password") asks for "Your name" when the account's name
  is empty or equal to its email prefix. It becomes "Welcome to Backline" with "Save and
  continue" / "Continue without a password"; either saves the name (PATCH /auth/me).
  Nothing changes for accounts with a real name.
- The Team table (and its CSV) shows "Invited <date>" until the invite is accepted.
