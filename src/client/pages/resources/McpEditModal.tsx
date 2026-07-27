import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  CredentialPicker,
  FormField,
  Input,
  Modal,
  ModalCancelButton,
  type ModalController,
  Select,
  Skeleton,
  SwitchField,
  useOnModalOpen,
  useToast,
} from "@/client/components";
import { useAuth } from "@/client/contexts/AuthContext";
import { api } from "@/client/lib/api";
import { isValidHttpUrl } from "@/client/lib/validation";
import {
  composeStdioCommand,
  DEFAULT_MCP_STDIO_LAUNCHER,
  MCP_STDIO_LAUNCHERS,
  parseStdioCommand,
} from "@/lib/mcp-launchers";

// Derived from the vault treaty response; never hand-mirrored (see docs/eden-treaty.md).
type VaultEntry = NonNullable<
  Awaited<ReturnType<typeof api.api.v1.vault.get>>["data"]
>["entries"][number];

const TRANSPORTS = ["streamableHttp", "sse", "stdio"] as const;

function emptyForm() {
  return {
    name: "",
    transport: "streamableHttp" as (typeof TRANSPORTS)[number],
    url: "",
    // stdio command is split into launcher (allowlisted: bunx | uvx) + free-form args, composed into
    // the stored `command` on save and parsed back on load.
    launcher: DEFAULT_MCP_STDIO_LAUNCHER as string,
    args: "",
    credentialRef: "",
    enabled: true,
  };
}

// Per-launcher args placeholder (the package + its flags; the launcher itself is the Select).
function argsPlaceholder(launcher: string): string {
  return launcher === "uvx"
    ? "mcp-server-time"
    : "@modelcontextprotocol/server-everything";
}

// Reusable create/edit modal for an MCP server connection. Shared by the Components → MCP panel and
// the agent editor's Tools tab. On edit the full connection is fetched by id; `onSaved` lets the
// caller refetch + auto-select. `sharedNotice` warns the edit affects every agent using the server.
export function McpEditModal({
  modal,
  onSaved,
  sharedNotice,
}: {
  modal: ModalController<{ id?: string }>;
  onSaved?: (saved: { id: string; name: string }, isNew: boolean) => void;
  sharedNotice?: boolean;
}) {
  const { t } = useTranslation();
  const transportLabel = (tr: (typeof TRANSPORTS)[number]) => {
    switch (tr) {
      case "streamableHttp":
        return t("mcp.transportLabel.streamableHttp", "Streamable HTTP");
      case "sse":
        return t("mcp.transportLabel.sse", "SSE");
      default:
        return t("mcp.transportLabel.stdio", "stdio");
    }
  };
  const { showToast } = useToast();
  const { mcpStdioEnabled } = useAuth();
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formBaseline = useRef<string | null>(null);
  // Base URL from the selected credential (locks the URL field when set).
  const [mcpCredBaseUrl, setMcpCredBaseUrl] = useState<string | null>(null);
  // User's own URL value preserved while a credential with baseUrl is selected.
  const mcpUserUrlRef = useRef("");

  const editId = modal.payload?.id;

  useOnModalOpen(modal, () => {
    setFormError(null);
    setLoadError(false);
    setMcpCredBaseUrl(null);
    const payloadId = modal.payload?.id;
    if (!payloadId) {
      const initial = emptyForm();
      setForm(initial);
      formBaseline.current = JSON.stringify(initial);
      mcpUserUrlRef.current = "";
      return;
    }
    formBaseline.current = null;
    setLoadingForm(true);
    void (async () => {
      try {
        const { data, error } = await api.api.v1["mcp-connections"]({
          id: payloadId,
        }).get();
        if (error || !data) {
          setLoadError(true);
          return;
        }
        const c = data.connection;
        const parsed = c.command
          ? parseStdioCommand(c.command)
          : { launcher: DEFAULT_MCP_STDIO_LAUNCHER as string, args: "" };
        const initial = {
          name: c.name,
          transport: c.transport as (typeof TRANSPORTS)[number],
          url: c.url ?? "",
          launcher: parsed.launcher,
          args: parsed.args,
          credentialRef: c.credentialRef ?? "",
          enabled: c.enabled,
        };
        setForm(initial);
        formBaseline.current = JSON.stringify(initial);
        mcpUserUrlRef.current = c.url ?? "";
      } catch {
        setLoadError(true);
      } finally {
        setLoadingForm(false);
      }
    })();
  });

  const isStdio = form.transport === "stdio";

  async function save() {
    setFormError(null);
    const body = {
      name: form.name.trim(),
      transport: form.transport,
      url: isStdio ? null : form.url.trim() || null,
      command: isStdio
        ? composeStdioCommand(form.launcher, form.args.trim()) || null
        : null,
      credentialRef: form.credentialRef || null,
      enabled: form.enabled,
    };
    setSaving(true);
    try {
      const { data, error: err } = editId
        ? await api.api.v1["mcp-connections"]({ id: editId }).patch(body)
        : await api.api.v1["mcp-connections"].post(body);
      if (err || !data) {
        setFormError(
          t("mcp.saveError", "Could not save (check the URL/command)."),
        );
        return;
      }
      showToast(t("mcp.saved", "MCP server saved."), "success");
      modal.close();
      onSaved?.(
        { id: data.connection.id, name: data.connection.name },
        !editId,
      );
    } catch {
      setFormError(
        t("mcp.saveError", "Could not save (check the URL/command)."),
      );
    } finally {
      setSaving(false);
    }
  }

  // URL is optional when credential provides its own base (server resolves it). Invalid only when the
  // URL field is editable (not locked) and has a non-empty bad value.
  const mcpUrlInvalid =
    !isStdio && !mcpCredBaseUrl && !isValidHttpUrl(form.url);
  const valid =
    !loadingForm &&
    !loadError &&
    form.name.trim() &&
    !mcpUrlInvalid &&
    (isStdio
      ? mcpStdioEnabled && form.args.trim()
      : form.url.trim() || !!mcpCredBaseUrl);

  // NOTE: baseline is captured on open (create defaults / loaded server); null while the edit fetch
  // is in flight.
  const isDirty =
    formBaseline.current !== null &&
    JSON.stringify(form) !== formBaseline.current;

  return (
    <Modal
      modal={modal}
      unsavedChanges={isDirty}
      title={
        editId
          ? t("mcp.editTitle", "Edit MCP server")
          : t("mcp.addTitle", "New MCP server")
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-error text-xs">{formError}</span>
          <div className="flex gap-2">
            <ModalCancelButton disabled={saving} />
            <Button onClick={save} loading={saving} disabled={!valid}>
              {t("common.save", "Save")}
            </Button>
          </div>
        </div>
      }
    >
      {loadingForm ? (
        <div className="flex flex-col gap-3" role="status">
          <span className="sr-only">{t("common.loading", "Loading…")}</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : loadError ? (
        <p className="text-error text-sm">
          {t("mcp.loadError", "Could not load this server.")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sharedNotice && editId && (
            <div className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-text-primary text-xs">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <span>
                {t(
                  "mcp.sharedNotice",
                  "This is a shared MCP server. Changes affect every agent that uses it.",
                )}
              </span>
            </div>
          )}
          <FormField label={t("mcp.name", "Name")} required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label={t("mcp.transport", "Transport")}>
            <Select
              value={form.transport}
              onChange={(e) =>
                setForm({
                  ...form,
                  transport: e.target.value as (typeof TRANSPORTS)[number],
                })
              }
            >
              {TRANSPORTS.map((tr) => (
                <option key={tr} value={tr}>
                  {transportLabel(tr)}
                </option>
              ))}
            </Select>
          </FormField>
          {isStdio ? (
            <>
              {!mcpStdioEnabled && (
                <div className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft px-3 py-2 text-text-primary text-xs">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span>
                    {t(
                      "mcp.stdioDisabled",
                      "stdio transport is disabled on this server (MCP_STDIO_ENABLED). Enable it on a host you control to create a stdio connection.",
                    )}
                  </span>
                </div>
              )}
              <FormField
                label={t("mcp.launcher", "Launcher")}
                description={t(
                  "mcp.launcherHint",
                  "bunx runs npm-published servers (use it wherever docs say npx). uvx runs Python servers.",
                )}
              >
                <Select
                  value={form.launcher}
                  onChange={(e) =>
                    setForm({ ...form, launcher: e.target.value })
                  }
                  disabled={!mcpStdioEnabled}
                >
                  {MCP_STDIO_LAUNCHERS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label={t("mcp.args", "Arguments")}
                required
                description={t(
                  "mcp.argsHint",
                  "The package to run plus its flags (the launcher is selected above). The credential's token is injected as an environment variable, never written here.",
                )}
              >
                <Input
                  value={form.args}
                  onChange={(e) => setForm({ ...form, args: e.target.value })}
                  placeholder={argsPlaceholder(form.launcher)}
                  disabled={!mcpStdioEnabled}
                />
              </FormField>
            </>
          ) : (
            <FormField
              label={t("mcp.url", "URL")}
              required={!mcpCredBaseUrl}
              description={
                mcpCredBaseUrl
                  ? t(
                      "editor.baseURLFromCredential",
                      "Defined by the selected credential.",
                    )
                  : undefined
              }
              error={
                mcpUrlInvalid && form.url.trim()
                  ? t("common.invalidUrl", "Must be a valid http(s) URL.")
                  : null
              }
            >
              <Input
                value={mcpCredBaseUrl ?? form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                disabled={!!mcpCredBaseUrl}
                placeholder="https://mcp.example.com/sse"
              />
            </FormField>
          )}
          <FormField label={t("mcp.credential", "Credential")} group>
            <CredentialPicker
              value={form.credentialRef}
              onChange={(v) => setForm({ ...form, credentialRef: v })}
              compatibleTypes={
                isStdio
                  ? ["mcp_env", "bearer_token"]
                  : ["mcp_oauth", "bearer_token", "header", "basic_auth"]
              }
              defaultCreateType={isStdio ? "mcp_env" : "mcp_oauth"}
              defaultCreateBaseUrl={mcpCredBaseUrl ?? form.url}
              onEntryChange={(entry: VaultEntry | null) => {
                const credUrl = entry?.baseUrl ?? null;
                setMcpCredBaseUrl(credUrl);
                if (credUrl) {
                  mcpUserUrlRef.current = form.url;
                } else {
                  setForm((prev) => ({
                    ...prev,
                    url: mcpUserUrlRef.current,
                  }));
                }
              }}
              ariaLabel={t("mcp.credential", "Credential")}
            />
          </FormField>
          <SwitchField
            checked={form.enabled}
            onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            label={t("common.enabled", "Enabled")}
          />
        </div>
      )}
    </Modal>
  );
}
