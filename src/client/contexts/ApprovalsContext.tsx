import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation } from "react-router";
import { useAuth } from "@/client/contexts/AuthContext";
import { api } from "@/client/lib/api";
import { isAdminRole } from "@/client/lib/roles";

interface ApprovalsContextValue {
  // Pending knowledge-base suggestions awaiting review (0 when none, or not an admin).
  count: number;
  // Lets a consumer that already knows the fresh count (e.g. the approval queue after an
  // approve/reject) update the shared badge without a refetch.
  setCount: (count: number) => void;
  // Re-fetch the count on demand.
  refresh: () => void;
}

const ApprovalsContext = createContext<ApprovalsContextValue>({
  count: 0,
  setCount: () => {},
  refresh: () => {},
});

// Shared source for the "pending KB suggestions" count, mounted high enough to survive route changes
// so the sidebar badge persists across navigation (each route element wraps in its own ProtectedRoute,
// so a provider nested there would remount and flicker on every navigation). Fetches only for admins
// (the only role that can reach the Components → Knowledge queue) and refreshes on each navigation,
// since suggestions are created server-side by agent turns (no realtime event) and would otherwise go
// unnoticed until a manual reload.
export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const [count, setCount] = useState(0);
  const location = useLocation();

  const refresh = useCallback(() => {
    if (!isAdmin) {
      setCount(0);
      return;
    }
    api.api.v1.knowledge.approvals
      .get()
      .then(({ data }) => {
        if (data) setCount(data.approvals.length);
      })
      .catch(() => {});
  }, [isAdmin]);

  // Refetch on mount, when the principal's admin status changes, and on each navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is an intentional trigger — re-fetch the count whenever the user navigates (suggestions arrive server-side with no realtime event).
  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  return (
    <ApprovalsContext.Provider value={{ count, setCount, refresh }}>
      {children}
    </ApprovalsContext.Provider>
  );
}

export function usePendingApprovals() {
  return useContext(ApprovalsContext);
}
