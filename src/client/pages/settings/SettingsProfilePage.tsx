import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  useToast,
  useUnsavedChanges,
} from "@/client/components";
import { useAuth } from "@/client/contexts/AuthContext";
import { api } from "@/client/lib/api";
import { isAdminRole } from "@/client/lib/roles";
import type { ApiErrorPayload } from "@/client/lib/types";

// t('common.email', 'Email')
// t('common.role', 'Role')
// t('common.notAvailable', 'N/A')

export function SettingsProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const fallback = t("common.notAvailable", "N/A");
  const roleLabel = (role: string | undefined) => {
    switch (role) {
      case "SUPER_ADMIN":
        return t("role.superAdmin", "Super admin");
      case "TENANT_ADMIN":
        return t("role.tenantAdmin", "Tenant admin");
      case "AGENT":
        return t("role.agent", "Agent");
      default:
        return fallback;
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Optional on the User type (login/signup omit it); only false after a /me refresh means the
  // account truly has no local password. Treat undefined as "has password" so the form stays usable;
  // the endpoint still guards Google-only accounts with a clear error.
  const googleOnly = user?.hasPassword === false;

  // Page form (no modal): arms the native beforeunload prompt while any password
  // field is filled, so a refresh/tab-close does not silently drop the entry.
  useUnsavedChanges(
    !googleOnly &&
      (!!currentPassword || !!newPassword || !!confirmPassword) &&
      !busy,
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsNoMatch", "Passwords do not match"));
      return;
    }
    setBusy(true);
    try {
      const { error: apiError } = await api.api.auth.password.patch({
        currentPassword,
        newPassword,
      });
      if (apiError) {
        setError(
          (apiError.value as ApiErrorPayload)?.error ||
            t("settings.passwordChangeError", "Could not change the password."),
        );
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(t("settings.passwordChanged", "Password changed."), "success");
    } catch {
      setError(
        t("settings.passwordChangeError", "Could not change the password."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 font-semibold text-text-primary">
          {t("settings.profile", "Profile")}
        </h2>
        <dl className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-text-muted text-xs uppercase tracking-wide">
              {t("common.email", "Email")}
            </dt>
            <dd className="text-sm text-text-primary">
              {user?.email ?? fallback}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-text-muted text-xs uppercase tracking-wide">
              {t("common.role", "Role")}
            </dt>
            <dd>
              <Badge
                variant={isAdminRole(user?.role) ? "warning" : "secondary"}
              >
                {roleLabel(user?.role)}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-text-primary">
          {t("settings.changePassword", "Change password")}
        </h2>
        {googleOnly ? (
          <p className="text-sm text-text-muted">
            {t(
              "settings.googleOnlyNote",
              "You sign in with Google, so there's no password to change here.",
            )}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-error bg-error-soft px-4 py-2 text-error text-sm">
                {error}
              </div>
            )}
            <FormField
              label={t("settings.currentPassword", "Current password")}
            >
              <Input
                type="password"
                showPasswordToggle
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={busy}
                autoComplete="current-password"
              />
            </FormField>
            <FormField label={t("settings.newPassword", "New password")}>
              <Input
                type="password"
                showPasswordToggle
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                disabled={busy}
                autoComplete="new-password"
                helperText={t(
                  "auth.passwordMinLength",
                  "Must be at least 8 characters",
                )}
              />
            </FormField>
            <FormField
              label={t("settings.confirmNewPassword", "Confirm new password")}
            >
              <Input
                type="password"
                showPasswordToggle
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={busy}
                autoComplete="new-password"
              />
            </FormField>
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={busy}
                disabled={
                  !currentPassword || !newPassword || !confirmPassword || busy
                }
              >
                {t("settings.updatePassword", "Update password")}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
