import config from "@/config";

// Server-side distribution edition flag. Mirrors the client's IS_FREE (both derive from
// BUN_PUBLIC_EDITION), so a gate shown in the UI matches what the API enforces.
export const IS_FREE = config.edition === "free";
