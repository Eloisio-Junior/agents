import {
  Check,
  ClipboardCheck,
  Database,
  FlaskConical,
  MessageSquare,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Button, Card, useToast } from "@/client/components";
import { api } from "@/client/lib/api";

// Types derived from the Eden treaty — never hand-declared (see docs/eden-treaty.md).
type ApprovalsData = Awaited<
  ReturnType<typeof api.api.v1.knowledge.approvals.get>
>["data"];
type Approval = NonNullable<ApprovalsData>["approvals"][number];

// The knowledge-suggestion approval queue, rendered as a SECTION inside the Knowledge panel (it used
// to be a top-level page). Reports the pending count up so the Components → Knowledge tab can show a
// badge. Renders nothing once the queue is empty (the badge disappears too), so a clean knowledge
// base has no clutter.
export function KnowledgeApprovals({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.api.v1.knowledge.approvals
      .get()
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err || !data) {
          setError(true);
          return;
        }
        setApprovals(data.approvals);
        onCountChange?.(data.approvals.length);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onCountChange]);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const endpoint = api.api.v1.knowledge.approvals({ id });
      const { error: err } =
        action === "approve"
          ? await endpoint.approve.post()
          : await endpoint.reject.post();
      if (err) {
        showToast(t("approvals.actionError", "Action failed."), "error");
        return;
      }
      setApprovals((prev) => {
        const next = prev.filter((a) => a.id !== id);
        onCountChange?.(next.length);
        return next;
      });
      showToast(
        action === "approve"
          ? t("approvals.approved", "Suggestion approved and added.")
          : t("approvals.rejected", "Suggestion rejected."),
        "success",
      );
    } catch {
      showToast(t("approvals.actionError", "Action failed."), "error");
    } finally {
      setBusyId(null);
    }
  }

  // Quiet section: nothing to show while loading the secondary queue, and nothing once it's empty.
  if (loading) return null;
  if (error) {
    return (
      <Card>
        <p className="py-4 text-center text-error text-sm">
          {t("approvals.error", "Could not load the approval queue.")}
        </p>
      </Card>
    );
  }
  if (approvals.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />
        <h3 className="font-medium text-text-primary">
          {t("knowledge.approvalsTitle", "Pending approvals")}
        </h3>
        <Badge variant="warning">{approvals.length}</Badge>
      </div>
      <p className="text-sm text-text-muted">
        {t(
          "approvals.subtitle",
          "Review suggestions before they enter a knowledge base. Nothing is added without approval.",
        )}
      </p>
      <div className="flex flex-col gap-3">
        {approvals.map((a) => (
          <Card key={a.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-medium text-text-primary">
                {a.proposedTitle ?? t("approvals.untitled", "Untitled")}
              </h4>
              <Badge variant={a.status === "EDITED" ? "info" : "warning"}>
                {/* biome-ignore lint/plugin/no-dynamic-i18n-key: status keys extracted via magic comments below */}
                {t(`approvals.status.${a.status}`, a.status)}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">
              {a.proposedContent}
            </p>
            {a.rationale ? (
              <p className="text-text-muted text-xs italic">
                {t("approvals.rationale", "Rationale: {{text}}", {
                  text: a.rationale,
                })}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-muted text-xs">
              {a.knowledgeBaseName ? (
                <span className="inline-flex items-center gap-1">
                  <Database className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("approvals.targetBase", "Knowledge base: {{name}}", {
                    name: a.knowledgeBaseName,
                  })}
                </span>
              ) : null}
              {a.source?.kind === "conversation" ? (
                <Link
                  to={`/conversations/${a.source.conversationId}`}
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(
                    "approvals.fromConversation",
                    "From the conversation: {{label}}",
                    { label: a.source.label },
                  )}
                </Link>
              ) : a.source?.kind === "playground" ? (
                <Link
                  to={`/agents/${a.source.agentId}/playground`}
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                  {a.source.agentName
                    ? t(
                        "approvals.fromPlayground",
                        "From the playground of {{name}}",
                        { name: a.source.agentName },
                      )
                    : t(
                        "approvals.fromPlaygroundGeneric",
                        "From an agent's playground",
                      )}
                </Link>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busyId === a.id}
                onClick={() => act(a.id, "reject")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {t("approvals.reject", "Reject")}
              </Button>
              <Button
                size="sm"
                disabled={busyId === a.id}
                onClick={() => act(a.id, "approve")}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("approvals.approve", "Approve")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

// t('approvals.status.PENDING', 'Pending')
// t('approvals.status.EDITED', 'Edited')
