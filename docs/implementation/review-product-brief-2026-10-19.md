# Backline review product brief

Date: 2026-10-19. Product direction recorded; implementation has not started.
Decision: [TDR-0060](../tdr/0060-connected-website-review.md).
Execution: [implementation plan](connected-review-plan-2026-10-19.md).

## What we are building

Backline is the place to see website feedback, understand it, get it fixed, and
verify the result. The normal customer should not have to understand proxies,
browser sessions, extension modes, or MCP to complete a review.

Start with websites and staging apps the customer controls. A developer or their
coding agent installs the Backline integration once. Reviewers open a shared link
and use the website with a consistent Backline panel. The website runs at its real
address so its own login and navigation can work normally.

The project, tickets, saved screenshots, discussion, assignment and review status
remain in the Backline portal. Live website interaction opens a connected website
tab. This is the same predictable flow for every newly connected website project;
do not alternate silently between an iframe, an extension and a cloud browser.

## Answer to the authentication and extension question

Yes: the project and its permitted issues open inside Backline, including issues
reported through the extension. Source is metadata on a ticket, not a separate
issue store or permission system. The portal displays the saved evidence even
when the developer has not signed in to the reviewed website.

To inspect the live issue, choose **Open on site**. Backline opens the relevant
page, resumes the selected ticket after the developer completes the website's
login, and tries to locate its element. The developer uses their own website
account. A Backline share link does not grant access to the website, and it never
transfers another reviewer's login, account data or permissions.

Saved evidence shows what the reporter submitted. The live page shows what the
current developer can see now. Different roles, data, deployments, filters or
deleted elements can make those views differ. Backline must explain that mismatch,
retain the original evidence, and offer reproduction details or manual reanchoring.
It must never pretend an old screenshot is the live page.

## Normal user journey

1. **Connect:** create/open a project, add the integration, verify it on the actual
   review route, and share a review link. Setup belongs to the developer.
2. **Review:** the reviewer joins once, opens the website, signs in there if needed,
   and adds a pin or region with a comment. No Backline extension or account is
   required for this connected-website guest flow.
3. **Understand:** the team opens the ticket in Backline and sees its screenshot,
   URL, available environment details, reproduction notes and conversation.
4. **Inspect:** Open on site opens that ticket alongside the live page. Return to
   Backline retains the selected project and ticket.
5. **Fix:** a developer or authorized coding tool makes the change and attaches a
   preview/deployment reference. The ticket moves to In review.
6. **Verify:** a reviewer checks the preview, adds fresh evidence if needed, and
   resolves or reopens the same ticket. History remains intact.

## Decisions carried forward from this conversation

- Reliability and a clear workflow take priority over adding more visible tools.
- The user is open to infrastructure spending, new windows/tabs and later AI/MCP.
  That is a product preference, not approval to buy services or deploy changes now.
- The primary launch scope is customer-controlled websites/staging apps with a
  one-time installed widget. The existing extension remains supported for existing
  users and sites without an install; it is not mandatory for normal guest review.
- Keep all permitted widget/extension feedback in the same project and workflow.
- Preserve persistent anchors, screenshots, replies, permissions, image/PDF review
  and the central dashboard. Close missing features rather than assuming parity.
- Accurate screenshots, exact viewport control, actual browser engines and real
  devices are different capabilities. A site script alone cannot guarantee them.
- Browser/device lab infrastructure is a later, explicit testing feature. No
  provider, spend or universal compatibility percentage has been approved.
- The intended AI loop is feedback -> evidence -> code change -> preview -> human
  or authorized agent verification. MCP access to tickets is not browser access
  or permission to use the reviewer's website account.
- The [source audit](site-gap-audit-2026-10-19.md) found 35 issues and 8 capability
  limits. They remain open; static checks passing does not prove browser reliability.

## How we judge the product

A first-time reviewer can complete the flow without choosing a technical mode.
A developer can understand a reported issue inside Backline, open the right live
page, and tell whether the fix was verified. A failed capture, login, launch or
save always has a visible state and a useful recovery action.

The 99% compatibility figure discussed is an aspiration, not measured evidence.
Before making a numerical claim, define the supported browsers and websites and
measure loading, authentication, capture, saving and reopening separately.
