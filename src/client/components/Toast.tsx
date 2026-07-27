import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertCircle, CheckCircle, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/client/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  internalId: string;
  id?: string;
  message: string;
  type: ToastType;
  open: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, id?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

const TOAST_DURATION = 5000;

const icons: Record<ToastType, ReactNode> = {
  success: <CheckCircle className="h-5 w-5" aria-hidden="true" />,
  error: <XCircle className="h-5 w-5" aria-hidden="true" />,
  warning: <AlertCircle className="h-5 w-5" aria-hidden="true" />,
  info: <Info className="h-5 w-5" aria-hidden="true" />,
};

const styles: Record<ToastType, string> = {
  success: "border-success",
  error: "border-error",
  warning: "border-warning",
  info: "border-accent",
};

const iconStyles: Record<ToastType, string> = {
  success: "text-success",
  error: "text-error",
  warning: "text-warning",
  info: "text-accent",
};

function generateInternalId(): string {
  // NOTE: randomUUID requires secure context (HTTPS / localhost). Fall back to Math.random for plain HTTP.
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function ToastItemView({
  toast,
  onOpenChange,
}: {
  toast: ToastItem;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const assertive = toast.type === "error" || toast.type === "warning";

  return (
    <ToastPrimitive.Root
      open={toast.open}
      onOpenChange={onOpenChange}
      type={assertive ? "foreground" : "background"}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-bg-tertiary/95 px-4 py-3 shadow-lg backdrop-blur-sm",
        "data-[state=open]:slide-in-from-right-full data-[state=open]:animate-in",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-full data-[state=closed]:animate-out",
        "data-[swipe=end]:slide-out-to-right-full data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:animate-out data-[swipe=cancel]:transition-transform",
        styles[toast.type],
      )}
    >
      <span className={iconStyles[toast.type]}>{icons[toast.type]}</span>
      <ToastPrimitive.Title className="flex-1 text-sm text-text-primary">
        {toast.message}
      </ToastPrimitive.Title>
      <ToastPrimitive.Close
        // t('common.dismiss', 'Dismiss')
        aria-label={t("common.dismiss", "Dismiss")}
        className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pendingTimeoutsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timeouts = pendingTimeoutsRef.current;
    return () => {
      for (const id of timeouts) {
        window.clearTimeout(id);
      }
      timeouts.clear();
    };
  }, []);

  const handleOpenChange = useCallback((internalId: string, open: boolean) => {
    if (open) return;
    setToasts((prev) =>
      prev.map((t) =>
        t.internalId === internalId ? { ...t, open: false } : t,
      ),
    );
    const timeoutId = window.setTimeout(() => {
      pendingTimeoutsRef.current.delete(timeoutId);
      setToasts((prev) => prev.filter((t) => t.internalId !== internalId));
    }, 200);
    pendingTimeoutsRef.current.add(timeoutId);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", id?: string) => {
      // NOTE: dedupe must be atomic against the latest state so back-to-back
      // calls in the same tick still collapse to a single toast. Using the
      // functional setState updater avoids a stale mirror via useRef.
      setToasts((prev) => {
        if (id) {
          const existing = prev.find((t) => t.id === id && t.open);
          if (existing) {
            // NOTE: regenerate internalId so the ToastPrimitive.Root remounts
            // (internalId is the React key) and Radix's auto-dismiss timer
            // resets. Without this, a keyed replacement near the 5s expiry
            // would disappear almost immediately.
            return prev.map((t) =>
              t.internalId === existing.internalId
                ? {
                    ...t,
                    internalId: generateInternalId(),
                    message,
                    type,
                    open: true,
                  }
                : t,
            );
          }
        }

        return [
          ...prev,
          {
            internalId: generateInternalId(),
            id,
            message,
            type,
            open: true,
          },
        ];
      });
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      <ToastPrimitive.Provider duration={TOAST_DURATION} swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastItemView
            key={toast.internalId}
            toast={toast}
            onOpenChange={(open) => handleOpenChange(toast.internalId, open)}
          />
        ))}
        <ToastPrimitive.Viewport className="fixed top-(--header-height) right-0 z-(--z-toast) flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
