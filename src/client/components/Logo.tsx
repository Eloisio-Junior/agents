import { useEffect, useState } from "react";
import { useBranding } from "@/client/contexts/BrandingContext";
import { useThemedAsset } from "@/client/contexts/ThemeContext";

// The app logo. Renders the GLOBAL custom logo (theme-aware) when one is configured, otherwise the
// bundled default asset (also theme-aware via the -light suffix). Single source for every logo
// site (header, sidebar, auth pages).
//
// FOUC: while branding is not `ready` (a cold first load, before the config fetch settles) it
// renders an invisible placeholder — never the default logo — so a returning custom-branded
// install doesn't flash the default before the real logo loads. A cache hit is ready synchronously.
export function Logo({ className }: { className?: string }) {
  const { logoUrl, ready } = useBranding();
  const fallback = useThemedAsset("/assets/logo.png");
  // If the custom logo URL ever fails to load (e.g. a stale config pointing at a just-removed
  // asset), fall back to the bundled default instead of rendering an empty/broken image.
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the error state when the URL changes (a new logo was set).
  useEffect(() => setFailed(false), [logoUrl]);

  if (!ready) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ visibility: "hidden" }}
      />
    );
  }
  const src = logoUrl && !failed ? logoUrl : fallback.src;
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
