// Tracks every currently-open <dialog> (native `.showModal()`), topmost last.
// Exists so a fixed-position element mounted once at the app root (the toast
// stack) can find out whether a modal is currently on screen: a `<dialog>`
// opened via `.showModal()` renders in the browser's top layer, which paints
// above the ENTIRE regular document regardless of z-index - an ordinary
// `position:fixed` element is not a top-layer citizen just because it has a
// high z-index, so it silently renders behind any open dialog otherwise.
const stack: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function pushOpenDialog(dialog: HTMLDialogElement) {
  stack.push(dialog);
  notify();
}

export function popOpenDialog(dialog: HTMLDialogElement) {
  const index = stack.indexOf(dialog);
  if (index !== -1) stack.splice(index, 1);
  notify();
}

export function getTopOpenDialog(): HTMLDialogElement | null {
  return stack[stack.length - 1] ?? null;
}

export function subscribeOpenDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
