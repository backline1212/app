import { useState } from "react";
import { Dialog } from "../../../components/Dialog";
import {
  PAID_PLAN_IDS,
  type BillingCurrency,
  type BillingInterval,
  type CheckoutProvider,
  type CheckoutRequest,
  type PaidPlanId,
  type PaymentOptionsOut,
  type PlanTierOut,
  type SubscriptionOut,
} from "../api";
import { formatDate, formatMoney, periodTotal } from "../format";

const PERIOD_DAYS: Record<BillingInterval, number> = { monthly: 30, annual: 365 };

const GATEWAYS: Record<CheckoutProvider, { title: string; methods: string; handoff: string }> = {
  stripe: {
    title: "Card or wallet",
    methods: "Visa, Mastercard, Amex, Apple Pay, Google Pay",
    handoff: "You'll pay on Stripe's secure checkout page, then come straight back here.",
  },
  razorpay: {
    title: "UPI, RuPay & netbanking",
    methods: "Scan a UPI QR or enter a UPI ID, Indian cards, netbanking - in ₹ INR",
    handoff: "Razorpay's payment window opens next. Backline never sees your payment details.",
  },
};

interface CheckoutModalProps {
  plans: PlanTierOut[];
  paymentOptions: PaymentOptionsOut;
  subscription: SubscriptionOut;
  initialPlanId: PaidPlanId;
  initialInterval: BillingInterval;
  initialCurrency: BillingCurrency;
  isPaying: boolean;
  onPay: (request: CheckoutRequest) => void;
  onClose: () => void;
}

export function CheckoutModal({
  plans,
  paymentOptions,
  subscription,
  initialPlanId,
  initialInterval,
  initialCurrency,
  isPaying,
  onPay,
  onClose,
}: CheckoutModalProps) {
  const live: Record<CheckoutProvider, boolean> = {
    stripe: paymentOptions.stripe_live,
    razorpay: paymentOptions.razorpay_live,
  };
  const usable = (gateway: CheckoutProvider) => live[gateway] || paymentOptions.sandbox;

  const [planId, setPlanId] = useState<PaidPlanId>(initialPlanId);
  const [interval, setBillingInterval] = useState<BillingInterval>(initialInterval);
  const [currency, setCurrency] = useState<BillingCurrency>(initialCurrency);
  const [provider, setProvider] = useState<CheckoutProvider>(
    initialCurrency === "inr" && usable("razorpay") ? "razorpay" : "stripe",
  );

  const plan = plans.find((p) => p.id === planId);
  if (!plan) return null;

  const chooseProvider = (next: CheckoutProvider) => {
    setProvider(next);
    if (next === "razorpay") setCurrency("inr");
  };
  const chooseCurrency = (next: BillingCurrency) => {
    setCurrency(next);
    if (next === "usd" && provider === "razorpay") setProvider("stripe");
  };

  const total = periodTotal(plan, interval, currency);
  const testMode = !live[provider] && paymentOptions.sandbox;
  const canPay = usable(provider);

  // What this payment covers: paying for the plan you're already on extends it from the
  // current end date (backend's _activate_checkout); any other plan starts today.
  const now = new Date();
  const currentEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
  const extending = subscription.plan_id === planId && currentEnd !== null && currentEnd > now;
  const coversFrom = extending && currentEnd ? currentEnd : now;
  const coversTo = new Date(coversFrom.getTime() + PERIOD_DAYS[interval] * 86_400_000);
  const replacesPaidPlan = subscription.plan_id !== "free" && subscription.plan_id !== planId;

  const payLabel = testMode
    ? `Complete test payment of ${formatMoney(total, currency)}`
    : provider === "stripe"
      ? `Continue to Stripe · ${formatMoney(total, currency)}`
      : `Pay ${formatMoney(total, currency)} with Razorpay`;

  return (
    <Dialog title={`Get ${plan.name}`} onClose={onClose}>
      <form
        className="bl-form bl-checkout"
        onSubmit={(event) => {
          event.preventDefault();
          if (canPay) onPay({ plan_id: planId, interval, currency, provider });
        }}
      >
        {testMode && (
          <p className="bl-checkout-test" role="note">
            <b>Test mode.</b> {provider === "stripe" ? "Stripe" : "Razorpay"} isn't connected on this server, so this
            completes as a test payment: the plan activates and nothing is charged.
          </p>
        )}

        <fieldset>
          <legend>Plan</legend>
          <div className="bl-segment">
            {PAID_PLAN_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={planId === id} onClick={() => setPlanId(id)}>
                {plans.find((p) => p.id === id)?.name ?? id}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="bl-checkout-row">
          <fieldset>
            <legend>Billing period</legend>
            <div className="bl-segment">
              <button type="button" aria-pressed={interval === "monthly"} onClick={() => setBillingInterval("monthly")}>Monthly</button>
              <button type="button" aria-pressed={interval === "annual"} onClick={() => setBillingInterval("annual")}>Yearly · save ~20%</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>Currency</legend>
            <div className="bl-segment">
              <button type="button" aria-pressed={currency === "usd"} onClick={() => chooseCurrency("usd")}>$ USD</button>
              <button type="button" aria-pressed={currency === "inr"} onClick={() => chooseCurrency("inr")}>₹ INR</button>
            </div>
          </fieldset>
        </div>

        <fieldset>
          <legend>Pay with</legend>
          <div className="bl-gateways">
            {(Object.keys(GATEWAYS) as CheckoutProvider[]).map((gateway) => (
              <button
                key={gateway}
                type="button"
                className="bl-gateway"
                aria-pressed={provider === gateway}
                disabled={!usable(gateway)}
                onClick={() => chooseProvider(gateway)}
              >
                <strong>{GATEWAYS[gateway].title}</strong>
                <small>{usable(gateway) ? GATEWAYS[gateway].methods : "Not set up on this server"}</small>
              </button>
            ))}
          </div>
          {canPay && !testMode && <small>{GATEWAYS[provider].handoff}</small>}
        </fieldset>

        <dl className="bl-checkout-summary">
          <div>
            <dt>{plan.name} · {interval === "annual" ? "12 months" : "1 month"}</dt>
            <dd>{formatMoney(total, currency)}</dd>
          </div>
          <div>
            <dt>Covers</dt>
            <dd>{formatDate(coversFrom.toISOString())} – {formatDate(coversTo.toISOString())}</dd>
          </div>
          <div className="is-total">
            <dt>Due today</dt>
            <dd>{formatMoney(total, currency)}</dd>
          </div>
        </dl>

        {replacesPaidPlan && (
          <p className="bl-checkout-warn" role="note">
            Your {subscription.plan_name} plan ends when this payment goes through. Its remaining time isn't carried over.
          </p>
        )}
        {!canPay && <p className="bl-error" role="alert">Payments aren't set up on this server yet.</p>}
        <p className="bl-billing-muted">One-time payment for this period - nothing renews automatically.</p>

        <footer className="bl-dialog-actions">
          <button type="button" className="bl-quiet" onClick={onClose} disabled={isPaying}>Cancel</button>
          <button type="submit" className="bl-button mint" disabled={!canPay || isPaying}>
            {isPaying ? "Processing…" : payLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
