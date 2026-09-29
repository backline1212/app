import type { NotifyToggles } from "../providers";

const OPTIONS: { key: keyof NotifyToggles; label: string; hint?: string }[] = [
  { key: "notify_status_changes", label: "Status changes" },
  { key: "notify_project_updates", label: "Project updates" },
  {
    key: "notify_team_layer",
    label: "Include team-only comments",
    hint: "Only turn this on for a private channel - team-only comments are hidden from clients everywhere else.",
  },
];

/** The three notification switches, shared by the connect form and a connection's settings. */
export function NotifySwitches({
  value,
  onChange,
  disabled = false,
}: {
  value: NotifyToggles;
  onChange: (next: NotifyToggles) => void;
  disabled?: boolean;
}) {
  return (
    <div className="bl-int-switches">
      <p className="bl-mono">New comments and replies always post. Also post:</p>
      {OPTIONS.map((option) => (
        <label key={option.key} className="bl-int-switch">
          <input
            type="checkbox"
            className="bl-switch-input"
            checked={value[option.key]}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [option.key]: event.target.checked })}
          />
          <span className="bl-switch" aria-hidden="true">
            <i />
          </span>
          <span>
            {option.label}
            {option.hint && <small>{option.hint}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}
