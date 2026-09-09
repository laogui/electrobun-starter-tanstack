import type { ReactElement, ReactNode } from 'react';
import type {
  NoteContentSnapshot,
  PlacementSelectionSnapshot,
  PluginSelection,
  SelectionSnapshot,
} from './index.js';

export declare function SelectionProvider(props: {
  selection: PluginSelection;
  children?: ReactNode;
}): ReactElement;

export declare function useSelection(): readonly NoteContentSnapshot[];

export declare function useSelectionState(): SelectionSnapshot;

export declare function useSelectedPlacements(): PlacementSelectionSnapshot;
