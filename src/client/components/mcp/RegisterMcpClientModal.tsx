import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  FormField,
  Input,
  Modal,
  type ModalController,
  SwitchField,
  Textarea,
  useOnModalOpen,
} from "@/client/components";
import { api } from "@/client/lib/api";

// Supported MCP scopes (must match MCP_SCOPES server-side). mcp:admin is honored only for a
// SUPER_ADMIN user at grant time, but a client MAY be allowed to request it.
const MCP_SCOPES = ["mcp:read", "mcp:write", "mcp:admin"] as const;

export interface McpClientPayload {
  // Present when editing an existing client.
  clientId?: string;
  name?: string;
  redirectUris?: string[];
  scopes?: string[];
  firstParty?: boolean;
}

// Create or edit an MCP OAuth client (PUBLIC/PKCE in the MVP). redirect URIs are one per line. The
// client_secret is never shown (public clients have none).
export function RegisterMcpClientModal({
  modal,
  onSaved,
}: {
  modal: ModalController<McpClientPayload>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [scopes, setScopes] = useState<string[]>(["mcp:read"]);
  const [firstParty, setFirstParty] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const editingId = modal.payload?.clientId;

  useOnModalOpen(modal, () => {
    setName(modal.payload?.name ?? "");
    setRedirectUris((modal.payload?.redirectUris ?? []).join("\n"));
    setScopes(modal.payload?.scopes ?? ["mcp:read"]);
    setFirstParty(modal.payload?.firstParty ?? false);
    setError("");
  });

  const toggleScope = (scope: string) =>
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );

  const parsedUris = redirectUris
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  const valid =
    name.trim() !== "" && parsedUris.length > 0 && scopes.length > 0;

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const body = {
        name: name.trim(),
        redirectUris: parsedUris,
        scopes,
        firstParty,
      };
      const { error: apiError } = editingId
        ? await api.api.v1.mcp.admin
            .clients({ clientId: editingId })
            .patch(body)
        : await api.api.v1.mcp.admin.clients.post(body);
      if (apiError) {
        setError(t("mcp.admin.clientSaveFailed", "Could not save the client"));
        return;
      }
      onSaved();
      modal.close();
    } catch {
      setError(t("mcp.admin.clientSaveFailed", "Could not save the client"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      modal={modal}
      size="md"
      title={
        editingId
          ? t("mcp.admin.editClientTitle", "Edit MCP client")
          : t("mcp.admin.newClientTitle", "Register MCP client")
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-error bg-error-soft px-4 py-2 text-error text-sm">
            {error}
          </div>
        )}
        <FormField label={t("mcp.admin.clientName", "Name")} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            placeholder={t("mcp.admin.clientNamePlaceholder", "Claude Desktop")}
          />
        </FormField>
        <FormField
          label={t("mcp.admin.redirectUris", "Redirect URIs")}
          required
          description={t(
            "mcp.admin.redirectUrisHint",
            "One per line. Exact https URLs (http allowed only for loopback); no wildcards or fragments.",
          )}
        >
          <Textarea
            value={redirectUris}
            onChange={(e) => setRedirectUris(e.target.value)}
            disabled={loading}
            rows={3}
            className="font-mono text-xs"
            placeholder={"https://app.example.com/oauth/callback"}
          />
        </FormField>
        <FormField label={t("mcp.admin.scopes", "Scopes")} required group>
          <div className="flex flex-col gap-1.5">
            {MCP_SCOPES.map((scope) => (
              <label
                key={scope}
                className="flex w-fit items-center gap-2 text-sm text-text-secondary"
              >
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  disabled={loading}
                />
                <code className="font-mono text-xs">{scope}</code>
              </label>
            ))}
          </div>
        </FormField>
        <div className="space-y-1">
          <SwitchField
            checked={firstParty}
            onCheckedChange={setFirstParty}
            disabled={loading}
            label={t(
              "mcp.admin.firstParty",
              "Trusted client (skips the consent screen)",
            )}
          />
          <p className="text-text-muted text-xs">
            {t(
              "mcp.admin.firstPartyHint",
              "Only enable for first-party apps you control. Other clients always ask the user to approve.",
            )}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={modal.close}
            disabled={loading}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={submit} loading={loading} disabled={!valid}>
            {editingId
              ? t("common.save", "Save")
              : t("mcp.admin.register", "Register")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
