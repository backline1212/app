import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../../../components/Dialog";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import {
  createCheckout,
  verifyPayment,
  type PlanTierOut,
  type SubscriptionOut,
} from "../api";

interface CheckoutModalProps {
  workspaceId: string;
  plans: PlanTierOut[];
  initialPlanId: "solo" | "team" | "enterprise";
  initialInterval: "monthly" | "annual";
  initialCurrency: "usd" | "inr";
  onClose: () => void;
  onSuccess?: () => void;
}

export function CheckoutModal({
  workspaceId,
  plans,
  initialPlanId,
  initialInterval,
  initialCurrency,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedPlanId, setSelectedPlanId] = useState<"solo" | "team" | "enterprise">(initialPlanId);
  const [interval, setInterval] = useState<"monthly" | "annual">(initialInterval);
  const [currency, setCurrency] = useState<"usd" | "inr">(initialCurrency);
  const [provider, setProvider] = useState<"stripe" | "razorpay">("stripe");
  const [paymentSubtype, setPaymentSubtype] = useState<"card" | "upi" | "netbanking">("card");

  // Simulated inputs for test sandbox
  const [cardNumber, setCardNumber] = useState("4242 •••• •••• 4242");
  const [cardExpiry, setCardExpiry] = useState("12/28");
  const [cardCvc, setCardCvc] = useState("123");
  const [upiId, setUpiId] = useState("team@okaxis");

  // Success celebration state
  const [completedSub, setCompletedSub] = useState<SubscriptionOut | null>(null);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[1] || plans[0];

  // Calculate pricing
  const isAnnual = interval === "annual";
  const monthlyRate =
    currency === "inr"
      ? isAnnual
        ? selectedPlan.price_annual_inr
        : selectedPlan.price_monthly_inr
      : isAnnual
      ? selectedPlan.price_annual_usd
      : selectedPlan.price_monthly_usd;

  const totalPayable = isAnnual ? monthlyRate * 12 : monthlyRate;
  const currencySymbol = currency === "inr" ? "₹" : "$";

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Create checkout session on backend
      const checkoutRes = await createCheckout(workspaceId, {
        plan_id: selectedPlanId,
        interval,
        currency,
        provider,
      });

      // Step 2: If live Stripe session url is returned and not in sandbox mode, redirect
      if (!checkoutRes.sandbox_mode && checkoutRes.checkout_url && checkoutRes.provider === "stripe") {
        window.location.href = checkoutRes.checkout_url;
        return null;
      }

      // Step 3: Complete simulated / instant test checkout flow
      const verifyRes = await verifyPayment(workspaceId, {
        plan_id: selectedPlanId,
        interval,
        currency,
        provider: checkoutRes.sandbox_mode ? "sandbox" : provider,
        stripe_session_id: checkoutRes.session_id || undefined,
        razorpay_order_id: checkoutRes.order_id || undefined,
        razorpay_payment_id: `pay_sim_${Date.now()}`,
        razorpay_signature: `sig_sim_${Date.now()}`,
        simulated: checkoutRes.sandbox_mode,
        payment_method: provider === "razorpay" ? paymentSubtype : "card",
      });

      return verifyRes;
    },
    onSuccess: (sub) => {
      if (!sub) return;
      queryClient.invalidateQueries({ queryKey: qk.subscription(workspaceId) });
      queryClient.invalidateQueries({ queryKey: qk.billingPlans(workspaceId) });
      queryClient.invalidateQueries({ queryKey: qk.invoices(workspaceId) });
      queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      queryClient.invalidateQueries({ queryKey: qk.dashboard(workspaceId) });
      setCompletedSub(sub);
      toast(`Upgraded to ${selectedPlan.name} plan successfully!`);
      if (onSuccess) onSuccess();
    },
    onError: (err) => {
      toast(err instanceof Error ? err.message : "Payment processing failed.", "error");
    },
  });

  return (
    <Dialog
      title={completedSub ? "Payment Confirmed" : `Upgrade to ${selectedPlan.name}`}
      onClose={onClose}
    >
      {completedSub ? (
        /* Success Celebration Screen */
        <div style={{ padding: "10px 0", textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "var(--mint-tint)",
              color: "var(--mint-deep)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              margin: "0 auto 16px",
            }}
          >
            🎉
          </div>

          <h3 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 8px" }}>
            Welcome to the {completedSub.plan_name} Plan!
          </h3>

          <p style={{ fontSize: "14px", color: "var(--bl-muted)", lineHeight: 1.5, margin: "0 0 24px" }}>
            Your payment of <strong>{currencySymbol}{completedSub.amount.toLocaleString()}</strong> has
            been confirmed. Your workspace now has increased project quotas, seats, and premium features!
          </p>

          <div
            style={{
              background: "var(--bl-paper)",
              borderRadius: "8px",
              padding: "16px",
              textAlign: "left",
              marginBottom: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--bl-muted)" }}>Active Plan:</span>
              <span style={{ fontWeight: 700 }}>{completedSub.plan_name} ({completedSub.interval})</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--bl-muted)" }}>Projects Limit:</span>
              <span style={{ fontWeight: 600 }}>{completedSub.usage.projects_limit >= 999 ? "Unlimited" : completedSub.usage.projects_limit}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--bl-muted)" }}>Team Member Seats:</span>
              <span style={{ fontWeight: 600 }}>{completedSub.usage.members_limit >= 999 ? "Unlimited" : completedSub.usage.members_limit}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--bl-muted)" }}>Monthly AI Credits:</span>
              <span style={{ fontWeight: 600 }}>{completedSub.usage.ai_credits_limit}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="bl-button mint"
            style={{ width: "100%", padding: "12px", fontWeight: 700, fontSize: "14px" }}
          >
            Done & Return to Workspace
          </button>
        </div>
      ) : (
        /* Checkout Flow */
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Plan & Cycle Switchers */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--bl-paper)",
              padding: "8px 12px",
              borderRadius: "6px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              {(["solo", "team", "enterprise"] as const).map((pId) => (
                <button
                  key={pId}
                  type="button"
                  onClick={() => setSelectedPlanId(pId)}
                  className={`bl-quiet ${selectedPlanId === pId ? "is-on" : ""}`}
                  style={{
                    fontSize: "12px",
                    fontWeight: selectedPlanId === pId ? 700 : 500,
                    background: selectedPlanId === pId ? "var(--bl-ink)" : "var(--bl-surface)",
                    color: selectedPlanId === pId ? "var(--bl-invert-fg)" : "var(--bl-ink)",
                  }}
                >
                  {pId.charAt(0).toUpperCase() + pId.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setInterval(interval === "monthly" ? "annual" : "monthly")}
                className="bl-quiet"
                style={{ fontSize: "11px", fontWeight: 600 }}
              >
                {interval === "annual" ? "📅 Billed Annually (-20%)" : "📅 Billed Monthly"}
              </button>

              <button
                type="button"
                onClick={() => setCurrency(currency === "usd" ? "inr" : "usd")}
                className="bl-quiet"
                style={{ fontSize: "11px", fontWeight: 700 }}
              >
                {currency.toUpperCase()}
              </button>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--bl-muted)", marginBottom: "8px" }}>
              Select Payment Method:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setProvider("stripe");
                  setPaymentSubtype("card");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                  padding: "12px",
                  borderRadius: "6px",
                  border: provider === "stripe" ? "2px solid var(--mint-deep)" : "1px solid var(--bl-line)",
                  background: provider === "stripe" ? "var(--mint-tint)" : "var(--bl-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "16px" }}>💳</span>
                  <strong style={{ fontSize: "13px" }}>Stripe Checkout</strong>
                </div>
                <small style={{ fontSize: "11px", color: "var(--bl-muted)" }}>
                  Cards, Apple Pay, Google Pay
                </small>
              </button>

              <button
                type="button"
                onClick={() => {
                  setProvider("razorpay");
                  setPaymentSubtype("upi");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                  padding: "12px",
                  borderRadius: "6px",
                  border: provider === "razorpay" ? "2px solid var(--mint-deep)" : "1px solid var(--bl-line)",
                  background: provider === "razorpay" ? "var(--mint-tint)" : "var(--bl-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "16px" }}>⚡</span>
                  <strong style={{ fontSize: "13px" }}>Razorpay & UPI</strong>
                </div>
                <small style={{ fontSize: "11px", color: "var(--bl-muted)" }}>
                  UPI (GPay/PhonePe), Netbanking
                </small>
              </button>
            </div>
          </div>

          {/* Provider Specific Details Simulation */}
          {provider === "stripe" ? (
            <div style={{ background: "var(--bl-paper)", padding: "16px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--bl-muted)", fontWeight: 600 }}>
                <span>CREDIT OR DEBIT CARD</span>
                <span>🔒 256-BIT ENCRYPTED</span>
              </div>
              <div>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="Card number"
                  className="bl-input"
                  style={{ width: "100%", background: "var(--bl-surface)" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/YY"
                  className="bl-input"
                  style={{ width: "100%", background: "var(--bl-surface)" }}
                />
                <input
                  type="text"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                  placeholder="CVC"
                  className="bl-input"
                  style={{ width: "100%", background: "var(--bl-surface)" }}
                />
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--bl-paper)", padding: "16px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                <button
                  type="button"
                  onClick={() => setPaymentSubtype("upi")}
                  className={`bl-quiet ${paymentSubtype === "upi" ? "is-on" : ""}`}
                  style={{ fontSize: "11px" }}
                >
                  ⚡ Instant UPI / QR
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSubtype("card")}
                  className={`bl-quiet ${paymentSubtype === "card" ? "is-on" : ""}`}
                  style={{ fontSize: "11px" }}
                >
                  💳 RuPay / Cards
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSubtype("netbanking")}
                  className={`bl-quiet ${paymentSubtype === "netbanking" ? "is-on" : ""}`}
                  style={{ fontSize: "11px" }}
                >
                  🏦 Netbanking
                </button>
              </div>

              {paymentSubtype === "upi" ? (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--bl-muted)", marginBottom: "4px" }}>
                    Enter UPI ID / VPA (Google Pay, PhonePe, Paytm):
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="user@upi or mobile@paytm"
                    className="bl-input"
                    style={{ width: "100%", background: "var(--bl-surface)" }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--bl-muted)" }}>
                  Supports all 50+ Indian banks, RuPay, Visa, Mastercard, and corporate cards.
                </div>
              )}
            </div>
          )}

          {/* Order Summary */}
          <div
            style={{
              borderTop: "1px solid var(--bl-line)",
              paddingTop: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{selectedPlan.name} Plan ({interval === "annual" ? "12 months" : "1 month"})</span>
              <span style={{ fontWeight: 600 }}>
                {currencySymbol}{totalPayable.toLocaleString()}
              </span>
            </div>
            {isAnnual && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--mint-deep)", fontSize: "12px" }}>
                <span>Annual Billing Discount</span>
                <span>Applied (~20% off)</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "16px",
                fontWeight: 800,
                borderTop: "1px solid var(--bl-line)",
                paddingTop: "8px",
                marginTop: "4px",
              }}
            >
              <span>Total Payable Now:</span>
              <span style={{ color: "var(--mint-deep)" }}>
                {currencySymbol}{totalPayable.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button
              type="button"
              className="bl-quiet"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={checkoutMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bl-button mint"
              style={{ flex: 2, padding: "12px", fontWeight: 700 }}
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending
                ? "Processing Payment…"
                : `Pay ${currencySymbol}${totalPayable.toLocaleString()} & Activate`}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
