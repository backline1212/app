import type { Provider } from "../providers";

/** A provider's logo, or its initial on the brand color when there's no logo asset. */
export function ProviderMark({ provider, size = 28 }: { provider: Provider; size?: number }) {
  if (provider.logo) {
    return (
      <img src={provider.logo} alt="" width={size} height={size} className="bl-int-logo" style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="bl-connector-id" style={{ background: provider.color, width: size, height: size }} aria-hidden="true">
      {provider.name[0]}
    </span>
  );
}
