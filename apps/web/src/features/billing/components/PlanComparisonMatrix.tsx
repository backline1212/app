import { Fragment, useState } from "react";
import type { ComparisonCategoryOut, PlanId, PlanTierOut } from "../api";

interface PlanComparisonMatrixProps {
  plans: PlanTierOut[];
  categories: ComparisonCategoryOut[];
  currentPlanId: PlanId;
}

function Cell({ value }: { value: string }) {
  if (value === "Yes") {
    return (
      <span className="bl-compare-yes" aria-label="Included">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M5 10.5 8.3 13.5 15 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (value === "No") return <span className="bl-compare-no" aria-label="Not included">—</span>;
  if (value === "Coming soon") return <em className="bl-compare-soon">Coming soon</em>;
  return <span>{value}</span>;
}

export function PlanComparisonMatrix({ plans, categories, currentPlanId }: PlanComparisonMatrixProps) {
  const [open, setOpen] = useState(true);

  return (
    <section className="bl-billing-section" aria-labelledby="bl-compare-title">
      <header className="bl-billing-section-head">
        <div>
          <h2 id="bl-compare-title">Compare every plan</h2>
          <p>Quotas, capture tools, integrations and support side by side.</p>
        </div>
        <button type="button" className="bl-quiet" aria-expanded={open} aria-controls="bl-compare-table" onClick={() => setOpen(!open)}>
          {open ? "Hide table" : "Show table"}
        </button>
      </header>

      {open && (
        <div className="bl-table-wrap" id="bl-compare-table">
          <table className="bl-table bl-compare">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                {plans.map((plan) => (
                  <th key={plan.id} scope="col" className={plan.id === currentPlanId ? "is-current" : undefined}>
                    {plan.name}
                    {plan.id === currentPlanId && <small>Current</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <Fragment key={category.category}>
                  <tr className="bl-compare-group">
                    <th scope="colgroup" colSpan={plans.length + 1}>{category.category}</th>
                  </tr>
                  {category.rows.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      {plans.map((plan) => (
                        <td key={plan.id} className={plan.id === currentPlanId ? "is-current" : undefined}>
                          <Cell value={row[plan.id]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
