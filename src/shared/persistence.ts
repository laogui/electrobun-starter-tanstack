import type { NoteMetadataChange } from '../../packages/plugin-sdk';
import type { PreviewArtifacts } from './markdown/preview';

/** A rejected save leaves the renderer dirty; recovery errors are not success. */
export interface CanvasSaveResult {
  error?: 'revision-conflict' | 'recovery-required' | 'save-failed';
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
