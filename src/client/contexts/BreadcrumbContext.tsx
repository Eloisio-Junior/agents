import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Lets a page register a live, data-derived label for a path segment the
// static/dynamic breadcrumb tables can't resolve on their own (e.g. an agent's
// name, which lives behind an opaque id in the URL). Keyed by the exact path.
type Labels = Record<string, string>;

interface BreadcrumbContextValue {
  labels: Labels;
  setLabel: (path: string, label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  labels: {},
  setLabel: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Labels>({});

  const setLabel = useCallback((path: string, label: string | null) => {
    setLabels((prev) => {
      if (label === null) {
        if (!(path in prev)) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      }
      if (prev[path] === label) return prev;
      return { ...prev, [path]: label };
    });
  }, []);

  const value = useMemo(() => ({ labels, setLabel }), [labels, setLabel]);

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

// Register a label override for `path` while this component is mounted; cleared
// on unmount or when the inputs go null. No-op until both path and label exist.
export function useBreadcrumbLabel(path: string | null, label: string | null) {
  const { setLabel } = useContext(BreadcrumbContext);
  useEffect(() => {
    if (!path || !label) return;
    setLabel(path, label);
    return () => setLabel(path, null);
  }, [path, label, setLabel]);
}

export function useBreadcrumbLabels() {
  return useContext(BreadcrumbContext).labels;
}
