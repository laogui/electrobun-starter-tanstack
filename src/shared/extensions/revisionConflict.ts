import type { ExtensionStateSnapshot } from './protocol';

/**
 * Raised when an `updateState` call carries an `expectedRevision` that no
 * longer matches the instance.
 *
 * The message matches the host's `updateExtensionInstance` rejection so a
 * caller sees the same failure whether the conflict is caught in the renderer
 * or on disk. `snapshot` is the state the caller should rebase onto.
 */
export class ExtensionRevisionConflictError extends Error {
  snapshot: ExtensionStateSnapshot;

  constructor(snapshot: ExtensionStateSnapshot) {
    super('revision-conflict');
    this.name = 'ExtensionRevisionConflictError';
    this.snapshot = snapshot;
  }
}

export function isExtensionRevisionConflict(
  error: unknown
): error is ExtensionRevisionConflictError {
  return error instanceof ExtensionRevisionConflictError;
}
