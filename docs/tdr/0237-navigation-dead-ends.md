# TDR-0237: Navigation dead ends and lost place

Date: 2026-11-08. Source: navigation/IA audit of team, owner and client journeys.

- Back keeps your place: workspace pages scroll inside `.bl-main`, so the old
  `window.scrollTo(0,0)` never reset or restored anything there. `ScrollToTop` now
  resets the scroller on a new page, leaves it alone when only the query changes (filters,
  a ticket opened over the list), and restores the saved position on Back/Forward.
- Last workspace is remembered however you entered it (sidebar switcher, link, picker),
  so sign-in returns you there. A workspace link you can't open lands on the picker with
  a note instead of silently. Delete/leave navigate before the list refreshes and say
  what happened.
- Search: a person result opens their drawer (`/members?person=`); the placeholder
  mentions `#14`. Clients: "+N more" and "N active" link to the filtered home page.
- First run: with no live project, "Waiting on you" offers "Add your first project"
  instead of a ticket form that has nowhere to file; Get started's feedback step opens
  the Share dialog (Copy link) rather than the link manager table.
- Ticket dialog: the project chip links to the project; the "ticket was deleted" state
  has a way back.
- Client review on phones, tablets and non-Chromium browsers skips the "does this site
  ask you to sign in?" question (it led to an extension install they can't do) and
  opens the preview; "Open the preview instead" is offered in every extension path.
