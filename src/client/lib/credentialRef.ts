// Wire format for credential references (mirrors VAULT_REF_PREFIX in
// src/modules/vault/service.ts): a stored ref is always the stable `vault:<id>` form. Bare entry
// names appear only as the portable form inside agent export/import JSON.
export const VAULT_REF_PREFIX = "vault:";

export function formatVaultRef(id: string): string {
  return `${VAULT_REF_PREFIX}${id}`;
}
