import mobileArt from "../../assets/soon/mobile.svg";
import webappArt from "../../assets/soon/webapp.svg";

export type SoonType = "webapp" | "mobile";

// design/index.html's SOON copy for the Web App / Mobile App tabs. The design's
// "Tell me when it ships" button and target quarters are left out: there is no
// notification signup behind them and no announced date (see TDR-0020 / M-22).
const SOON: Record<SoonType, { title: string; lead: string; points: string[]; art: string }> = {
  webapp: {
    title: "Application state and diagnostics",
    lead: "To review a website that needs sign-in today, create a Website project and choose Open with extension. Sign in using your own website account. Additional application testing features are planned.",
    points: [
      "Planned: richer reproduction steps for complex application workflows.",
      "Planned: explicit UI-state context alongside a ticket.",
      "Planned: optional console and network diagnostics with capture controls.",
    ],
    art: webappArt,
  },
  mobile: {
    title: "Review builds on real devices",
    lead: "Native app review is planned. Today, upload screenshots or a PDF as an Images or PDF project to collect pinned feedback from clients.",
    points: [
      "Planned: comments linked to a real device, screen and build.",
      "Planned: explicit device capture permissions and version-aware feedback.",
      "Planned: build distribution and review from supported phones.",
    ],
    art: mobileArt,
  },
};

export function ComingSoonPanel({ type, onReviewWebsite, onReviewImages }: { type: SoonType; onReviewWebsite?: () => void; onReviewImages?: () => void }) {
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
        {type === "webapp" && onReviewWebsite && <button type="button" className="bl-button" onClick={onReviewWebsite}>Review a website now</button>}
        {type === "mobile" && onReviewImages && <button type="button" className="bl-button" onClick={onReviewImages}>Review screenshots now</button>}
      </div>
      <div className="bl-soon-art">
        <img src={d.art} alt="" />
      </div>
    </section>
  );
}
