import { createContext, useContext } from 'react';

type UpdateNodeData = (id: string, updates: Record<string, unknown>) => void;

const UpdateNodeDataContext = createContext<UpdateNodeData>(() => {
  throw new Error('useUpdateNodeData must be used within CanvasUpdateProvider');
});

export const CanvasUpdateProvider = UpdateNodeDataContext.Provider;

export function useUpdateNodeData() {
  return useContext(UpdateNodeDataContext);
}
