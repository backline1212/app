import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useFocusTrap } from "../lib/use-focus-trap";
import { popOpenDialog, pushOpenDialog } from "../lib/dialog-stack";

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    if (dialog) pushOpenDialog(dialog);
    return () => {
      dialog?.close();
      if (dialog) popOpenDialog(dialog);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  // Native <dialog>.showModal() already contains focus in most browsers, but the
  // shared trap is wired in here too (FD-AUD FE-08) so this component matches the
  // one other modals rely on (ShareProjectModal, VersionMenu) instead of silently
  // depending on browser-native behavior alone.
  useFocusTrap(ref, true);
  return <dialog ref={ref} className="bl-dialog" aria-label={title} onCancel={onClose}>
    <header className="bl-dialog-head"><h2>{title}</h2><button type="button" className="bl-icon" aria-label="Close dialog" onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}
