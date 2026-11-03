import type { NoteMetadataChange } from '../../packages/plugin-sdk';
import type { PreviewArtifacts } from './markdown/preview';

/** A rejected save leaves the renderer dirty; recovery errors are not success. */
export interface CanvasSaveResult {
  conflictNoteIds?: string[];
  error?: 'revision-conflict' | 'recovery-required' | 'save-failed';
  layoutSaved?: boolean;
  noteChanges?: NoteMetadataChange[];
  success: boolean;
}

export interface BlockNoteSaveResult {
  blocknoteFile?: string;
  conflict?: boolean;
  preview?: PreviewArtifacts;
  revision?: number;
  success: boolean;
}
