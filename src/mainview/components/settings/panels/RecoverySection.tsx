import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteRecoveryArchive,
  listRecoveryArchives,
  type RecoveryArchiveEntry,
} from '@/lib/pendingFlushBackup';
import {
  rpcGetWorkspaceInfo,
  rpcListCanvasRecoveryBackups,
  rpcListViews,
  rpcReadCanvasRecoveryGraph,
  rpcRestoreCanvasSnapshot,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../../paraglide/messages.js';
import {
  compareRecoveryGraphs,
  isRecoveryGraph,
  type RecoveryGraph,
} from '../../../../shared/canvasRecovery';

interface Entry {
  archive?: RecoveryArchiveEntry;
  graph: RecoveryGraph | null;
  id: string;
  name: string;
  raw: string;
  savedAt: number;
  viewId: string;
  workspacePath?: string;
}
const buttonClass =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-700';

export function RecoverySection() {
  const previewVersion = useRef(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [current, setCurrent] = useState<RecoveryGraph | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const reload = useCallback(async () => {
    try {
      const info = await rpcGetWorkspaceInfo();
      setWorkspace(info.path);
      const local: Entry[] = listRecoveryArchives().map((entry) => ({
        id: entry.key,
        name: entry.viewId,
        viewId: entry.viewId,
        savedAt: entry.backup?.savedAt ?? 0,
        workspacePath: entry.backup?.workspacePath,
        graph:
          entry.backup && isRecoveryGraph(entry.backup) ? entry.backup : null,
        archive: entry,
        raw: entry.raw,
      }));
      const disk = await rpcListCanvasRecoveryBackups();
      setEntries([
        ...disk.map((entry) => ({
          id: entry.file,
          name: `${entry.name} · ${entry.file}`,
          viewId: entry.viewId,
          savedAt: entry.savedAt,
          workspacePath: info.path,
          graph: isRecoveryGraph(entry.graph) ? entry.graph : null,
          raw: JSON.stringify(entry.graph, null, 2),
        })),
        ...local,
      ]);
    } catch {
      setMessage(m.recovery_failed());
    }
  }, []);
  useEffect(() => {
    reload().catch(() => undefined);
    const refresh = () => {
      reload().catch(() => undefined);
    };
    globalThis.addEventListener('workspace-recovery-updated', refresh);
    return () =>
      globalThis.removeEventListener('workspace-recovery-updated', refresh);
  }, [reload]);

  const preview = async (entry: Entry) => {
    const version = ++previewVersion.current;
    setSelected(entry);
    setCurrent(null);
    setMessage('');
    setDeleteId('');
    // Comparison uses the stored manifest; recovering never mutates this canvas.
    try {
      if (entry.workspacePath && entry.workspacePath !== workspace) {
        return;
      }
      const loaded = await rpcReadCanvasRecoveryGraph(entry.viewId);
      if (version === previewVersion.current && isRecoveryGraph(loaded)) {
        setCurrent(loaded);
      }
    } catch {
      /* Missing or damaged originals still allow recovery as a copy. */
    }
  };
  const restore = async () => {
    if (!selected?.graph) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await rpcRestoreCanvasSnapshot(
        `${m.recovery_copy_name()} · ${selected.name}`,
        selected.graph,
        selected.workspacePath
      );
      if (!result.success) {
        throw new Error('restore failed');
      }
      const views = await rpcListViews();
      if (views) {
        useCanvasStore.getState().setViews(views.views);
      }
      setMessage(m.recovery_created());
    } catch {
      setMessage(m.recovery_failed());
    } finally {
      setBusy(false);
    }
  };
  const exportEntry = () => {
    if (!selected) {
      return;
    }
    const url = URL.createObjectURL(
      new Blob([selected.raw], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'canvas-recovery.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const difference =
    current && selected?.graph
      ? compareRecoveryGraphs(current, selected.graph)
      : null;
  return (
    <section aria-labelledby="recovery-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-xs" id="recovery-heading">
          {m.recovery_title()}
        </h3>
        <button className={buttonClass} onClick={reload} type="button">
          {m.recovery_refresh()}
        </button>
      </div>
      <p className="text-neutral-500 text-xs">{m.recovery_description()}</p>
      {entries.length === 0 ? (
        <p className="text-neutral-500 text-sm">{m.recovery_empty()}</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-auto">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                className="w-full rounded-md border border-neutral-200 p-2 text-left text-xs dark:border-neutral-700"
                onClick={() => preview(entry)}
                type="button"
              >
                <span className="block break-all font-medium">
                  {entry.name}
                </span>
                <span className="text-neutral-500">
                  {entry.savedAt
                    ? new Date(entry.savedAt).toLocaleString()
                    : m.canvas_recovery_unknown_source()}{' '}
                  · {entry.workspacePath || m.canvas_recovery_unknown_source()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="break-all text-xs">{selected.name}</p>
          {selected.workspacePath && selected.workspacePath !== workspace ? (
            <p className="text-amber-600 text-xs" role="alert">
              {m.recovery_other_workspace()}
            </p>
          ) : null}
          {difference ? (
            <p className="text-xs">
              {m.recovery_difference({
                added: difference.added.length,
                removed: difference.removed.length,
                changed: difference.changed.length,
              })}
            </p>
          ) : (
            <p className="text-neutral-500 text-xs">
              {m.recovery_no_comparison()}
            </p>
          )}
          {selected.graph ? (
            <details>
              <summary className="cursor-pointer text-xs">
                {m.recovery_preview()}
              </summary>
              <ul className="max-h-64 space-y-2 overflow-auto text-xs">
                {selected.graph.nodes.map((node) => (
                  <li key={node.id}>
                    <details>
                      <summary className="cursor-pointer">
                        {String(node.data.title || node.id)} · {node.type}
                      </summary>
                      <pre className="overflow-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(node, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
              <pre className="max-h-32 overflow-auto text-xs">
                {JSON.stringify(selected.graph.edges, null, 2)}
              </pre>
            </details>
          ) : (
            <p className="text-amber-600 text-xs" role="alert">
              {m.recovery_invalid()}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={
                busy ||
                !selected.graph ||
                Boolean(
                  selected.workspacePath && selected.workspacePath !== workspace
                )
              }
              onClick={restore}
              type="button"
            >
              {m.recovery_restore_copy()}
            </button>
            <button className={buttonClass} onClick={exportEntry} type="button">
              {m.recovery_export()}
            </button>
            {selected.archive ? (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => {
                  if (deleteId !== selected.id) {
                    setDeleteId(selected.id);
                    return;
                  }
                  try {
                    if (!deleteRecoveryArchive(selected.archive!)) {
                      throw new Error('changed');
                    }
                    setSelected(null);
                    reload().catch(() => undefined);
                  } catch {
                    setMessage(m.recovery_failed());
                  }
                }}
                type="button"
              >
                {deleteId === selected.id
                  ? m.recovery_delete_confirm()
                  : m.recovery_delete()}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message ? <output className="block text-sm">{message}</output> : null}
    </section>
  );
}
