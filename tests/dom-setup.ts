import { GlobalRegistrator } from "@happy-dom/global-registrator";

// NOTE: this module MUST be preloaded BEFORE ./setup.ts (see `preload` in
// bunfig.toml). happy-dom has to install `document` on globalThis before any
// @testing-library module is evaluated: `@testing-library/dom` builds its
// `screen` export at import time and, with no global document, replaces it with
// a proxy that throws "For queries bound to document.body a global document has
// to be available" on every query. Since @testing-library/jest-dom 6.10.0 pulls
// @testing-library/dom in through its own entrypoint (it declares it as a peer),
// keeping register() in the same module as that import cannot work: ESM imports
// are hoisted and run before any statement, and Biome's organizeImports would
// reorder them anyway. Splitting the two into separate preloads is what makes
// the ordering explicit and enforceable.

// NOTE: Bun's native WebSocket and Response constructors are captured before
// happy-dom replaces them globally. Backend tests that run a real Bun.serve
// need the native Response (the spec one from happy-dom is not recognized by
// Bun's TCP socket layer); WebSocket tests need the Bun-only `{ headers }`
// option that the spec WebSocket rejects. Reach for them via
// `globalThis.BunWebSocket` / `globalThis.BunResponse`.
const __nativeBunGlobals = globalThis as {
  BunWebSocket?: typeof WebSocket;
  BunResponse?: typeof Response;
};
__nativeBunGlobals.BunWebSocket = WebSocket;
__nativeBunGlobals.BunResponse = Response;

GlobalRegistrator.register();
