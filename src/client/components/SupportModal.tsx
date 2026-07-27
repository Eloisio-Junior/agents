import { Check, Copy, Mail, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/client/lib/utils";
import { Button } from "./Button";
import { Modal, type ModalController } from "./Modal";

interface SupportModalProps {
  email: string;
  mailtoHref: string;
  modal: ModalController<void>;
}

type CopyStatus = "idle" | "copied" | "error";

const FEEDBACK_DURATION_MS = 1500;

export function SupportModal({ email, mailtoHref, modal }: SupportModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isOpen, close } = modal;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // NOTE: reset the copy-feedback indicator when the modal closes so reopening
  // it doesn't briefly flash the previous copied/error state.
  useEffect(() => {
    if (isOpen) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus("idle");
  }, [isOpen]);

  const handleCopy = async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    try {
      await navigator.clipboard.writeText(email);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    timeoutRef.current = setTimeout(() => {
      setStatus("idle");
    }, FEEDBACK_DURATION_MS);
  };

  const { Icon, label, iconCls } =
    status === "copied"
      ? {
          Icon: Check,
          label: t("support.copied", "Copied"),
          iconCls: "text-success",
        }
      : status === "error"
        ? {
            Icon: X,
            label: t("support.copyFailed", "Failed"),
            iconCls: "text-error",
          }
        : {
            Icon: Copy,
            label: t("support.copyEmail", "Copy email"),
            iconCls: "",
          };

  return (
    <Modal
      modal={modal}
      title={t("support.title", "Contact support")}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={close}>
            {t("common.close", "Close")}
          </Button>
          <Button
            size="sm"
            variant={status === "idle" ? "primary" : "secondary"}
            onClick={handleCopy}
          >
            <Icon className={cn("mr-2 h-4 w-4", iconCls)} aria-hidden="true" />
            {label}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        {t("support.description", "Send us an email at:")}
      </p>
      <a
        href={mailtoHref}
        className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-bg-tertiary px-4 py-3 text-text-primary transition-colors hover:border-accent hover:text-accent"
      >
        <Mail className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <code className="flex-1 truncate font-mono text-sm">{email}</code>
      </a>
    </Modal>
  );
}
