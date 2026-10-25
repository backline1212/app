/** @type {import('tailwindcss').Config} */

// audit-batch-13 P1: the old {DEFAULT, dark} shape below only ever produced two
// *static* utilities per color (e.g. bg-accent-primary / bg-accent-primary-dark) -
// Tailwind's darkMode:"class" strategy never wired the first to react to `.dark`
// on its own, so every call site would have needed an explicit
// `dark:bg-accent-primary-dark` pairing. A repo-wide grep found zero such
// pairings, so every consumer (packages/ui's Button/Badge/Avatar, the Board
// feature components, ...) was silently frozen in light-mode colors.
// withOpacity() instead reads a `--tw-*` CSS variable (defined as an RGB triple
// in apps/web/src/styles/backline.css's `:root`/`:root.dark`, alongside every
// other themed token) so the single `bg-accent-primary` utility flips with the
// same `.dark` class the rest of the app already uses - no call-site changes
// needed - while still supporting Tailwind's opacity modifiers (bg-accent-primary/10).
function withOpacity(variable) {
  return ({ opacityValue }) =>
    opacityValue !== undefined ? `rgb(var(${variable}) / ${opacityValue})` : `rgb(var(${variable}))`;
}

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Values (light and the --tw-* dark counterpart in backline.css) match
        // apps/web/src/styles/backline.css's `.dark` block exactly - that file is
        // the dominant styling system, so its dark palette is the canonical one;
        // keep both in sync rather than letting them drift to visually-similar-but-different greys.
        "bg-surface": withOpacity("--tw-bg-surface"),
        "bg-canvas": withOpacity("--tw-bg-canvas"),
        "text-primary": withOpacity("--tw-text-primary"),
        "text-muted": withOpacity("--tw-text-muted"),
        "accent-primary": withOpacity("--tw-accent-primary"),
        "accent-fill": withOpacity("--tw-accent-fill"),
        "on-accent": withOpacity("--tw-on-accent"),
        // 2026-09 polish pass: these used to be static hex with no dark-mode value at
        // all (every StatusBadge/LayerBadge/RecoveryBadge stayed light-mode-only colors
        // once dark mode shipped) - now bridged through --tw-* RGB vars exactly like
        // bg-surface/accent-primary/etc. above, so they flip with :root.dark. Light-mode
        // values are unchanged (still the WCAG-AA-checked hex noted below); dark-mode
        // counterparts live in backline.css's :root.dark block and were each re-checked
        // for AA against dark --bl-surface at the 15%-opacity tint Badge.tsx renders on.
        "status-in-review": withOpacity("--tw-status-in-review"), // #396586
        "status-blocked": withOpacity("--tw-status-blocked"), // #A33D1F
        // #0EA5E9/#7C3AED (sky-500/violet-600) only reached 2.39:1 / ~4.5:1 as
        // `text-layer-*` against their own `bg-layer-*/15` badge background - short of
        // (or too close to trust against) WCAG AA's 4.5:1 (Milestone 12 axe-core audit,
        // apps/e2e/tests/journeys/journey-3). sky-800/violet-700 clear ~6:1 / ~5.5:1.
        "layer-client": withOpacity("--tw-layer-client"), // #075985
        "layer-team": withOpacity("--tw-layer-team"), // #6D28D9
        "status-todo": withOpacity("--tw-status-todo"), // #94A3B8
        "status-in-progress": withOpacity("--tw-status-in-progress"), // #F59E0B
        "status-resolved": withOpacity("--tw-status-resolved"), // #22C55E
        "status-wont-fix": withOpacity("--tw-status-wont-fix"), // #64748B
        // Badge text (Badge.tsx): darker than the tint colours above in light mode.
        "status-todo-ink": withOpacity("--tw-status-todo-ink"),
        "status-in-progress-ink": withOpacity("--tw-status-in-progress-ink"),
        "status-in-review-ink": withOpacity("--tw-status-in-review-ink"),
        "status-blocked-ink": withOpacity("--tw-status-blocked-ink"),
        "status-resolved-ink": withOpacity("--tw-status-resolved-ink"),
        "status-wont-fix-ink": withOpacity("--tw-status-wont-fix-ink"),
        "recovery-low-confidence": withOpacity("--tw-recovery-low-confidence"), // #F59E0B
        // #EF4444 (red-500) only hit 3.51:1 against bg-canvas - short of WCAG AA's 4.5:1
        // for normal text (Milestone 11 axe-core audit, docs/tdr/0010). #B91C1C (red-700)
        // clears 6:1.
        "recovery-orphaned": withOpacity("--tw-recovery-orphaned"), // #B91C1C
      },
    },
  },
  plugins: [],
};
