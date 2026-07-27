import { readToolInstructions } from "@/modules/handoff/settings";

// Per-agent kanban config, read from `agent.settings.kanban`. Today it only carries the operator's
// optional funnel guidance, appended to the kanban_move_card tool description (when/why to move a
// card between steps). The funnel itself stays anchored to the conversation's linked card (one card =
// one board); this is NOT a funnel selector. Kept as its own module so the shape can grow later.
export interface KanbanConfig {
  // Operator-authored funnel guidance. null ⇒ none. Trimmed + length-capped on read.
  instructions: string | null;
}

export const KANBAN_DEFAULTS: KanbanConfig = {
  instructions: null,
};

export function readKanbanConfig(settings: unknown): KanbanConfig {
  const s =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).kanban
      : undefined;
  if (!s || typeof s !== "object") return { ...KANBAN_DEFAULTS };
  const bag = s as Record<string, unknown>;
  return {
    instructions: readToolInstructions(bag.instructions),
  };
}
