import type { BillingCurrency, BillingInterval, PaidPlanId, PlanId, PlanTierOut } from "../api";
import { formatMoney, isUpgrade, monthlyRate, periodTotal } from "../format";

interface PlanPricingCardProps {
  plan: PlanTierOut;
  interval: BillingInterval;
  currency: BillingCurrency;
  currentPlanId: PlanId;
  canManage: boolean;
  onSelect: (planId: PaidPlanId) => void;
}

function ctaLabel(plan: PlanTierOut, currentPlanId: PlanId): string {
  if (plan.id === currentPlanId) return "Renew or extend";
  return isUpgrade(currentPlanId, plan.id) ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;
}

export function PlanPricingCard({ plan, interval, currency, currentPlanId, canManage, onSelect }: PlanPricingCardProps) {
  const isFree = plan.id === "free";
  const isCurrent = plan.id === currentPlanId;
  const annual = interval === "annual" && !isFree;
  const monthlySavings = plan[`price_monthly_${currency}` as const] - plan[`price_annual_${currency}` as const];

  return (
    <article className={`bl-price-card${plan.popular ? " is-popular" : ""}${isCurrent ? " is-current" : ""}`} aria-label={`${plan.name} plan`}>
      {(isCurrent || plan.popular) && (
        <span className="bl-price-flag">{isCurrent ? "Current plan" : plan.badge}</span>
      )}
      <header>
        <h3>{plan.name}</h3>
        <p>{plan.description}</p>
      </header>

      <div className="bl-price-amount">
        <p>
          <strong>{formatMoney(monthlyRate(plan, interval, currency), currency)}</strong>
          {!isFree && <span>/ month</span>}
        </p>
        <small>
          {isFree
            ? "Free forever"
            : annual
              ? `${formatMoney(periodTotal(plan, interval, currency), currency)} billed yearly · save ${formatMoney(monthlySavings * 12, currency)}`
              : "Billed monthly"}
        </small>
      </div>

      {isFree ? (
        <button type="button" className="bl-quiet" disabled>
          {isCurrent ? "Your current plan" : "Included with every workspace"}
        </button>
      ) : (
        <button
          type="button"
          className={`bl-button${plan.popular || isUpgrade(currentPlanId, plan.id as PaidPlanId) ? " mint" : ""}`}
          disabled={!canManage}
          title={canManage ? undefined : "Only the workspace owner can change the plan."}
          onClick={() => onSelect(plan.id as PaidPlanId)}
        >
          {ctaLabel(plan, currentPlanId)}
        </button>
      )}

      <ul className="bl-price-features">
        {plan.features.map((feature) => (
          <li key={feature.label} className={feature.coming_soon ? "is-soon" : undefined}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
              <path d="M5 10.5 8.3 13.5 15 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{feature.label}</span>
            {feature.coming_soon && <em>Coming soon</em>}
          </li>
        ))}
      </ul>
    </article>
  );
}
