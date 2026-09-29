import type { PlanTierOut } from "../api";

interface PlanPricingCardProps {
  plan: PlanTierOut;
  interval: "monthly" | "annual";
  currency: "usd" | "inr";
  isCurrent: boolean;
  onSelect: (planId: "solo" | "team" | "enterprise") => void;
}

export function PlanPricingCard({
  plan,
  interval,
  currency,
  isCurrent,
  onSelect,
}: PlanPricingCardProps) {
  const isFree = plan.id === "free";
  const isPopular = plan.popular;

  // Calculate prices
  let price = 0;
  let billedNote = "Free forever";

  if (!isFree) {
    if (currency === "inr") {
      price = interval === "annual" ? plan.price_annual_inr : plan.price_monthly_inr;
      billedNote =
        interval === "annual"
          ? `₹${(plan.price_annual_inr * 12).toLocaleString()} billed annually`
          : "Billed monthly";
    } else {
      price = interval === "annual" ? plan.price_annual_usd : plan.price_monthly_usd;
      billedNote =
        interval === "annual"
          ? `$${plan.price_annual_usd * 12} billed annually`
          : "Billed monthly";
    }
  }

  const currencySymbol = currency === "inr" ? "₹" : "$";

  return (
    <div
      className={`bl-plan-card-v2 ${isPopular ? "is-popular" : ""} ${
        isCurrent ? "is-current" : ""
      }`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: "var(--bl-surface)",
        border: isPopular
          ? "2px solid var(--mint-deep)"
          : isCurrent
          ? "2px solid var(--bl-ink)"
          : "1px solid var(--bl-line)",
        borderRadius: "8px",
        padding: "24px 20px",
        boxShadow: isPopular ? "0 8px 30px rgba(10, 107, 75, 0.12)" : "0 2px 8px rgba(0,0,0,0.04)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {isPopular && (
        <div
          style={{
            position: "absolute",
            top: "-13px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--mint-deep)",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "3px 12px",
            borderRadius: "12px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          }}
        >
          {plan.badge || "Most Popular"}
        </div>
      )}

      {isCurrent && !isPopular && (
        <div
          style={{
            position: "absolute",
            top: "-11px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bl-ink)",
            color: "var(--bl-invert-fg)",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "2px 10px",
            borderRadius: "10px",
          }}
        >
          Current Plan
        </div>
      )}

      {/* Plan Header */}
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 6px" }}>{plan.name}</h3>
        <p style={{ fontSize: "12px", color: "var(--bl-muted)", lineHeight: 1.4, margin: 0, minHeight: "34px" }}>
          {plan.description}
        </p>
      </div>

      {/* Price Block */}
      <div style={{ padding: "16px 0", borderTop: "1px solid var(--bl-line)", borderBottom: "1px solid var(--bl-line)", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.03em" }}>
            {currencySymbol}
            {price.toLocaleString()}
          </span>
          {!isFree && (
            <span style={{ fontSize: "13px", color: "var(--bl-muted)", fontWeight: 500 }}>
              /month
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--bl-muted)" }}>{billedNote}</span>
          {!isFree && interval === "annual" && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--mint-deep)",
                background: "var(--mint-tint)",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              Save ~20%
            </span>
          )}
        </div>
      </div>

      {/* Call to Action Button */}
      <div style={{ marginBottom: "24px" }}>
        {isCurrent ? (
          <button
            type="button"
            disabled
            className="bl-button"
            style={{ width: "100%", opacity: 0.8, cursor: "default", background: "var(--paper)", color: "var(--ink-2)", border: "1px solid var(--bl-line)" }}
          >
            ✓ Active Plan
          </button>
        ) : isFree ? (
          <button
            type="button"
            disabled
            className="bl-button"
            style={{ width: "100%", opacity: 0.6 }}
          >
            Included Free
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(plan.id as "solo" | "team" | "enterprise")}
            className={`bl-button ${isPopular ? "mint" : ""}`}
            style={{ width: "100%", padding: "11px 16px", fontWeight: 700 }}
          >
            Upgrade to {plan.name}
          </button>
        )}
      </div>

      {/* Highlights checklist */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--bl-muted)", margin: "0 0 4px" }}>
          What's included:
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "9px" }}>
          {plan.features.map((feat) => (
            <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", lineHeight: 1.4 }}>
              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                fill="none"
                style={{ color: "var(--mint-deep)", flexShrink: 0, marginTop: "2px" }}
                aria-hidden="true"
              >
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M6 10.5 8.8 13 14 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{feat}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
