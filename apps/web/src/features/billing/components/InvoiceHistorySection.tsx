import { useToast } from "../../../components/Toast";
import type { InvoiceOut } from "../api";

interface InvoiceHistorySectionProps {
  invoices: InvoiceOut[];
  isLoading?: boolean;
}

export function InvoiceHistorySection({ invoices, isLoading }: InvoiceHistorySectionProps) {
  const { toast } = useToast();

  const handleDownload = (inv: InvoiceOut) => {
    // Generate simulated downloadable receipt
    const content = `======================================================
BACKLINE QA & VISUAL REVIEW PLATFORM - TAX RECEIPT
======================================================
Invoice Number : ${inv.invoice_number}
Date           : ${new Date(inv.paid_at).toLocaleDateString()}
Workspace ID   : ${inv.workspace_id}
Plan           : ${inv.plan_name} (${inv.interval.toUpperCase()})
Billing Period : ${new Date(inv.period_start).toLocaleDateString()} - ${new Date(inv.period_end).toLocaleDateString()}
Amount Paid    : ${inv.currency.toUpperCase()} ${inv.amount_paid.toFixed(2)}
Payment Status : ${inv.status.toUpperCase()}
Provider       : ${inv.provider.toUpperCase()}
======================================================
Thank you for your business!
For questions, contact billing@backline.app
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoice_number}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Receipt for ${inv.invoice_number} downloaded.`);
  };

  return (
    <section
      className="bl-attention bl-settings-section"
      style={{
        marginTop: "32px",
        background: "var(--bl-surface)",
        border: "1px solid var(--bl-line)",
        borderRadius: "8px",
        padding: "24px",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px" }}>
          Invoices & Receipts
        </h3>
        <p style={{ fontSize: "12px", color: "var(--bl-muted)", margin: 0 }}>
          View and download your past monthly or annual subscription invoices.
        </p>
      </div>

      {isLoading ? (
        <p style={{ fontSize: "13px", color: "var(--bl-muted)", padding: "20px 0" }}>
          Loading invoices…
        </p>
      ) : invoices.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            background: "var(--bl-paper)",
            borderRadius: "6px",
          }}
        >
          <p style={{ fontSize: "13px", color: "var(--bl-muted)", margin: 0 }}>
            No past invoices found. Invoices will appear here after upgrading to a paid plan.
          </p>
        </div>
      ) : (
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
              <tr style={{ borderBottom: "1px solid var(--bl-line)" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Invoice #</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Plan</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Amount</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>
                  Receipt
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  style={{
                    borderBottom: "1px solid var(--bl-line)",
                    transition: "background 0.1s ease",
                  }}
                >
                  <td style={{ padding: "12px", fontWeight: 600, fontFamily: "var(--mono)" }}>
                    {inv.invoice_number}
                  </td>
                  <td style={{ padding: "12px", color: "var(--bl-muted)" }}>
                    {new Date(inv.paid_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {inv.plan_name} ({inv.interval})
                  </td>
                  <td style={{ padding: "12px", fontWeight: 600 }}>
                    {inv.currency.toUpperCase() === "INR" ? "₹" : "$"}
                    {inv.amount_paid.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background: "var(--mint-tint)",
                        color: "var(--mint-deep)",
                      }}
                    >
                      ✓ {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => handleDownload(inv)}
                      className="bl-quiet"
                      style={{ fontSize: "11px", padding: "4px 8px" }}
                    >
                      Download PDF
                    </button>
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
