import { Link } from "react-router-dom";

import { useDocumentTitle } from "../../lib/use-document-title";
import "./public-info.css";

const supportEmail = "contact.dwarkesh@gmail.com";

function InfoShell({ title, children }: { title: string; children: React.ReactNode }) {
  useDocumentTitle(title);

  return (
    <div className="bl-info-page">
      <header className="bl-info-header">
        <Link to="/login" className="bl-info-brand" aria-label="Backline home">Backline</Link>
        <nav aria-label="Public information">
          <Link to="/privacy">Privacy</Link>
          <Link to="/support">Support</Link>
        </nav>
      </header>
      <main className="bl-info-content">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <InfoShell title="Privacy notice">
      <p className="bl-info-lead">This notice explains what Backline receives when you use its website-review extension and portal. Last updated October 27, 2026.</p>

      <section>
        <h2>What a review sends to Backline</h2>
        <p>When you connect the extension, Backline uses your account email, workspace and project identifiers, and Backline access or review credentials to authorize the connection. The extension keeps connection information in Chrome extension storage and short-lived review state in Chrome session storage.</p>
        <p>When a reviewer starts a website review, Backline can receive the reviewed page URL and title, a normalized snapshot of visible page text and selected HTML attributes, element anchors, and browser/viewport context. A snapshot can include personal or confidential information visible on that page. When the reviewer saves feedback, Backline receives the comment, its location and context, and any screenshot or attachment the reviewer chooses to capture or add. A project setting controls additional browser, operating-system and device details saved with new comments.</p>
        <p>Before posting, a reviewer can preview the automatic screenshot, black out parts of it, or leave it out; a blacked-out area is removed in the reviewer's browser before the image is uploaded. A site owner can mark content with the <code>data-backline-private</code> attribute: it is left out of page snapshots and shown as a grey block in automatic screenshots. Form fields, editable areas and their typed values are not copied into snapshots.</p>
        <p>The extension inspects open tab URLs to find the selected project and return tab. It does not request Chrome browsing-history or cookies permissions, read saved website passwords, or copy a website's sign-in credentials into Backline. Your sign-in to the reviewed website remains in that website's own browser tab.</p>
      </section>

      <section>
        <h2>Why the data is used</h2>
        <p>Backline uses this information to connect a review to the right project and page, save and display feedback and evidence, recover comment positions after page changes, control access, and operate and protect the service. Authorized workspace members can see project feedback. Guest reviewers see only the project content and comment layers their review invitation permits.</p>
        <p>If a workspace connects an integration, selected project or comment updates can be sent to its chosen Slack, Discord, Microsoft Teams or webhook destination. A member can also send selected work to ClickUp, Trello, Jira, Asana, GitHub, GitLab or Linear. If a user invokes an AI feature, the content submitted to that feature can be sent to Groq when configured. These actions are separate from simply installing the extension.</p>
      </section>

      <section>
        <h2>On your device</h2>
        <p>When you join a review as a client, your review session is kept in this browser tab. If you tick "Remember me on this device", your session, name and email for that review link are also kept in this browser's local storage, so you return as yourself from the team's emails. "Leave review" removes them.</p>
      </section>

      <section>
        <h2>Storage and service providers</h2>
        <p>Backline stores account and project records in its database and review images, snapshots and attachments in private object storage. The deployed service uses Vercel for its frontend, Railway for API and background services, MongoDB for records, and S3-compatible object storage for private evidence. The configured storage may be Cloudflare R2. Email delivery can use Google Apps Script or Resend. Sign-in through Google shares the information needed for that sign-in with Google. Optional error reporting can use Sentry when configured; optional billing can use Stripe or Razorpay when a user chooses a payment method.</p>
        <p>To show a website project's card picture, Backline's server reads the site's public start page and the share image it publishes (its <code>og:image</code>); when an operator enables server screenshots, it captures the top of that page instead. When a team member opens a review with the extension, a screenshot of the page it opens on may be saved as the card picture (at most once a day per project, only while the card has no screenshot); otherwise the card can show the newest comment screenshot. Image and PDF project cards show a thumbnail of their first file, made in a team member's browser. If an operator configures a screenshot service for card pictures, the project's start URL is sent to that service. Project owners can manage access and delete projects through Backline. Disconnecting the extension removes its local connection but does not erase feedback already saved to a project. For access or deletion requests that cannot be completed in the product, contact us using the address below. We do not promise a fixed deletion or backup-retention period here because that depends on the record and service involved.</p>
      </section>

      <section>
        <h2>Your choices and contact</h2>
        <p>Only start a review on a site you are authorized to review. You can avoid adding screenshots or attachments, black out parts of a screenshot before posting, and a workspace can turn off optional browser/device detail capture for new comments. Every daily digest and feedback notification email has an Unsubscribe link, and email preferences can be changed in your Backline account settings. To ask about your data or report a privacy issue, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Do not email passwords, verification codes or access tokens.</p>
      </section>
    </InfoShell>
  );
}

export function SupportPage() {
  return (
    <InfoShell title="Backline support">
      <p className="bl-info-lead">Get help with the Backline portal, browser extension, or a website review.</p>

      <section>
        <h2>Before you contact us</h2>
        <ul>
          <li>Sign in to Backline and open the project you want to review. For a website that cannot sign in inside an embedded preview, open it in your normal browser tab and start the review with the Backline extension.</li>
          <li>If the extension does not find your project, check that its popup is connected to the right workspace and that the website URL matches the project.</li>
          <li>Chrome internal pages, the Chrome Web Store and some protected websites cannot be annotated. A failed screenshot should be reported as failed; you can still retry or save feedback without one.</li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with the project name, website origin, browser/version, and what you expected to happen. If a screenshot helps, remove personal or client information first. Do not send passwords, one-time codes, access tokens or private customer data.</p>
        <p>For data questions, see the <Link to="/privacy">privacy notice</Link>.</p>
      </section>
    </InfoShell>
  );
}
