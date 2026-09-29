import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { keyLabel, loadShortcuts, SHORTCUTS_STORAGE_KEY, type Shortcut } from "./shortcuts";

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(loadShortcuts);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
    // ProjectOverviewPage's own hotkey listener only reads localStorage on mount -
    // this tells it (and any other open tab/listener) a binding just changed so
    // pressing the new key works immediately, without a reload.
    window.dispatchEvent(new CustomEvent("backline:shortcuts-changed"));
  }, [shortcuts]);

  useEffect(() => {
    // Escape-to-close when *not* editing is handled by Dialog's own native <dialog>
    // cancel behavior - only the "capture the next keypress as a binding" case (which
    // must intercept Escape too, so a reviewer can bind it) needs a listener here.
    if (!editingId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const keyName = (e.ctrlKey ? "Ctrl " : "") + (e.altKey ? "Alt " : "") + (e.shiftKey ? "Shift " : "") + (e.key === "Control" || e.key === "Shift" || e.key === "Alt" ? "" : e.key);
      if (keyName.trim()) {
        setShortcuts((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, key: keyName.trim().toUpperCase() } : s))
        );
        setEditingId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingId]);

  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px 20px" }}>
        {shortcuts.map((s) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--bl-line)" }}>
            <span style={{ fontSize: "14px", color: "var(--bl-ink)" }}>{s.label}</span>
            {s.editable ? (
              <button
                type="button"
                onClick={() => setEditingId(s.id)}
                style={{
                  padding: "4px 8px",
                  background: editingId === s.id ? "var(--bl-paper)" : "transparent",
                  border: "1px solid var(--bl-line)",
                  borderRadius: "4px",
                  fontFamily: "var(--mono)",
                  fontSize: "12px",
                  cursor: "pointer"
                }}
              >
                {editingId === s.id ? "Press any key..." : keyLabel(s.key)}
              </button>
            ) : (
              <kbd style={{
                padding: "4px 8px",
                background: "var(--bl-paper)",
                border: "1px solid var(--bl-line)",
                borderRadius: "4px",
                fontFamily: "var(--mono)",
                fontSize: "12px",
                color: "var(--bl-muted)"
              }}>
                {keyLabel(s.key)}
              </kbd>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
