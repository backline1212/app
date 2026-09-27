import mobileArt from "../../assets/soon/mobile.svg";
import webappArt from "../../assets/soon/webapp.svg";

export type SoonType = "webapp" | "mobile";

// design/index.html's SOON copy for the Web App / Mobile App tabs. The design's
// "Tell me when it ships" button and target quarters are left out: there is no
// notification signup behind them and no announced date (see TDR-0020 / M-22).
const SOON: Record<SoonType, { title: string; lead: string; points: string[]; art: string }> = {
  webapp: {
    title: "Review inside logged-in web apps",
    lead: "Website review works on any public or staging URL. Web App review adds what those pages cannot do on their own: staying signed in, and holding a comment to a screen that only exists after four clicks.",
    points: [
      "Reviewers stay authenticated through a shared session, so no one has to hand out a test password.",
      "Comments attach to a route and a UI state, not just a URL, so a modal or a filled-in table can be commented on.",
      "Console errors and failed network calls captured alongside the comment.",
    ],
    art: webappArt,
  },
  mobile: {
    title: "Review builds on real devices",
    lead: "Point Backline at a TestFlight or APK build and clients can comment on the running app from their own phone, with the tap that caused the problem recorded next to the note.",
    points: [
      "Comments pinned to a screen and a device, with OS version and viewport attached automatically.",
      "Replay of the last 30 seconds before the comment was left.",
      "Builds versioned, so a comment on build 42 still reads correctly on build 47.",
    ],
    art: mobileArt,
  },
};

export function ComingSoonPanel({ type }: { type: SoonType }) {
  const d = SOON[type];
  return (
    <section className="bl-soon-panel" aria-labelledby={`soon-${type}`}>
      <div className="bl-soon-copy">
        <span className="bl-soon-tag">Coming soon</span>
        <h2 id={`soon-${type}`}>{d.title}</h2>
        <p>{d.lead}</p>
        <ul>
          {d.points.map((point) => (
            <li key={point}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bl-soon-art">
        <img src={d.art} alt="" />
      </div>
    </section>
  );
}
