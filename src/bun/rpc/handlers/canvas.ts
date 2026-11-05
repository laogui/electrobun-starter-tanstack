import { collectExtensionInstanceIds } from '../../../shared/extensions/refs';
import { getAppInfoData } from '../../appLifecycle';
import {
  buildManifestNodesAfterWidgetMigration,
  hasAttachmentRuntimeData,
  hydrateAssetData,
  hydrateCardNoteData,
  hydrateImageData,
  migrateChecklistCardToWidgetReference,
  persistManifestCardNote,
  serializeImageDataForManifest,
  serializeWidgetReference,
  stripAttachmentRuntimeData,
  validateManifestNoteWrites,
} from '../../canvasHydration';
import { layoutOnlyNodes } from '../../canvasLayout';
import { finishClones } from '../../cloneReceipts';
import { loadExtensionInstances } from '../../extensions/instanceStore';
import {
  buildManifestNodesAfterExtensionMigration,
  migrateLegacyCanvasNodes,
} from '../../extensions/migration';
import {
  assertManifestWritable,
  authorizeManifestRecovery,
  type CanvasManifest,
  getManifestIssues,
  loadManifestDetailed,
  ManifestCorruptError,
  saveManifest as writeManifest,
} from '../../manifest';
import { buildNoteIndex, type NoteLocation } from '../../noteStore';
import { createNote } from '../../notes';
import {
  NoteTransactionError,
  withNoteWorkspace,
} from '../../noteTransactions';
import {
  listTransactionRecovery,
  resolveTransactionRecovery,
} from '../../transactionRecovery';
import { loadWidgets, type WidgetRecord } from '../../widgets';
import { loadWorkspaceConfig } from '../../workspace';
import { withWorkspaceFileTransaction } from '../../workspaceFileJournal';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

function saveFailure(error: unknown): {
  success: false;
  error: 'revision-conflict' | 'recovery-required' | 'save-failed';
} {
  const code =
    error instanceof ManifestCorruptError
      ? 'recovery-required'
      : error instanceof NoteTransactionError
        ? error.code
        : '';
  return {
    success: false,
    error:
      code === 'revision-conflict'
        ? code
        : code === 'recovery-required' || code === 'recovery-conflict'
          ? 'recovery-required'
          : 'save-failed',
  };
}

async function mapSerial<T, R>(
  items: T[],
  visit: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const result: R[] = [];
  for (const [index, item] of items.entries()) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    result.push(await visit(item, index));
  }
  return result;
}

export function createCanvasHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'loadCanvas'
  | 'saveManifest'
  | 'confirmCanvasRecovery'
  | 'finishCanvasClones'
  | 'listTransactionRecovery'
  | 'resolveTransactionRecovery'
> {
  const { wsPath, extensionScheduler } = ctx;
  return {
    finishCanvasClones: async ({ tokens, liveReferences }) =>
      finishClones(wsPath, tokens, liveReferences),
    listTransactionRecovery: async () => listTransactionRecovery(wsPath),
    resolveTransactionRecovery: async ({ id, token, action }) =>
      resolveTransactionRecovery(wsPath, id, token, action),
    confirmCanvasRecovery: async ({ viewId, token }) =>
      withNoteWorkspace(wsPath, async () => {
        const config = await loadWorkspaceConfig(wsPath);
        const entry = config.views.find((view) => view.id === viewId);
        if (!entry) {
          return { success: false };
        }
        try {
          await authorizeManifestRecovery(wsPath, entry.file, token);
          return { success: true };
        } catch {
          return { success: false };
        }
      }),
    loadCanvas: async ({ viewId }) =>
      withNoteWorkspace(wsPath, async () => {
        const config = await loadWorkspaceConfig(wsPath);
        const viewEntry = config.views.find((v) => v.id === viewId);
        if (!viewEntry) {
          return null;
        }

        const loaded = await loadManifestDetailed(wsPath, viewEntry.file);
        if (!loaded) {
          return null;
        }
        const { manifest, recovered } = loaded;

        const noteIndex = await buildNoteIndex(wsPath);
        const migratedWidgets: Record<string, WidgetRecord> = {};

        let hydratedNodes = await mapSerial(manifest.nodes, async (node) => {
          if (hasAttachmentRuntimeData(node.type)) {
            return {
              ...node,
              data: await hydrateAssetData(wsPath, node.data),
            };
          }

          // Hydrate image nodes. New images persist a small thumbnail and
          // the canvas displays it directly; the original full-resolution
          // `imageUrl` is loaded lazily by the focused / lightbox view.
          // Legacy images (no `thumbnailFile`) still hydrate `imageUrl`
          // eagerly so older manifests keep rendering as before.
          if (node.type === 'image') {
            return {
              ...node,
              data: await hydrateImageData(wsPath, node.data),
            };
          }

          // Hydrate card nodes that have a noteId reference
          if (node.type === 'card' && node.data.noteId) {
            const hydrated = await hydrateCardNoteData(
              wsPath,
              noteIndex,
              node.data.noteId as string,
              node.data
            );
            if (hydrated) {
              const widgetReference =
                await migrateChecklistCardToWidgetReference(
                  wsPath,
                  node.data.noteId as string,
                  hydrated,
                  migratedWidgets
                );
              if (widgetReference) {
                return {
                  ...node,
                  type: 'widget',
                  data: widgetReference,
                };
              }
              return { ...node, data: hydrated };
            }
            console.warn(
              `[persistence] Note record not found for noteId=${node.data.noteId}`
            );
          }

          // Hydrate folder card-children from their individual .md files.
          // Legacy children (without a noteId) get one stamped here; the
          // next saveManifest pass will create the backing file.
          if (node.type === 'folder') {
            const rawChildren = (node.data.children ?? []) as Array<{
              data?: Record<string, unknown>;
              id: string;
              noteId?: string;
              type?: string;
            }>;
            const hydratedChildren = await mapSerial(
              rawChildren,
              async (child) => {
                if (hasAttachmentRuntimeData(child.type)) {
                  return {
                    ...child,
                    data: await hydrateAssetData(
                      wsPath,
                      (child.data ?? {}) as Record<string, unknown>
                    ),
                  };
                }
                if (child.type === 'image') {
                  return {
                    ...child,
                    data: await hydrateImageData(
                      wsPath,
                      (child.data ?? {}) as Record<string, unknown>
                    ),
                  };
                }
                if (child.type !== 'card') {
                  return child;
                }
                const childData = (child.data ?? {}) as Record<string, unknown>;
                const existingNoteId =
                  child.noteId ?? (childData.noteId as string | undefined);
                if (!existingNoteId) {
                  const newNoteId = `note_${crypto.randomUUID().slice(0, 8)}`;
                  return {
                    ...child,
                    noteId: newNoteId,
                    data: { ...childData, noteId: newNoteId },
                  };
                }
                const hydrated = await hydrateCardNoteData(
                  wsPath,
                  noteIndex,
                  existingNoteId,
                  childData
                );
                if (hydrated) {
                  const widgetReference =
                    await migrateChecklistCardToWidgetReference(
                      wsPath,
                      existingNoteId,
                      hydrated,
                      migratedWidgets
                    );
                  if (widgetReference) {
                    return {
                      ...child,
                      noteId: existingNoteId,
                      type: 'widget',
                      data: widgetReference,
                    };
                  }
                  return {
                    ...child,
                    noteId: existingNoteId,
                    data: hydrated,
                  };
                }
                console.warn(
                  `[persistence] Missing note record for folder-child noteId=${existingNoteId}`
                );
                return {
                  ...child,
                  noteId: existingNoteId,
                  data: { ...childData, noteId: existingNoteId },
                };
              }
            );
            return {
              ...node,
              data: {
                ...node.data,
                children: hydratedChildren,
              },
            };
          }
          return node;
        });

        // Collect widgetIds referenced by top-level widget nodes and
        // folder-child widget entries, then batch-load their records.
        const widgetIds = new Set<string>();
        for (const node of hydratedNodes) {
          if (node.type === 'widget' && node.data?.widgetId) {
            widgetIds.add(node.data.widgetId as string);
          }
          if (node.type === 'folder') {
            const nodeData = node.data as Record<string, unknown>;
            const children = (nodeData.children ?? []) as Array<{
              data?: Record<string, unknown>;
              type?: string;
            }>;
            for (const child of children) {
              if (
                child.type === 'widget' &&
                (child.data?.widgetId as string | undefined)
              ) {
                widgetIds.add(child.data?.widgetId as string);
              }
            }
          }
        }
        const widgets =
          widgetIds.size > 0
            ? await loadWidgets(wsPath, [...widgetIds])
            : undefined;
        const hydratedWidgets =
          Object.keys(migratedWidgets).length > 0
            ? { ...(widgets ?? {}), ...migratedWidgets }
            : widgets;

        // Persist the migration so the on-disk manifest matches the hydrated
        // widget references. Without this, search and other loadManifest
        // consumers still see legacy checklist cards, and a mid-session crash
        // re-runs the migration on every load. Only rewrite when a migration
        // actually occurred — and only patch migrated refs so hydrated
        // runtime content never pollutes the canvas JSON.
        // A canvas recovered from a backup is not rewritten here: the user has
        // not seen it yet, and the renderer decides whether to keep it.
        let diskNodes = manifest.nodes;
        if (!recovered && Object.keys(migratedWidgets).length > 0) {
          try {
            const persistedNodes = buildManifestNodesAfterWidgetMigration(
              manifest.nodes,
              hydratedNodes
            );
            await writeManifest(wsPath, viewEntry.file, {
              ...manifest,
              nodes: persistedNodes,
            });
            diskNodes = persistedNodes;
          } catch (error) {
            console.warn(
              '[persistence] Failed to persist checklist migration:',
              error
            );
          }
        }

        const appVersion = (await getAppInfoData()).version;
        const extensionMigration = await migrateLegacyCanvasNodes(
          wsPath,
          viewId,
          hydratedNodes,
          appVersion
        );
        if (extensionMigration.changed) {
          hydratedNodes = extensionMigration.nodes;
        }
        if (extensionMigration.changed && !recovered) {
          try {
            await writeManifest(wsPath, viewEntry.file, {
              ...manifest,
              nodes: buildManifestNodesAfterExtensionMigration(
                diskNodes,
                extensionMigration.nodes
              ),
            });
          } catch (error) {
            console.warn(
              '[persistence] Failed to persist extension migration:',
              error
            );
          }
        }

        // Catch up on anything that came due while the app was closed. The
        // service owns the timer from here; this only shortens the wait for
        // overdue tasks when a canvas opens.
        extensionScheduler.tick().catch((error) => {
          console.warn('[extensions] scheduler tick failed', error);
        });

        const instanceIds = collectExtensionInstanceIds(hydratedNodes);
        const extensionInstances =
          instanceIds.length > 0
            ? await loadExtensionInstances(wsPath, instanceIds)
            : undefined;

        // Viewport is intentionally omitted: camera state is session-only
        // in the renderer and is never restored from disk.
        return {
          nodes: hydratedNodes,
          edges: manifest.edges,
          loadIssues: getManifestIssues(manifest),
          widgets: hydratedWidgets,
          extensionInstances,
          ...(recovered
            ? {
                recoveredFrom: recovered.from,
                recoveryToken: recovered.token,
                backupPath: recovered.backupPath,
              }
            : {}),
        };
      }),

    saveManifest: async ({ viewId, nodes, edges }) => {
      const workspace = wsPath;
      return withNoteWorkspace(workspace, () =>
        withWorkspaceFileTransaction(workspace, async () => {
          const config = await loadWorkspaceConfig(workspace);
          const viewEntry = config.views.find((v) => v.id === viewId);
          if (!viewEntry) {
            return { success: false };
          }
          // Fail before touching any note if the target manifest is damaged
          // and was never shown to the renderer (it would be overwritten).
          await assertManifestWritable(workspace, viewEntry.file);

          // Build note index (sidecars + legacy markdown) so we can find
          // existing notes and decide sidecar vs legacy handling.
          const noteIndex = await buildNoteIndex(workspace);
          const noteChanges = await validateManifestNoteWrites(
            workspace,
            nodes,
            noteIndex
          );

          // Resolve (or allocate) a note location for a card. Brand-new notes
          // get a legacy markdown stub which migrates to a sidecar on their
          // first focused-view edit.
          const resolveCardLocation = async (
            noteId: string,
            title: unknown,
            type: unknown
          ): Promise<NoteLocation> => {
            const existing = noteIndex.get(noteId);
            if (existing) {
              return existing;
            }
            const markdownFile = await createNote(
              workspace,
              noteId,
              String(title || ''),
              String(type || 'note')
            );
            const loc: NoteLocation = {
              noteId,
              hasSidecar: false,
              markdownFile,
            };
            noteIndex.set(noteId, loc);
            return loc;
          };

          // Phase 1: Serially pre-allocate note locations for new card notes
          // (both top-level cards AND folder card-children) to avoid
          // concurrent createNote calls producing conflicting paths.
          const nodeLocMap = new Map<number, NoteLocation>();
          const folderChildLocMap = new Map<
            number,
            Map<number, NoteLocation>
          >();
          for (const [idx, node] of nodes.entries()) {
            if (node.type === 'card') {
              const noteId =
                (node.data.noteId as string) ||
                `note_${crypto.randomUUID().slice(0, 8)}`;
              // Attach noteId so phase 2 can read it back
              node.data.noteId = noteId;
              nodeLocMap.set(
                idx,
                // react-doctor-disable-next-line react-doctor/async-await-in-loop
                await resolveCardLocation(
                  noteId,
                  node.data.title,
                  node.data.type
                )
              );
              continue;
            }
            if (node.type === 'folder') {
              const children = (node.data.children ?? []) as Array<{
                data?: Record<string, unknown>;
                id: string;
                noteId?: string;
                type?: string;
              }>;
              const childMap = new Map<number, NoteLocation>();
              for (const [cidx, child] of children.entries()) {
                if (child.type !== 'card') {
                  continue;
                }
                const childData = (child.data ?? {}) as Record<string, unknown>;
                const noteId =
                  child.noteId ||
                  (childData.noteId as string) ||
                  `note_${crypto.randomUUID().slice(0, 8)}`;
                // Stamp noteId so phase 2 can read it back from both places
                child.noteId = noteId;
                childData.noteId = noteId;
                child.data = childData;
                childMap.set(
                  cidx,
                  // react-doctor-disable-next-line react-doctor/async-await-in-loop
                  await resolveCardLocation(
                    noteId,
                    childData.title,
                    childData.type
                  )
                );
              }
              if (childMap.size > 0) {
                folderChildLocMap.set(idx, childMap);
              }
            }
          }

          // Phase 2: Write serially: repeated noteIds share a file, and no
          // sibling write may outlive a rejection and release of the queue.
          const manifestNodes = await mapSerial(nodes, async (node, idx) => {
            // Image nodes: strip imageUrl / thumbnailUrl (large base64),
            // keep imageFile / thumbnailFile references.
            if (node.type === 'image') {
              return {
                id: node.id,
                type: node.type,
                position: node.position,
                ...(node.style ? { style: node.style } : {}),
                ...(node.parentId ? { parentId: node.parentId } : {}),
                ...(node.extent ? { extent: node.extent } : {}),
                data: await serializeImageDataForManifest(workspace, node.data),
              };
            }

            if (hasAttachmentRuntimeData(node.type)) {
              return {
                id: node.id,
                type: node.type,
                position: node.position,
                ...(node.style ? { style: node.style } : {}),
                ...(node.parentId ? { parentId: node.parentId } : {}),
                ...(node.extent ? { extent: node.extent } : {}),
                data: stripAttachmentRuntimeData(node.data),
              };
            }

            // Folder nodes: write each card-child's .md file and serialize
            // children as thin references (mirrors top-level card flow).
            if (node.type === 'folder') {
              const rawChildren = (node.data.children ?? []) as Array<{
                data?: Record<string, unknown>;
                id: string;
                noteId?: string;
                type?: string;
              }>;
              const childLocMap = folderChildLocMap.get(idx);
              const serializedChildren = await mapSerial(
                rawChildren,
                async (child, cidx) => {
                  if (hasAttachmentRuntimeData(child.type)) {
                    return {
                      ...child,
                      data: stripAttachmentRuntimeData(
                        (child.data ?? {}) as Record<string, unknown>
                      ),
                    };
                  }
                  if (child.type === 'image') {
                    const childData = (child.data ?? {}) as Record<
                      string,
                      unknown
                    >;
                    return {
                      ...child,
                      data: await serializeImageDataForManifest(
                        workspace,
                        childData
                      ),
                    };
                  }
                  if (child.type === 'widget') {
                    return {
                      id: child.id,
                      type: child.type,
                      data: serializeWidgetReference(child.data),
                    };
                  }
                  if (child.type !== 'card') {
                    return child;
                  }
                  const location = childLocMap?.get(cidx);
                  const noteId = child.noteId as string | undefined;
                  if (!(location && noteId)) {
                    return child;
                  }
                  const childData = (child.data ?? {}) as Record<
                    string,
                    unknown
                  >;
                  // Persist note content (sidecar-aware): sidecar-backed
                  // notes merge metadata only; legacy cards round-trip md.
                  await persistManifestCardNote(
                    workspace,
                    location,
                    noteId,
                    childData
                  );
                  return {
                    id: child.id,
                    noteId,
                    type: 'card' as const,
                    data: {
                      noteId,
                      ...(location.markdownFile
                        ? { file: location.markdownFile }
                        : {}),
                      type: childData.type,
                    },
                  };
                }
              );
              return {
                id: node.id,
                type: node.type,
                position: node.position,
                ...(node.style ? { style: node.style } : {}),
                ...(node.parentId ? { parentId: node.parentId } : {}),
                ...(node.extent ? { extent: node.extent } : {}),
                data: {
                  ...node.data,
                  children: serializedChildren,
                },
              };
            }

            // Only extract content for card nodes
            if (node.type === 'widget') {
              return {
                id: node.id,
                type: node.type,
                position: node.position,
                ...(node.style ? { style: node.style } : {}),
                ...(node.parentId ? { parentId: node.parentId } : {}),
                ...(node.extent ? { extent: node.extent } : {}),
                data: serializeWidgetReference(node.data),
              };
            }
            if (node.type !== 'card') {
              return node;
            }

            const noteId = node.data.noteId as string | undefined;
            const location = nodeLocMap.get(idx);
            if (!(location && noteId)) {
              // Phase 1 should always pre-allocate a location for every card.
              // If one is missing (logic error, or a future refactor that
              // makes Phase 1 tolerant of single-note failures), skip the
              // note write and keep the node as-is instead of crashing the
              // whole save. Mirrors the folder-child guard above.
              return node;
            }

            // Persist note content (sidecar-aware): sidecar-backed notes merge
            // metadata only; legacy cards round-trip markdown.
            await persistManifestCardNote(
              workspace,
              location,
              noteId,
              node.data
            );

            // Return manifest-only node: strip content fields, keep reference
            return {
              id: node.id,
              type: node.type,
              position: node.position,
              ...(node.style ? { style: node.style } : {}),
              ...(node.parentId ? { parentId: node.parentId } : {}),
              ...(node.extent ? { extent: node.extent } : {}),
              data: {
                noteId,
                ...(location.markdownFile
                  ? { file: location.markdownFile }
                  : {}),
                type: node.data.type, // keep for quick component selection
                ...(node.data.detached ? { detached: true } : {}),
              },
            };
          });

          // Omit viewport so legacy values are stripped on the next save.
          const manifest: CanvasManifest = {
            schema: 'ghostboard-canvas/v1',
            viewId,
            nodes: manifestNodes,
            edges,
          };
          await writeManifest(workspace, viewEntry.file, manifest);
          return { success: true, noteChanges };
        })
      ).catch(async (error) => {
        if (
          error instanceof NoteTransactionError &&
          error.code === 'revision-conflict'
        ) {
          try {
            await withNoteWorkspace(workspace, () =>
              withWorkspaceFileTransaction(workspace, async () => {
                const config = await loadWorkspaceConfig(workspace);
                const view = config.views.find((entry) => entry.id === viewId);
                if (!view) {
                  throw new Error('Canvas no longer exists');
                }
                await writeManifest(workspace, view.file, {
                  schema: 'ghostboard-canvas/v1',
                  viewId,
                  nodes: await layoutOnlyNodes(workspace, nodes),
                  edges,
                });
              })
            );
            return {
              ...saveFailure(error),
              layoutSaved: true,
              conflictNoteIds: error.noteIds,
            };
          } catch (layoutError) {
            return saveFailure(layoutError);
          }
        }
        return saveFailure(error);
      });
    },
  };
}
