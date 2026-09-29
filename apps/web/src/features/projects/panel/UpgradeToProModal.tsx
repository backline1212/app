import { useNavigate, useParams } from "react-router-dom";
import { Dialog } from "../../../components/Dialog";

interface UpgradeToProModalProps {
  onClose: () => void;
  workspaceSlug?: string;
}

export function UpgradeToProModal({ onClose, workspaceSlug }: UpgradeToProModalProps) {
  const navigate = useNavigate();
  const params = useParams();
  const slug = workspaceSlug || params.workspaceSlug;

  const handleGoToBilling = (plan: string) => {
    onClose();
    if (slug) {
      navigate(`/w/${slug}/billing?upgrade=${plan}`);
    } else {
      navigate("/billing");
    }
  };

  return (
    <Dialog title="Upgrade to Pro & Team Plans" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "center", padding: "10px 0" }}>
        <span
          style={{
            alignSelf: "center",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "3px 10px",
            borderRadius: "12px",
            background: "var(--mint-tint)",
            color: "var(--mint-deep)",
          }}
        >
          ⭐ Unlock Full Superpowers
        </span>

        <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
          Supercharge your QA & visual reviews
        </h3>

        <p style={{ fontSize: "13px", color: "var(--bl-muted)", lineHeight: 1.5, margin: 0 }}>
          Get 20+ active projects, 10 team seats, 1,000 monthly AI actions, Jira & Asana integrations,
          and live Cloud Login interactive browser sessions.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
          <button
            type="button"
            onClick={() => handleGoToBilling("team")}
            className="bl-button mint"
            style={{ width: "100%", padding: "11px", fontWeight: 700 }}
          >
            Upgrade to Team Plan ($49/mo)
          </button>
          <button
            type="button"
            onClick={() => handleGoToBilling("solo")}
            className="bl-quiet"
            style={{ width: "100%", padding: "10px" }}
          >
            View Solo Plan ($19/mo)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bl-quiet"
            style={{ width: "100%", opacity: 0.7 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
