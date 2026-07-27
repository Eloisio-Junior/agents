import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./Toast";

// Bridges window-level signals dispatched from the Eden client (outside React) into toasts.
// Currently: a coalesced warning whenever the server rate-limits a request (HTTP 429). The shared
// toast id collapses a burst of 429s into a single notification.
export function GlobalApiToasts() {
  const { showToast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const onRateLimited = () => {
      showToast(
        t(
          "common.rateLimited",
          "Too many requests. Wait a moment and try again.",
        ),
        "warning",
        "api-rate-limited",
      );
    };
    window.addEventListener("api:rate-limited", onRateLimited);
    return () => window.removeEventListener("api:rate-limited", onRateLimited);
  }, [showToast, t]);

  return null;
}
