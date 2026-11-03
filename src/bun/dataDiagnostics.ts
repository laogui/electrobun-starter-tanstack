import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getManifestIssues,
  parseCanvasManifest,
  resolveWorkspaceManifestPath,
} from './manifest';
import { withNoteWorkspace } from './noteTransactions';
import { loadWorkspaceConfig, saveWorkspaceConfig } from './workspace';
export interface CanvasDataDiagnostic {
  file: string;
  issues: string[];
  name: string;
  raw: string;
  token: string;
  trashId?: string;
  viewId: string;
}
export async function listCanvasDataDiagnostics(
  workspace: string
): Promise<CanvasDataDiagnostic[]> {
  return withNoteWorkspace(workspace, async () => {
    const config = await loadWorkspaceConfig(workspace);
    const entries = [
      ...config.views.map((view) => ({
        viewId: view.id,
        name: view.name,
        file: view.file,
        trashId: undefined as string | undefined,
      })),
      ...(config.trash ?? []).map((entry) => ({
        viewId: entry.view.id,
        name: entry.view.name,
        file: entry.trashFile,
        trashId: entry.trashId,
      })),
    ];
    const diagnostics: CanvasDataDiagnostic[] = [];
    for (const entry of entries) {
      let raw = '';
      try {
        raw = await readFile(
          resolveWorkspaceManifestPath(workspace, entry.file),
          'utf8'
        );
        const issues = getManifestIssues(parseCanvasManifest(JSON.parse(raw)));
        if (!issues.length) {
          continue;
        }
        diagnostics.push({
          ...entry,
          raw,
          token: createHash('sha256').update(raw).digest('hex'),
          issues,
        });
      } catch (error) {
        diagnostics.push({
          ...entry,
          raw,
          token: createHash('sha256').update(raw).digest('hex'),
          issues: [error instanceof Error ? error.message : String(error)],
        });
      }
    }
    return diagnostics;
  });
}
/** Remove only the selected damaged Trash index entry; preserve its original bytes. */
export async function quarantineDamagedTrash(
  workspace: string,
  trashId: string,
  token: string
) {
  return withNoteWorkspace(workspace, async () => {
    const found = (await listCanvasDataDiagnostics(workspace)).find(
      (entry) => entry.trashId === trashId && entry.token === token
    );
    if (!found) {
      return { success: false };
    }
    const config = await loadWorkspaceConfig(workspace);
    const source = resolveWorkspaceManifestPath(workspace, found.file);
    const directory = join(workspace, '.ghostboard/recovery/damaged-canvases');
    await mkdir(directory, { recursive: true });
    const destination = join(directory, `${randomUUID()}.json`);
    try {
      await rename(source, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    config.trash = (config.trash ?? []).filter(
      (entry) => entry.trashId !== trashId
    );
    try {
      await saveWorkspaceConfig(workspace, config);
    } catch (error) {
      await rename(destination, source).catch(() => undefined);
      throw error;
    }
    return { success: true };
  });
}
