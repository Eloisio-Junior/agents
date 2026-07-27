import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/client/contexts/AuthContext";
import { api } from "@/client/lib/api";

// Derive the payload shape from the Eden response (never hand-declare it; see docs/eden-treaty.md).
type UpdatesData = NonNullable<
  Awaited<ReturnType<typeof api.api.updates.get>>["data"]
>;

const EMPTY: UpdatesData = {
  announcements: [],
  update: {
    available: false,
    currentVersion: "",
    latestVersion: null,
    releaseUrl: null,
  },
};

interface UpdatesContextValue extends UpdatesData {
  refresh: () => void;
}

const UpdatesContext = createContext<UpdatesContextValue>({
  ...EMPTY,
  refresh: () => {},
});

// Poll hourly (the backend caches the hub fetch, so this is cheap) plus on window focus, so a freshly
// published announcement or release shows up without a manual reload.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

// Shared source for operator announcements + the "update available" flag. Mounted high (App.tsx) so the
// top banner and the sidebar version badge stay in sync across navigation. Only fetches for a
// logged-in principal (the endpoint requires auth); resets to empty on logout.
export function UpdatesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<UpdatesData>(EMPTY);
  // The user a response must still belong to when it resolves. A fetch started before a logout or a
  // user switch would otherwise land late and repopulate the context with the previous user's data.
  const userIdRef = useRef<string | null>(user?.id ?? null);
  userIdRef.current = user?.id ?? null;

  const refresh = useCallback(() => {
    if (!user) {
      setData(EMPTY);
      return;
    }
    const requestedFor = user.id;
    api.api.updates
      .get()
      .then(({ data }) => {
        if (data && userIdRef.current === requestedFor) setData(data);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, user]);

  return (
    <UpdatesContext.Provider value={{ ...data, refresh }}>
      {children}
    </UpdatesContext.Provider>
  );
}

export function useUpdates() {
  return useContext(UpdatesContext);
}
