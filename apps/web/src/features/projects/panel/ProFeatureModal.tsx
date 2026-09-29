import { Dialog } from "../../../components/Dialog";

interface ProFeatureModalProps {
  description: string;
  onClose: () => void;
  onUpgrade: () => void;
}

// The small "you just explored a pro feature" teaser - shared by every pro-gated
// trigger point (multi-version, page approval, private mode, BugHunt AI's own
// Analyse Page) rather than duplicated per trigger. "Upgrade to Pro" hands off to the
// caller, which opens UpgradeToProModal and from there the billing page.
export function ProFeatureModal({ description, onClose, onUpgrade }: ProFeatureModalProps) {
  return (
    <Dialog title="This is a Pro feature" onClose={onClose}>
      <div className="bl-form" style={{ alignItems: "center", textAlign: "center" }}>
        <span className="bl-scope-badge">Pro feature</span>
        <p>{description}</p>
        <button type="button" onClick={onUpgrade} className="bl-button mint" style={{ width: "100%" }}>
          Upgrade to Pro
        </button>
        <button type="button" onClick={onClose} className="bl-quiet" style={{ width: "100%" }}>
          Continue using BugHunt for free
        </button>
      </div>
    </Dialog>
  );
}
