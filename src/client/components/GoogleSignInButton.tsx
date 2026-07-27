import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/client/components/Skeleton";
import { useTheme } from "@/client/contexts/ThemeContext";
import {
  type GoogleCredentialResponse,
  loadGsiScript,
} from "@/client/lib/google";
import { cn } from "@/client/lib/utils";

interface GoogleSignInButtonProps {
  clientId: string;
  onCredential: (credential: string) => void;
  onError?: (error: unknown) => void;
  disabled?: boolean;
}

type Status = "loading" | "ready" | "error";

export function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  const { resolvedTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    if (disabled) {
      // NOTE: Tear down any existing button + One Tap so the SDK cannot keep
      // prompting users while another auth flow is in progress.
      window.google?.accounts?.id?.cancel();
      window.google?.accounts?.id?.disableAutoSelect();
      containerRef.current?.replaceChildren();
      setStatus("loading");
      return;
    }
    let cancelled = false;
    let observer: MutationObserver | null = null;
    setStatus("loading");

    const init = async () => {
      try {
        const id = await loadGsiScript();
        if (cancelled || !containerRef.current) return;

        // NOTE: Clear any previous render so theme/locale changes do not
        // accumulate stale Google iframes inside the container.
        containerRef.current.replaceChildren();

        id.initialize({
          client_id: clientId,
          callback: (response: GoogleCredentialResponse) => {
            onCredentialRef.current(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });

        observer = new MutationObserver(() => {
          if (containerRef.current?.childNodes.length) {
            setStatus("ready");
            observer?.disconnect();
            observer = null;
          }
        });
        observer.observe(containerRef.current, { childList: true });

        id.renderButton(containerRef.current, {
          type: "standard",
          theme: resolvedTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: containerRef.current.offsetWidth || 320,
          locale: i18n.language,
        });

        // NOTE: If renderButton inserted children synchronously, mark ready now.
        if (containerRef.current.childNodes.length) {
          setStatus("ready");
          observer?.disconnect();
          observer = null;
        }

        id.prompt();
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        onErrorRef.current?.(err);
      }
    };

    void init();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, resolvedTheme, i18n.language, disabled]);

  return (
    <div className={cn("relative min-h-11")}>
      {status === "loading" && (
        <span role="status" className="absolute inset-0">
          <span className="sr-only">{t("common.loading", "Loading…")}</span>
          <Skeleton className="absolute inset-0" />
        </span>
      )}
      <div ref={containerRef} className={cn("flex justify-center")} />
    </div>
  );
}
