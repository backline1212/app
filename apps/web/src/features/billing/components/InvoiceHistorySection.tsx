import { InvoiceArt } from "../../../components/illustrations";
import type { InvoiceOut } from "../api";
import { formatDate, formatMoney } from "../format";

const PROVIDER_LABEL: Record<InvoiceOut["provider"], string> = {
  stripe: "Stripe",
  razorpay: "Razorpay",
  sandbox: "Test payment",
};

// Stripe payments link to Stripe's own invoice PDF. Razorpay and test payments get a
// plain-text receipt built from the invoice record instead.
function downloadReceipt(invoice: InvoiceOut, workspaceName: string) {
  const lines = [
    "Backline - payment receipt",
    "",
    `Receipt:        ${invoice.invoice_number}`,
    `Workspace:      ${workspaceName}`,
    `Paid on:        ${formatDate(invoice.paid_at)}`,
    `Plan:           ${invoice.plan_name} (${invoice.interval})`,
    `Covers:         ${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}`,
    `Amount:         ${formatMoney(invoice.amount_paid, invoice.currency)}`,
    `Paid via:       ${PROVIDER_LABEL[invoice.provider]}`,
    ...(invoice.provider_payment_id ? [`Payment ref:    ${invoice.provider_payment_id}`] : []),
    ...(invoice.provider === "sandbox" ? ["", "TEST PAYMENT - no money was charged."] : []),
  ];
  const url = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoice.invoice_number}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function InvoiceHistorySection({
  invoices,
  isLoading,
  workspaceName,
}: {
  invoices: InvoiceOut[];
  isLoading: boolean;
  workspaceName: string;
}) {
  return (
    <section className="bl-billing-section" aria-labelledby="bl-invoices-title">
      <header className="bl-billing-section-head">
        <div>
          <h2 id="bl-invoices-title">Invoices & receipts</h2>
          <p>Every payment for this workspace, newest first.</p>
        </div>
      </header>

      {isLoading ? (
        <p className="bl-billing-muted" role="status">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <div className="bl-billing-empty">
          <InvoiceArt />
          <p>No invoices yet. They appear here after the first payment.</p>
        </div>
      ) : (
        <div className="bl-table-wrap">
          <table className="bl-table bl-invoices">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Paid on</th>
                <th scope="col">Plan</th>
                <th scope="col">Covers</th>
                <th scope="col">Amount</th>
                <th scope="col"><span className="sr-only">Receipt</span></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="bl-invoice-number">
                    {invoice.invoice_number}
                    {invoice.provider === "sandbox" && <em className="bl-compare-soon">Test</em>}
                  </td>
                  <td>{formatDate(invoice.paid_at)}</td>
                  <td>{invoice.plan_name} · {invoice.interval}</td>
                  <td>{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</td>
                  <td><strong>{formatMoney(invoice.amount_paid, invoice.currency)}</strong></td>
                  <td className="bl-invoice-actions">
                    {invoice.pdf_url || invoice.hosted_invoice_url ? (
                      <a className="bl-quiet" href={invoice.pdf_url ?? invoice.hosted_invoice_url ?? undefined} target="_blank" rel="noreferrer">
                        {invoice.pdf_url ? "Download PDF" : "View invoice"}
                      </a>
                    ) : (
                      <button type="button" className="bl-quiet" onClick={() => downloadReceipt(invoice, workspaceName)}>
                        Download receipt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
