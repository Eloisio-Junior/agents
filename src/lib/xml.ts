// Tiny helpers for the XML context blocks appended to tool descriptions. The dynamic, per-turn data
// a tool grounds on (kanban card snapshot, known attributes, available calendars, …) is rendered as
// an XML block at the END of the description so the model reads it as a clearly-delimited "current
// state" section, separate from the static capability text. Values come from operator/customer data
// (board/step names, labels, attribute keys, calendar names, card title/description), so they MUST be
// escaped to keep the block well-formed.

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Renders ` name="escaped"` (note the leading space) when value is a non-empty string, otherwise "".
// Lets callers build elements with optional attributes without `undefined` leaking into the markup.
export function xmlAttr(
  name: string,
  value: string | null | undefined,
): string {
  const v = value?.trim();
  return v ? ` ${name}="${xmlEscape(v)}"` : "";
}
