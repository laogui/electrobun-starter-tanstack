/** Note metadata the canvas mirrors on its cards. No Bun or DOM imports. */
export interface NoteMetadata {
  color: string;
  revision: number;
  title: string;
}

export interface NoteMetadataChange {
  after: NoteMetadata;
  before: NoteMetadata;
  id: string;
  /** True only when the persisted BlockNote document is unchanged. */
  metadataOnly: boolean;
}

/**
 * Pushed by the main process after a BlockNote save commits, so the canvas
 * mirrors the note's title, colour and body on every card that shows it.
 */
export interface NoteChangedEvent {
  changes: readonly NoteMetadataChange[];
  /** Stable id of the workspace the save was committed in. */
  workspaceId: string;
}

/** Renderer window event the RPC bridge dispatches for each change. */
export const NOTE_CHANGED_EVENT = 'ghostboard-note-changed';
