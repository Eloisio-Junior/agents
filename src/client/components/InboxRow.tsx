import { ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/client/lib/utils";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

// "active" = bound to an agent and the persona bot is live on Chatwoot; "missing" = bound but the bot
// was deleted out-of-band on Chatwoot (show Reconnect); "none" = no agent bound (silent inbox).
export type InboxRowStatus = "active" | "missing" | "none";

// Presentational row for a Chatwoot inbox, shared by the Channels page (trailing = agent picker) and
// the agent editor's Channels tab (trailing = bind switch). Carries the status dot, name, the Chatwoot
// inbox id badge, an "open in Chatwoot" deep link, the channel-type / bot-removed subtitle and the
// Reconnect affordance; the caller supplies the trailing control via `children`.
export function InboxRow({
  name,
  chatwootInboxId,
  channelType,
  instanceBaseUrl,
  instanceAccountId,
  status,
  reconnecting = false,
  onReconnect,
  children,
}: {
  name: string;
  chatwootInboxId: number;
  channelType: string | null;
  instanceBaseUrl: string;
  instanceAccountId: number;
  status: InboxRowStatus;
  reconnecting?: boolean;
  onReconnect?: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const inboxUrl = `${instanceBaseUrl.replace(/\/+$/, "")}/app/accounts/${instanceAccountId}/settings/inboxes/${chatwootInboxId}`;

  return (
    <li className="flex items-center justify-between gap-4 border-border border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", {
            "bg-warning": status === "missing",
            "bg-success": status === "active",
            "bg-text-muted/40": status === "none",
          })}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-text-primary">
              {name}
            </span>
            <Tooltip content={t("channels.inboxId", "Chatwoot inbox ID")}>
              <Badge variant="secondary" className="shrink-0">
                {`#${chatwootInboxId}`}
              </Badge>
            </Tooltip>
            <Tooltip content={t("channels.openInChatwoot", "Open in Chatwoot")}>
              <a
                href={inboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("channels.openInChatwoot", "Open in Chatwoot")}
                className="inline-flex shrink-0 items-center justify-center rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Tooltip>
          </div>
          {status === "missing" ? (
            <p className="mt-0.5 text-warning text-xs">
              {t("channels.botRemoved", "Bot removed on Chatwoot")}
            </p>
          ) : (
            channelType && (
              <p className="mt-0.5 text-text-muted text-xs">{channelType}</p>
            )
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status === "missing" && onReconnect && (
          <Button
            variant="secondary"
            size="sm"
            loading={reconnecting}
            onClick={onReconnect}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("channels.reconnect", "Reconnect")}
          </Button>
        )}
        {children}
      </div>
    </li>
  );
}
