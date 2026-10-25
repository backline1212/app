interface BrandMarkProps {
  compact?: boolean;
  context?: string;
}

/**
 * The product lockup is deliberately code-native: the square mark, mint signal,
 * grotesk wordmark, and mono context label are the recurring Backline signature.
 */
export function BrandMark({ compact = false, context = "Review workspace" }: BrandMarkProps) {
  return (
    <span className={`bl-brand-lockup${compact ? " is-compact" : ""}`} role="img" aria-label="Backline">
      <span className="bl-brand-glyph" aria-hidden="true">
        <span>B</span>
        <i />
      </span>
      {!compact && (
        <span className="bl-brand-copy">
          <strong>Backline</strong>
          <small>{context}</small>
        </span>
      )}
    </span>
  );
}
