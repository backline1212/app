import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import { cancelSubscription, createPortalSession, type SubscriptionOut } from "../api";

interface CurrentPlanBannerProps {
  subscription: SubscriptionOut;
  onUpgradeClick: () => void;
}

export function CurrentPlanBanner({
  subscription,
  onUpgradeClick,
}: CurrentPlanBannerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const isFree = subscription.plan_id === "free";
  const { usage } = subscription;

  const projectPct = Math.min(
    100,
    Math.round((usage.projects_used / Math.max(1, usage.projects_limit)) * 100),
  );
  const memberPct = Math.min(
    100,
    Math.round((usage.members_used / Math.max(1, usage.members_limit)) * 100),
  );
  const aiPct = Math.min(
    100,
    Math.round((usage.ai_credits_used / Math.max(1, usage.ai_credits_limit)) * 100),
  );

  const portalMutation = useMutation({
    mutationFn: () => createPortalSession(subscription.workspace_id),
    onSuccess: (res) => {
      if (res.portal_url && res.portal_url.startsWith("http")) {
        window.location.href = res.portal_url;
      } else {
        toast("Billing portal is ready.");
      }
    },
    onError: () => {
      toast("Could not open billing portal.", "error");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription(subscription.workspace_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.subscription(subscription.workspace_id) });
      queryClient.invalidateQueries({ queryKey: qk.billingPlans(subscription.workspace_id) });
      queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      toast("Subscription downgraded to Free.");
      setShowCancelConfirm(false);
    },
    onError: () => {
      toast("Could not cancel subscription.", "error");
    },
  });

  const renewalDate = subscription.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <section
      className="bl-attention bl-settings-section"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "24px",
        background: "var(--bl-surface)",
        border: "1px solid var(--bl-line)",
        borderRadius: "8px",
        marginBottom: "32px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          borderBottom: "1px solid var(--bl-line)",
          paddingBottom: "20px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--bl-muted)",
              }}
            >
              Current Active Plan
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "12px",
                background: isFree ? "var(--bl-paper)" : "var(--mint-tint)",
                color: isFree ? "var(--ink-2)" : "var(--mint-deep)",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: isFree ? "var(--ink-3)" : "var(--mint-deep)",
                }}
              />
              {subscription.status.toUpperCase()}
            </span>
          </div>

          <h2 style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            {subscription.plan_name} Plan
          </h2>

          <p style={{ fontSize: "13px", color: "var(--bl-muted)", margin: 0 }}>
            {isFree ? (
              "You are on the Free tier with essential review tools and standard quotas."
            ) : (
              <>
                Billed {subscription.interval} (
                {subscription.currency === "inr" ? "₹" : "$"}
                {subscription.amount.toLocaleString()})
                {renewalDate && ` · Next renewal on ${renewalDate}`}
              </>
            )}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {isFree ? (
            <button
              type="button"
              onClick={onUpgradeClick}
              className="bl-button mint"
              style={{ padding: "9px 18px", fontWeight: 700 }}
            >
              ⭐ Upgrade Plan
            </button>
          ) : (
            <>
              {subscription.provider === "stripe" && (
                <button
                  type="button"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  className="bl-quiet"
                >
                  {portalMutation.isPending ? "Opening…" : "Manage in Stripe"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="bl-quiet"
                style={{ color: "var(--bl-error)" }}
              >
                Cancel Subscription
              </button>
            </>
          )}
        </div>
      </div>

      {/* Usage Progress Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
        {/* Projects Usage */}
        <div style={{ background: "var(--bl-paper)", padding: "16px", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px" }}>
            <span style={{ fontWeight: 600 }}>Active Projects</span>
            <span style={{ color: "var(--bl-muted)" }}>
              {usage.projects_used} / {usage.projects_limit >= 999 ? "∞" : usage.projects_limit}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "6px",
              background: "var(--bl-line)",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${projectPct}%`,
                height: "100%",
                background: projectPct >= 90 ? "var(--bl-error)" : "var(--mint-deep)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Members Usage */}
        <div style={{ background: "var(--bl-paper)", padding: "16px", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px" }}>
            <span style={{ fontWeight: 600 }}>Team Seats</span>
            <span style={{ color: "var(--bl-muted)" }}>
              {usage.members_used} / {usage.members_limit >= 999 ? "∞" : usage.members_limit}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "6px",
              background: "var(--bl-line)",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${memberPct}%`,
                height: "100%",
                background: memberPct >= 90 ? "var(--bl-error)" : "var(--mint-deep)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* AI Usage */}
        <div style={{ background: "var(--bl-paper)", padding: "16px", borderRadius: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px" }}>
            <span style={{ fontWeight: 600 }}>AI Actions (Monthly)</span>
            <span style={{ color: "var(--bl-muted)" }}>
              {usage.ai_credits_used} / {usage.ai_credits_limit}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "6px",
              background: "var(--bl-line)",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${aiPct}%`,
                height: "100%",
                background: aiPct >= 90 ? "var(--bl-error)" : "var(--mint-deep)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "var(--bl-surface)",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 10px" }}>
              Cancel your {subscription.plan_name} subscription?
            </h3>
            <p style={{ fontSize: "13px", color: "var(--bl-muted)", lineHeight: 1.5, margin: "0 0 20px" }}>
              Your workspace will revert to the Free plan. You will lose access to premium features,
              additional project slots, and higher AI quotas.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="bl-quiet"
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep Subscription
              </button>
              <button
                type="button"
                className="bl-button"
                style={{ background: "var(--bl-error)", color: "#fff" }}
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? "Cancelling…" : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
