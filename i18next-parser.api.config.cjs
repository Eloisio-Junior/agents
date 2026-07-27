// NOTE: when I18N_STAGING_DIR is set (by scripts/i18n-extract.ts), the parser writes to a staging
// dir instead of the real locales. The script then copies a catalog back ONLY if its content
// changed, so a no-op extract never touches the real files (and never hot-reloads the dev server).
const staging = process.env.I18N_STAGING_DIR;

module.exports = {
  locales: ["en", "pt-BR"],
  output: staging
    ? `${staging}/api/$LOCALE.json`
    : "src/api/locales/$LOCALE.json",
  input: ["src/api/**/*.ts"],
  defaultNamespace: "translation",
  keySeparator: ".",
  namespaceSeparator: ":",
  contextSeparator: "_",
  createOldCatalogs: false,
  defaultValue: (_locale, _namespace, _key, value) => value || "",
  keepRemoved: false,
  lexers: {
    ts: [
      {
        lexer: "JavascriptLexer",
        functions: ["translate"],
      },
    ],
  },
  lineEnding: "lf",
  sort: true,
  verbose: true,
};
