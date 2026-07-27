import { createContext, useContext } from "react";

interface ResourcesContextValue {
  approvalsCount: number;
  setApprovalsCount: (count: number) => void;
}

export const ResourcesContext = createContext<ResourcesContextValue>({
  approvalsCount: 0,
  setApprovalsCount: () => {},
});

export function useResourcesContext() {
  return useContext(ResourcesContext);
}
