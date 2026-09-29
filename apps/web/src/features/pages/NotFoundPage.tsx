import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../lib/use-document-title";

export function NotFoundPage() {
  useDocumentTitle("Page Not Found");
  return (
    <main className="bl-review-gate">
      <span className="bl-loading-mark" aria-hidden="true">B</span>
      <div className="bl-review-gate-copy">
        <span className="bl-review-eyebrow">404</span>
        <h1>Page not found</h1>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <div className="bl-review-gate-actions">
          <Link className="bl-button mint" to="/">Return to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
