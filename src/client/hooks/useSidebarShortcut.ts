import { useEffect } from "react";
import { useSidebar } from "@/client/contexts/SidebarContext";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useSidebarShortcut() {
  const { toggleCollapsed } = useSidebar();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // NOTE: ignore auto-repeat so holding the chord does not flap the sidebar.
      if (event.repeat) return;
      if (event.key !== "b" && event.key !== "B") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCollapsed]);
}
