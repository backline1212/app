import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { useDocumentTitle } from "../../lib/use-document-title";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import {
  getBillingPlans,
  getSubscription,
  listInvoices,
} from "../billing/api";
import { CurrentPlanBanner } from "../billing/components/CurrentPlanBanner";
import { PlanPricingCard } from "../billing/components/PlanPricingCard";
import { PlanComparisonMatrix } from "../billing/components/PlanComparisonMatrix";
import { InvoiceHistorySection } from "../billing/components/InvoiceHistorySection";
import { CheckoutModal } from "../billing/components/CheckoutModal";
import type { WorkspaceOut } from "./api";

export function BillingPage() {
  useDocumentTitle("Billing & Plans");
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [currency, setCurrency] = useState<"usd" | "inr">("usd");
  const [checkoutTarget, setCheckoutTarget] = useState<"solo" | "team" | "enterprise" | null>(null);

  // React Query calls
  const plansQuery = useQuery({
    queryKey: qk.billingPlans(workspace.id),
    queryFn: () => getBillingPlans(workspace.id),
  });

  const subscriptionQuery = useQuery({
    queryKey: qk.subscription(workspace.id),
    queryFn: () => getSubscription(workspace.id),
  });

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
  });

  // Handle URL redirect query parameters (e.g. ?checkout=success, ?upgrade=team)
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    const planParam = searchParams.get("plan");
    const upgradeParam = searchParams.get("upgrade");

    if (checkoutStatus === "success") {
      toast(`🎉 You've successfully upgraded to the ${planParam || "paid"} plan!`);
      // Clean up URL
      searchParams.delete("checkout");
      searchParams.delete("plan");
      setSearchParams(searchParams, { replace: true });
    } else if (checkoutStatus === "canceled") {
      toast("Checkout was canceled.");
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }

    if (upgradeParam && (upgradeParam === "solo" || upgradeParam === "team" || upgradeParam === "enterprise")) {
      setCheckoutTarget(upgradeParam);
      searchParams.delete("upgrade");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  const currentPlanId = subscriptionQuery.data?.plan_id || workspace.plan || "free";
  const plans = plansQuery.data?.plans || [];
  const categories = plansQuery.data?.categories || [];

  return (
    <main className="bl-wrap" style={{ maxWidth: "1280px" }}>
      <header className="bl-head">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 6px" }}>
            Billing & Plans
          </h1>
          <p style={{ fontSize: "14px", color: "var(--bl-muted)", margin: 0 }}>
            Manage your workspace subscription, upgrade limits, and view invoice receipts.
          </p>
        </div>
      </header>

      {/* Active Subscription Summary with Live Usage Quotas */}
      {subscriptionQuery.data && (
        <CurrentPlanBanner
          subscription={subscriptionQuery.data}
          onUpgradeClick={() => setCheckoutTarget("team")}
        />
      )}

      {/* Plan Selection Controls (Annual/Monthly toggle + USD/INR switcher) */}
      <section style={{ marginBottom: "28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 4px" }}>
              Choose the right plan for your team
            </h2>
            <p style={{ fontSize: "13px", color: "var(--bl-muted)", margin: 0 }}>
              All paid tiers include unlimited guest reviewers, full snapshot tools, and fast proxy mode.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* Currency Selector */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--bl-surface)",
                border: "1px solid var(--bl-line)",
                borderRadius: "6px",
                padding: "3px",
              }}
            >
              <button
                type="button"
                onClick={() => setCurrency("usd")}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: currency === "usd" ? 700 : 500,
                  borderRadius: "4px",
                  background: currency === "usd" ? "var(--bl-ink)" : "transparent",
                  color: currency === "usd" ? "var(--bl-invert-fg)" : "var(--bl-ink)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                $ USD
              </button>
              <button
                type="button"
                onClick={() => setCurrency("inr")}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: currency === "inr" ? 700 : 500,
                  borderRadius: "4px",
                  background: currency === "inr" ? "var(--bl-ink)" : "transparent",
                  color: currency === "inr" ? "var(--bl-invert-fg)" : "var(--bl-ink)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ₹ INR
              </button>
            </div>

            {/* Monthly / Annual Toggle */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "var(--bl-surface)",
                border: "1px solid var(--bl-line)",
                borderRadius: "6px",
                padding: "3px",
              }}
            >
              <button
                type="button"
                onClick={() => setInterval("monthly")}
                style={{
                  padding: "5px 14px",
                  fontSize: "12px",
                  fontWeight: interval === "monthly" ? 700 : 500,
                  borderRadius: "4px",
                  background: interval === "monthly" ? "var(--bl-ink)" : "transparent",
                  color: interval === "monthly" ? "var(--bl-invert-fg)" : "var(--bl-ink)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval("annual")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 14px",
                  fontSize: "12px",
                  fontWeight: interval === "annual" ? 700 : 500,
                  borderRadius: "4px",
                  background: interval === "annual" ? "var(--bl-ink)" : "transparent",
                  color: interval === "annual" ? "var(--bl-invert-fg)" : "var(--bl-ink)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span>Annual</span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: interval === "annual" ? "var(--mint)" : "var(--mint-deep)",
                    background: interval === "annual" ? "rgba(255,255,255,0.15)" : "var(--mint-tint)",
                    padding: "1px 5px",
                    borderRadius: "3px",
                  }}
                >
                  Save 20%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 4-Tier Pricing Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
            alignItems: "stretch",
          }}
        >
          {plansQuery.isLoading ? (
            <p style={{ fontSize: "14px", color: "var(--bl-muted)", padding: "40px 0" }}>
              Loading pricing tiers…
            </p>
          ) : (
            plans.map((p) => (
              <PlanPricingCard
                key={p.id}
                plan={p}
                interval={interval}
                currency={currency}
                isCurrent={currentPlanId === p.id}
                onSelect={(pId) => setCheckoutTarget(pId)}
              />
            ))
          )}
        </div>
      </section>

      {/* Feature-by-feature Comparison Matrix */}
      {categories.length > 0 && (
        <PlanComparisonMatrix
          categories={categories}
          currentPlanId={currentPlanId}
          onUpgradeClick={(pId) => setCheckoutTarget(pId)}
        />
      )}

      {/* Invoices & Receipts History */}
      <InvoiceHistorySection
        invoices={invoicesQuery.data || []}
        isLoading={invoicesQuery.isLoading}
      />

      {/* Checkout Modal */}
      {checkoutTarget && (
        <CheckoutModal
          workspaceId={workspace.id}
          plans={plans}
          initialPlanId={checkoutTarget}
          initialInterval={interval}
          initialCurrency={currency}
          onClose={() => setCheckoutTarget(null)}
        />
      )}
    </main>
  );
}
