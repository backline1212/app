import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import {
  createCheckout,
  getBillingPlans,
  getSubscription,
  isPaidPlanId,
  listInvoices,
  verifyPayment,
  type BillingCurrency,
  type BillingInterval,
  type CheckoutRequest,
  type PaidPlanId,
  type SubscriptionOut,
} from "../billing/api";
import { CheckoutModal } from "../billing/components/CheckoutModal";
import { CurrentPlanBanner } from "../billing/components/CurrentPlanBanner";
import { InvoiceHistorySection } from "../billing/components/InvoiceHistorySection";
import { PlanComparisonMatrix } from "../billing/components/PlanComparisonMatrix";
import { PlanPricingCard } from "../billing/components/PlanPricingCard";
import { formatDate, limitLabel } from "../billing/format";
import { payWithRazorpay } from "../billing/razorpay";
import type { WorkspaceOut } from "./api";

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function PaymentConfirmedDialog({ subscription, onClose }: { subscription: SubscriptionOut; onClose: () => void }) {
  const test = subscription.provider === "sandbox";
  return (
    <Dialog title={test ? "Test payment complete" : "Payment confirmed"} onClose={onClose}>
      <div className="bl-form">
        <p>
          <b>{subscription.plan_name}</b> is active
          {subscription.current_period_end ? ` until ${formatDate(subscription.current_period_end)}` : ""}.
          {test && " Nothing was charged."}
        </p>
        <dl className="bl-checkout-summary">
          <div><dt>Active projects</dt><dd>{limitLabel(subscription.usage.projects_limit)}</dd></div>
          <div><dt>Team seats</dt><dd>{limitLabel(subscription.usage.members_limit)}</dd></div>
          <div><dt>AI credits a month</dt><dd>{limitLabel(subscription.usage.ai_credits_limit)}</dd></div>
        </dl>
        <footer className="bl-dialog-actions">
          <button type="button" className="bl-button mint" onClick={onClose}>Done</button>
        </footer>
      </div>
    </Dialog>
  );
}

export function BillingPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle("Billing & plans");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  // Period and currency are view filters, so they live in the URL like other filters.
  const interval: BillingInterval = params.get("interval") === "monthly" ? "monthly" : "annual";
  const currency: BillingCurrency = params.get("currency") === "inr" ? "inr" : "usd";
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlanId | null>(null);
  const [confirmed, setConfirmed] = useState<SubscriptionOut | null>(null);

  const plansQuery = useQuery({
    queryKey: qk.billingPlans(workspace.id),
    queryFn: () => getBillingPlans(workspace.id),
    staleTime: 5 * 60_000,
  });
  const subscriptionQuery = useQuery({
    queryKey: qk.subscription(workspace.id),
    queryFn: () => getSubscription(workspace.id),
  });
  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
  });

  const updateParams = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const onPaid = (subscription: SubscriptionOut) => {
    queryClient.setQueryData(qk.subscription(workspace.id), subscription);
    void queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
    void queryClient.invalidateQueries({ queryKey: qk.workspaces() });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard(workspace.id) });
    setCheckoutPlan(null);
    setConfirmed(subscription);
  };

  const pay = useMutation({
    mutationFn: async (request: CheckoutRequest): Promise<SubscriptionOut | null> => {
      const checkout = await createCheckout(workspace.id, request);
      if (checkout.checkout_url) {
        // Stripe-hosted checkout; the confirm happens when Stripe sends the payer back.
        window.location.assign(checkout.checkout_url);
        return new Promise<never>(() => undefined);
      }
      if (checkout.razorpay_order_id && checkout.razorpay_key_id) {
        // Close our dialog first: a native modal <dialog> makes everything outside it
        // inert, which would include Razorpay's own payment window.
        setCheckoutPlan(null);
        const payment = await payWithRazorpay({
          keyId: checkout.razorpay_key_id,
          orderId: checkout.razorpay_order_id,
          amountMinor: checkout.amount_minor,
          description: `${checkout.plan_name} · ${checkout.interval === "annual" ? "12 months" : "1 month"}`,
        });
        if (!payment) {
          toast("Payment canceled. Nothing was charged.", "warning");
          return null;
        }
        try {
          return await verifyPayment(workspace.id, {
            checkout_id: checkout.checkout_id,
            razorpay_payment_id: payment.razorpay_payment_id,
            razorpay_signature: payment.razorpay_signature,
          });
        } catch (err) {
          throw new Error(
            `Razorpay took the payment, but Backline couldn't confirm it yet (${errorMessage(err, "network error")}). ` +
              "Don't pay again. If the plan hasn't updated in a few minutes, give Backline support this payment ref: " +
              payment.razorpay_payment_id,
          );
        }
      }
      return verifyPayment(workspace.id, { checkout_id: checkout.checkout_id });
    },
    onSuccess: (subscription) => subscription && onPaid(subscription),
    onError: (err) => toast(errorMessage(err, "The payment didn't go through."), "error"),
  });

  // Back from Stripe: ?checkout=success&checkout_id=... (or ?checkout=canceled).
  const { mutate: confirmReturn } = useMutation({
    mutationFn: (checkoutId: string) => verifyPayment(workspace.id, { checkout_id: checkoutId }),
    onSuccess: onPaid,
    onError: (err) => toast(errorMessage(err, "Couldn't confirm the payment yet."), "warning"),
  });
  const returnStatus = params.get("checkout");
  const returnCheckoutId = params.get("checkout_id");
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!returnStatus || handledReturn.current) return;
    handledReturn.current = true;
    if (returnStatus === "success" && returnCheckoutId) confirmReturn(returnCheckoutId);
    else if (returnStatus === "canceled") toast("Checkout canceled. Nothing was charged.", "warning");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("checkout");
        next.delete("checkout_id");
        return next;
      },
      { replace: true },
    );
  }, [returnStatus, returnCheckoutId, confirmReturn, setParams, toast]);

  // ?upgrade=<plan> from limit prompts elsewhere in the app.
  const upgradeParam = params.get("upgrade");
  const subscription = subscriptionQuery.data;
  useEffect(() => {
    if (!upgradeParam || !subscription) return;
    if (isPaidPlanId(upgradeParam)) {
      if (subscription.is_owner) setCheckoutPlan(upgradeParam);
      else toast("Only the workspace owner can change the plan.", "warning");
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("upgrade");
        return next;
      },
      { replace: true },
    );
  }, [upgradeParam, subscription, setParams, toast]);

  const plans = plansQuery.data?.plans ?? [];
  const currentPlanId = subscription?.plan_id ?? "free";
  const canManage = subscription?.is_owner ?? false;

  return (
    <main className="bl-wrap bl-billing">
      <header className="bl-head">
        <div>
          <h1>Billing & plans</h1>
          <p>Prepaid monthly or yearly. Plans never renew or charge on their own.</p>
        </div>
      </header>

      {subscriptionQuery.isError ? (
        <div className="bl-billing-section" role="alert">
          <p className="bl-error">{errorMessage(subscriptionQuery.error, "Couldn't load this workspace's plan.")}</p>
          <button type="button" className="bl-quiet" onClick={() => void subscriptionQuery.refetch()}>Try again</button>
        </div>
      ) : subscription ? (
        <CurrentPlanBanner subscription={subscription} onChoosePlan={setCheckoutPlan} />
      ) : (
        <p className="bl-billing-muted" role="status">Loading your plan…</p>
      )}

      <section className="bl-billing-section" aria-labelledby="bl-plans-title">
        <header className="bl-billing-section-head">
          <div>
            <h2 id="bl-plans-title">Plans</h2>
            <p>Unlimited guest and client reviewers on every plan.</p>
          </div>
          <div className="bl-billing-filters">
            <div className="bl-segment" role="group" aria-label="Billing period">
              <button type="button" aria-pressed={interval === "monthly"} onClick={() => updateParams({ interval: "monthly" })}>Monthly</button>
              <button type="button" aria-pressed={interval === "annual"} onClick={() => updateParams({ interval: null })}>Yearly · save ~20%</button>
            </div>
            <div className="bl-segment" role="group" aria-label="Currency">
              <button type="button" aria-pressed={currency === "usd"} onClick={() => updateParams({ currency: null })}>$ USD</button>
              <button type="button" aria-pressed={currency === "inr"} onClick={() => updateParams({ currency: "inr" })}>₹ INR</button>
            </div>
          </div>
        </header>

        {plansQuery.isError ? (
          <p className="bl-error" role="alert">{errorMessage(plansQuery.error, "Couldn't load plans.")}</p>
        ) : plansQuery.isLoading ? (
          <p className="bl-billing-muted" role="status">Loading plans…</p>
        ) : (
          <div className="bl-price-grid">
            {plans.map((plan) => (
              <PlanPricingCard
                key={plan.id}
                plan={plan}
                interval={interval}
                currency={currency}
                currentPlanId={currentPlanId}
                canManage={canManage}
                onSelect={setCheckoutPlan}
              />
            ))}
          </div>
        )}
      </section>

      {plansQuery.data && (
        <PlanComparisonMatrix plans={plans} categories={plansQuery.data.categories} currentPlanId={currentPlanId} />
      )}

      <InvoiceHistorySection
        invoices={invoicesQuery.data ?? []}
        isLoading={invoicesQuery.isLoading}
        workspaceName={workspace.name}
      />

      {checkoutPlan && subscription && plansQuery.data && (
        <CheckoutModal
          plans={plans}
          paymentOptions={plansQuery.data.payment_options}
          subscription={subscription}
          initialPlanId={checkoutPlan}
          initialInterval={interval}
          initialCurrency={currency}
          isPaying={pay.isPending}
          onPay={(request) => pay.mutate(request)}
          onClose={() => !pay.isPending && setCheckoutPlan(null)}
        />
      )}
      {confirmed && <PaymentConfirmedDialog subscription={confirmed} onClose={() => setConfirmed(null)} />}
    </main>
  );
}
