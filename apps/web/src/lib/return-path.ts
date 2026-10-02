// Where to land after signing in. RequireAuth remembers the page a signed-out visitor
// asked for - typically a /join?code=… link someone shared - and the sign-in flows
// return there instead of the workspace picker. Kept in sessionStorage because Google
// sign-in leaves the app and comes back, which router state wouldn't survive. A
// per-tab convenience only: when storage is unavailable people land on "/" as before.

const KEY = "backline_return_path";

/** Same-origin app paths only - never "//host" or a full URL. */
function isSafePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/login");
}

export function rememberReturnPath(path: string): void {
  if (!isSafePath(path) || path === "/") return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Private mode or blocked storage: fall back to the default landing page.
  }
}

/** The remembered path, once; "/" when there is none. */
export function takeReturnPath(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return path && isSafePath(path) ? path : "/";
  } catch {
    return "/";
  }
}
