import { useNavigate, useParams } from "react-router-dom";
import { Dialog } from "../../../components/Dialog";

// Points at the billing page rather than repeating prices here, so the numbers only
// ever come from the plan catalogue (backend/app/modules/billing/plans.py).
export function UpgradeToProModal({ onClose, workspaceSlug }: { onClose: () => void; workspaceSlug?: string }) {
  const navigate = useNavigate();
  const params = useParams();
  const slug = workspaceSlug ?? params.workspaceSlug;

  return (
    <Dialog title="Upgrade your plan" onClose={onClose}>
      <div className="bl-form" style={{ alignItems: "center", textAlign: "center" }}>
        <p>Paid plans add more projects, team seats and monthly AI credits, plus integrations and cloud login on Team Standard.</p>
        {slug && (
          <button
            type="button"
            className="bl-button mint"
            style={{ width: "100%" }}
            onClick={() => {
              onClose();
              navigate(`/w/${slug}/billing?upgrade=team`);
            }}
          >
            Compare plans
          </button>
        )}
        <button type="button" className="bl-quiet" style={{ width: "100%" }} onClick={onClose}>
          Not now
        </button>
      </div>
    </Dialog>
  );
}
