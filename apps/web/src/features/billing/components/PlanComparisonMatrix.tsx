import { useState } from "react";
import type { ComparisonCategoryOut, ComparisonRowOut } from "../api";

interface PlanComparisonMatrixProps {
  categories: ComparisonCategoryOut[];
  currentPlanId: string;
  onUpgradeClick: (planId: "solo" | "team" | "enterprise") => void;
}

export function PlanComparisonMatrix({
  categories,
  currentPlanId,
  onUpgradeClick,
}: PlanComparisonMatrixProps) {
  const [collapsed, setCollapsed] = useState(false);

  const renderValue = (val: string, isEnterprise = false) => {
    if (val === "Yes") {
      return (
        <span style={{ color: "var(--mint-deep)", display: "inline-flex", alignItems: "center" }}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M6 10.5 8.8 13 14 7.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      );
    }
    if (val === "No") {
      return <span style={{ color: "var(--bl-muted)", opacity: 0.4 }}>—</span>;
    }
    return <span style={{ fontWeight: isEnterprise ? 600 : 500 }}>{val}</span>;
  };

  return (
    <div
      style={{
        background: "var(--bl-surface)",
        border: "1px solid var(--bl-line)",
        borderRadius: "8px",
        overflow: "hidden",
        marginTop: "32px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          borderBottom: collapsed ? "none" : "1px solid var(--bl-line)",
          background: "var(--bl-paper)",
        }}
      >
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px" }}>
            Detailed Plan Comparison
          </h3>
          <p style={{ fontSize: "12px", color: "var(--bl-muted)", margin: 0 }}>
            Compare full features, quotas and SLAs across all 4 tiers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="bl-quiet"
          style={{ fontSize: "12px" }}
        >
          {collapsed ? "Expand Table ↓" : "Collapse Table ↑"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--bl-line)",
                  background: "var(--bl-surface)",
                }}
              >
                <th style={{ padding: "16px 24px", fontWeight: 700, width: "32%" }}>
                  Feature
                </th>
                <th style={{ padding: "16px 16px", fontWeight: 700, textAlign: "center", width: "17%" }}>
                  Free
                  {currentPlanId === "free" && (
                    <span style={{ display: "block", fontSize: "10px", color: "var(--bl-muted)", fontWeight: 400 }}>
                      (Current)
                    </span>
                  )}
                </th>
                <th style={{ padding: "16px 16px", fontWeight: 700, textAlign: "center", width: "17%" }}>
                  Solo
                  {currentPlanId === "solo" && (
                    <span style={{ display: "block", fontSize: "10px", color: "var(--mint-deep)", fontWeight: 600 }}>
                      (Current)
                    </span>
                  )}
                </th>
                <th
                  style={{
                    padding: "16px 16px",
                    fontWeight: 700,
                    textAlign: "center",
                    width: "17%",
                    background: "var(--mint-tint)",
                    color: "var(--mint-deep)",
                  }}
                >
                  Team ⭐
                  {currentPlanId === "team" && (
                    <span style={{ display: "block", fontSize: "10px", fontWeight: 600 }}>
                      (Current)
                    </span>
                  )}
                </th>
                <th style={{ padding: "16px 16px", fontWeight: 700, textAlign: "center", width: "17%" }}>
                  Enterprise
                  {currentPlanId === "enterprise" && (
                    <span style={{ display: "block", fontSize: "10px", color: "var(--mint-deep)", fontWeight: 600 }}>
                      (Current)
                    </span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat: ComparisonCategoryOut) => (
                <div key={cat.category} style={{ display: "contents" }}>
                  <tr
                    style={{
                      background: "var(--bl-paper)",
                      borderTop: "1px solid var(--bl-line)",
                      borderBottom: "1px solid var(--bl-line)",
                    }}
                  >
                    <td
                      colSpan={5}
                      style={{
                        padding: "10px 24px",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--bl-muted)",
                      }}
                    >
                      {cat.category}
                    </td>
                  </tr>
                  {cat.rows.map((row: ComparisonRowOut) => (
                    <tr
                      key={row.name}
                      style={{
                        borderBottom: "1px solid var(--bl-line)",
                        transition: "background 0.1s ease",
                      }}
                    >
                      <td style={{ padding: "12px 24px", color: "var(--bl-ink)", fontWeight: 500 }}>
                        {row.name}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", color: "var(--ink-2)" }}>
                        {renderValue(row.free)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", color: "var(--ink-2)" }}>
                        {renderValue(row.solo)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "center",
                          background: "rgba(105, 222, 178, 0.05)",
                          color: "var(--ink-2)",
                        }}
                      >
                        {renderValue(row.team)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center", color: "var(--ink-2)" }}>
                        {renderValue(row.enterprise, true)}
                      </td>
                    </tr>
                  ))}
                </div>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: "16px 24px" }} />
                <td style={{ padding: "16px", textAlign: "center" }}>
                  {currentPlanId === "free" ? (
                    <span style={{ fontSize: "11px", color: "var(--bl-muted)" }}>Current</span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--bl-muted)" }}>Free</span>
                  )}
                </td>
                <td style={{ padding: "16px", textAlign: "center" }}>
                  {currentPlanId === "solo" ? (
                    <span style={{ fontSize: "11px", color: "var(--mint-deep)", fontWeight: 600 }}>Active</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpgradeClick("solo")}
                      className="bl-quiet"
                      style={{ fontSize: "11px" }}
                    >
                      Choose Solo
                    </button>
                  )}
                </td>
                <td style={{ padding: "16px", textAlign: "center", background: "rgba(105, 222, 178, 0.05)" }}>
                  {currentPlanId === "team" ? (
                    <span style={{ fontSize: "11px", color: "var(--mint-deep)", fontWeight: 600 }}>Active</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpgradeClick("team")}
                      className="bl-button mint"
                      style={{ fontSize: "11px", padding: "6px 12px" }}
                    >
                      Choose Team
                    </button>
                  )}
                </td>
                <td style={{ padding: "16px", textAlign: "center" }}>
                  {currentPlanId === "enterprise" ? (
                    <span style={{ fontSize: "11px", color: "var(--mint-deep)", fontWeight: 600 }}>Active</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpgradeClick("enterprise")}
                      className="bl-quiet"
                      style={{ fontSize: "11px" }}
                    >
                      Choose Enterprise
                    </button>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
