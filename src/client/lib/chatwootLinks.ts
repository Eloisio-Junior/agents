// Deep links into a Chatwoot deployment's web app. Every link is
// `{baseUrl}/app/accounts/{accountId}/…`; centralized here so the templates don't drift across the
// console (Channels, InboxRow, conversation links all build the same shape).

export function chatwootAccountUrl(
  baseUrl: string,
  accountId: number | string,
): string {
  return `${baseUrl.replace(/\/+$/, "")}/app/accounts/${accountId}`;
}

// The "create inbox" page (Inbox → pick a channel). Opening this drops the operator straight on the
// new-inbox wizard instead of hunting through Chatwoot settings.
export function chatwootInboxNewUrl(
  baseUrl: string,
  accountId: number | string,
): string {
  return `${chatwootAccountUrl(baseUrl, accountId)}/settings/inboxes/new`;
}
