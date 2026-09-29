import { LoadingMarkArt } from "./illustrations";

// A branded stand-in for the plain, unstyled "Loading..." text that used to sit
// alone in the top-left corner of an otherwise blank page while auth/workspace
// routing resolves (RequireAuth, WorkspaceLayout, ProjectLayout, and the other
// full-page gates below - each renders literally nothing else, so a left-aligned
// text node used to read as a rendering glitch rather than a loading state).
//
// `inline` is for a list loading inside a page that is already on screen: the full
// version is a whole viewport tall on its own background, which pushed the page into a
// scroll and put a second brand mark under the page's own header.
export function LoadingScreen({ label = "Loading", inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={`bl-loading-screen${inline ? " is-inline" : ""}`} role="status" aria-live="polite">
      {!inline && <LoadingMarkArt />}
      <div className="bl-loading-bar"><i /></div>
      <div aria-hidden="true" style={{ width: "min(80vw, 480px)", display: "grid", gap: 12 }}>
        {[75, 100, 55].map((width) => <div key={width} className="bl-skeleton" style={{ height: 18, width: `${width}%`, borderRadius: 3 }} />)}
      </div>
      <p>{label}…</p>
    </div>
  );
}
