import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./icons";

// A filter box whose value lives in the URL (TDR-0058). Typing is local and only
// reaches `onChange` after a short pause, so a server-side search isn't re-run per
// keystroke; clearing a "search" chip elsewhere (a URL change) empties the box too.
export function SearchField({ value, onChange, label, placeholder, delay = 250 }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  delay?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const emit = useRef(onChange);
  emit.current = onChange;
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => emit.current(draft.trim()), delay);
    return () => clearTimeout(timer);
  }, [draft, value, delay]);

  return (
    <label className="bl-search bl-search-field">
      <span className="bl-search-icon" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") emit.current(draft.trim());
          if (e.key === "Escape" && draft) {
            e.preventDefault();
            setDraft("");
            emit.current("");
          }
        }}
      />
      {draft && (
        <button type="button" className="bl-search-clear" aria-label="Clear search" onClick={() => { setDraft(""); emit.current(""); }}>
          ×
        </button>
      )}
    </label>
  );
}
