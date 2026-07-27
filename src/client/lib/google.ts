const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
  clientId?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GsiButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  prompt: () => void;
  renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void;
  disableAutoSelect: () => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

const SCRIPT_LOAD_TIMEOUT_MS = 10_000;

let loadPromise: Promise<GoogleAccountsId> | null = null;

export function loadGsiScript(): Promise<GoogleAccountsId> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("GSI can only load in the browser"));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;

    let timeoutId: number | undefined;

    const finishWithSuccess = (id: GoogleAccountsId) => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(id);
    };

    const finishWithError = (err: Error) => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      loadPromise = null;
      reject(err);
    };

    const onLoad = () => {
      const id = window.google?.accounts?.id;
      if (id) {
        finishWithSuccess(id);
      } else {
        finishWithError(
          new Error("GSI script loaded but window.google is undefined"),
        );
      }
    };

    const onError = () => {
      finishWithError(
        new Error("Failed to load Google Identity Services script"),
      );
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    // NOTE: When reusing a pre-existing script tag, load/error events may have
    // already fired before our listeners attached. Settle synchronously if the
    // SDK is already available.
    if (existing && window.google?.accounts?.id) {
      finishWithSuccess(window.google.accounts.id);
      return;
    }

    // NOTE: Safety net so a hung/blocked load doesn't leave the promise pending forever.
    timeoutId = window.setTimeout(() => {
      const id = window.google?.accounts?.id;
      if (id) {
        finishWithSuccess(id);
      } else {
        finishWithError(
          new Error("Timed out loading Google Identity Services script"),
        );
      }
    }, SCRIPT_LOAD_TIMEOUT_MS);

    if (!existing) document.head.appendChild(script);
  });

  return loadPromise;
}
