import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { getTopOpenDialog, subscribeOpenDialogs } from "../lib/dialog-stack";

type ToastVariant = "success" | "error" | "warning" | "progress";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  addedAt: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Record<ToastVariant, number | null> = {
  success: 4000,
  warning: 6000,
  error: 8000,
  progress: null, // manual dismiss only
};

const DEDUP_WINDOW_MS = 1000;
const MAX_TOASTS = 4;

let idCounter = 0;
function genId() {
  return `toast-${++idCounter}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Track recent messages for deduplication: key = "variant:message"
  const recentRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const dedupKey = `${variant}:${message}`;
      const now = Date.now();
      const lastSeen = recentRef.current.get(dedupKey);
      if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) {
        // Duplicate within dedup window — skip
        return;
      }
      recentRef.current.set(dedupKey, now);

      const id = genId();
      setItems((prev) => {
        // LIFO: new item at start; keep only MAX_TOASTS (oldest = last = auto-clear)
        const next = [{ id, message, variant, addedAt: now }, ...prev];
        return next.slice(0, MAX_TOASTS);
      });

      const delay = AUTO_DISMISS_MS[variant];
      if (delay !== null) {
        setTimeout(() => dismiss(id), delay);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  progress: "↻",
};

function ToastContainer({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  // A native <dialog> opened via .showModal() renders in the browser's top layer,
  // which paints above the entire regular document regardless of z-index - this
  // fixed-position container is an ordinary document citizen, so without this it
  // silently renders behind any currently-open dialog (AccountModal, ProjectPagesModal,
  // ShareProjectModal all toast while staying open, including on error - a hidden
  // error toast reads as a silent failure). Portal into the topmost open dialog and
  // reposition to its own top-right corner instead of the viewport's when one exists.
  const topDialog = useSyncExternalStore(subscribeOpenDialogs, getTopOpenDialog, () => null);

  if (items.length === 0) return null;
  const container = (
    <div className={`bl-toasts${topDialog ? " in-dialog" : ""}`} aria-label="Notifications">
      {items.map((item) => (
        <ToastEntry key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
  return topDialog ? createPortal(container, topDialog) : container;
}

function ToastEntry({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const role = item.variant === "error" ? "alert" : "status";
  return (
    <div
      className={`bl-toast ${item.variant}`}
      role={role}
      aria-live={item.variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span className="bl-toast-icon" aria-hidden="true">
        {ICONS[item.variant]}
      </span>
      <span className="bl-toast-msg">{item.message}</span>
      <button
        type="button"
        className="bl-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
      >
        ×
      </button>
    </div>
  );
}

// Re-export ToastContainer as a standalone so App.tsx can use it if desired.
// (The provider renders one internally; this export is for consumers that want
//  to position the container themselves — not needed in our current setup but
//  satisfies the audit spec's explicit mention of <ToastContainer />.)
export { ToastContainer };
