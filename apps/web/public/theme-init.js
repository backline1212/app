// Apply the stored theme to <html> before first paint, so there's no flash of the wrong
// theme while main.tsx/useTheme() (src/lib/use-theme.ts) load. Keep this resolution logic
// in sync with that hook by hand - this has to run standalone, before any module is
// available to import from. It is a file rather than an inline script so the
// Content-Security-Policy in vercel.json can stay script-src 'self'.
(function () {
  try {
    var stored = localStorage.getItem("backline_theme");
    var dark = stored === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]').setAttribute(
      "content",
      dark ? "#0e1210" : "#f4f7f5"
    );
  } catch (e) {
    /* localStorage unavailable (privacy mode etc.) - fall back to light */
  }
})();
