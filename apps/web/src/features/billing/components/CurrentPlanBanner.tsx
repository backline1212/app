import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../../components/Dialog";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import { cancelSubscription, createPortalSession, type PaidPlanId, type SubscriptionOut } from "../api";
import { formatDate, formatMoney, limitLabel } from "../format";

// Renewal nudges start this many days before a paid period ends.
const RENEW_SOON_DAYS = 7;

function UsageMeter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note?: string }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const tone = limit !== null && used >= limit ? " is-full" : pct >= 80 ? " is-high" : "";
  return (
    <div className="bl-usage">
      <p>
        <span>{label}</span>
        <b>{used.toLocaleString()} / {limitLabel(limit)}</b>
      </p>
      <div
        className={`bl-usage-bar${tone}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${limitLabel(limit)}`}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

export function CurrentPlanBanner({
  subscription,
  onChoosePlan,
}: {
  subscription: SubscriptionOut;
  onChoosePlan: (planId: PaidPlanId) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);
  const { usage, is_owner: isOwner } = subscription;
  const isFree = subscription.plan_id === "free";
  const periodEnd = subscription.current_period_end;
  const daysLeft = periodEnd ? Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86_400_000) : null;
  const renewSoon = !isFree && daysLeft !== null && daysLeft <= RENEW_SOON_DAYS;

  const portal = useMutation({
    mutationFn: () => createPortalSession(subscription.workspace_id),
    onSuccess: (res) => window.location.assign(res.portal_url),
    onError: (err) => toast(err instanceof Error ? err.message : "Couldn't open Stripe.", "error"),
  });

  const downgrade = useMutation({
    mutationFn: () => cancelSubscription(subscription.workspace_id),
    onSuccess: (next) => {
      queryClient.setQueryData(qk.subscription(subscription.workspace_id), next);
      void queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      setConfirmDowngrade(false);
      toast("This workspace is on Free Starter now.");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Couldn't change the plan.", "error"),
  });

  let summary: string;
  if (subscription.status === "expired") {
    summary = `Your ${subscription.expired_plan_name} plan ended${periodEnd ? ` on ${formatDate(periodEnd)}` : ""}. Renew it to get its limits back.`;
  } else if (isFree) {
    summary = "Free forever. Upgrade any time for more projects, seats and AI credits.";
  } else {
    const price = subscription.currency ? `${formatMoney(subscription.amount, subscription.currency)} ${subscription.interval === "annual" ? "a year" : "a month"}` : null;
    summary = [
      periodEnd && `Paid through ${formatDate(periodEnd)}`,
      price,
      "Plans don't renew automatically.",
    ].filter(Boolean).join(" · ");
  }

  return (
    <section className={`bl-plan-banner${subscription.status === "expired" || renewSoon ? " is-attention" : ""}`} aria-labelledby="bl-plan-banner-title">
      <div className="bl-plan-banner-head">
        <div>
          <p className="bl-eyebrow">Current plan</p>
          <h2 id="bl-plan-banner-title">
            {subscription.plan_name}
            {subscription.status === "expired" && <span className="bl-plan-chip is-warn">Expired</span>}
            {subscription.provider === "sandbox" && <span className="bl-plan-chip">Test payment</span>}
            {renewSoon && daysLeft !== null && <span className="bl-plan-chip is-warn">{daysLeft <= 0 ? "Ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}</span>}
          </h2>
          <p>{summary}</p>
        </div>

        {isOwner ? (
          <div className="bl-plan-banner-actions">
            {isFree ? (
              <button type="button" className="bl-button mint" onClick={() => onChoosePlan(subscription.expired_plan_id ?? "solo")}>
                {subscription.expired_plan_id ? `Renew ${subscription.expired_plan_name}` : "Upgrade"}
              </button>
            ) : (
              <>
                <button type="button" className={`bl-button${renewSoon ? " mint" : ""}`} onClick={() => onChoosePlan(subscription.plan_id as PaidPlanId)}>
                  Renew
                </button>
                {subscription.stripe_portal_available && (
                  <button type="button" className="bl-quiet" disabled={portal.isPending} onClick={() => portal.mutate()}>
                    {portal.isPending ? "Opening Stripe…" : "Billing details in Stripe"}
                  </button>
                )}
                <button type="button" className="bl-quiet" onClick={() => setConfirmDowngrade(true)}>
                  Switch to Free
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="bl-billing-muted">Only the workspace owner can change the plan.</p>
        )}
      </div>

      <div className="bl-usage-grid">
        <UsageMeter label="Active projects" used={usage.projects_used} limit={usage.projects_limit} />
        <UsageMeter label="Team seats" used={usage.members_used} limit={usage.members_limit} />
        <UsageMeter
          label="AI credits this month"
          used={usage.ai_credits_used}
          limit={usage.ai_credits_limit}
          note={`Resets ${formatDate(usage.ai_credits_reset_at)}`}
        />
      </div>

      {confirmDowngrade && (
        <Dialog title={`Switch to Free Starter?`} onClose={() => setConfirmDowngrade(false)}>
          <div className="bl-form">
            <p>
              {subscription.plan_name} ends now and the rest of this period isn't refunded. Existing projects and
              members stay, but you can't add more beyond the Free Starter limits.
            </p>
            <footer className="bl-dialog-actions">
              <button type="button" className="bl-quiet" onClick={() => setConfirmDowngrade(false)}>
                Keep {subscription.plan_name}
              </button>
              <button type="button" className="bl-button" disabled={downgrade.isPending} onClick={() => downgrade.mutate()}>
                {downgrade.isPending ? "Switching…" : "Switch to Free"}
              </button>
            </footer>
          </div>
        </Dialog>
      )}
    </section>
  );
}
