import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
} from 'react';

const SelectionContext = createContext(null);

export function SelectionProvider({ selection, children }) {
  return createElement(
    SelectionContext.Provider,
    { value: selection },
    children
  );
}

export function useSelectionState() {
  const selection = useContext(SelectionContext);
  if (!selection) {
    throw new Error(
      '@ghostboard/sdk/react selection hooks require a SelectionProvider. GhostBoard supplies it automatically in React panels; wrap standalone roots in SelectionProvider.'
    );
  }
  return useSyncExternalStore(
    selection.subscribe,
    selection.getSnapshot,
    selection.getSnapshot
  );
}

export function useSelection() {
  return useSelectionState().items;
}

export function useSelectedPlacements() {
  return useSelectionState().placements;
}
