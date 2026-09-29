// Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/):
// Razorpay's own payment sheet collects the UPI ID / QR scan, card or netbanking
// choice, so no payment details ever pass through Backline's UI.
const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

let scriptLoad: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      script.remove();
      reject(new Error("Couldn't load Razorpay. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/** Opens Razorpay's payment sheet. Resolves with the signed payment on success, or
 * null when the payer closes the sheet without paying. */
export async function payWithRazorpay(options: {
  keyId: string;
  orderId: string;
  amountMinor: number;
  description: string;
}): Promise<RazorpaySuccess | null> {
  await loadCheckoutScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay didn't start. Reload the page and try again.");
  return new Promise((resolve) => {
    new Razorpay({
      key: options.keyId,
      order_id: options.orderId,
      amount: options.amountMinor,
      currency: "INR",
      name: "Backline",
      description: options.description,
      handler: resolve,
      modal: { ondismiss: () => resolve(null) },
      theme: { color: "#0a6b4b" },
    }).open();
  });
}
