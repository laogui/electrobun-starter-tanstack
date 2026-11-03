import { useCallback, useEffect, useState } from 'react';
import {
  rpcListCanvasDataDiagnostics,
  rpcQuarantineDamagedTrash,
} from '@/lib/rpc';
import type { CanvasDataDiagnostic } from '../../../../bun/dataDiagnostics';
import * as m from '../../../../paraglide/messages.js';

const buttonClass =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-700';
export function CanvasDataDiagnostics() {
  const [entries, setEntries] = useState<CanvasDataDiagnostic[]>([]);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    try {
      setEntries(await rpcListCanvasDataDiagnostics());
    } catch {
      setMessage(m.recovery_failed());
    }
  }, []);
  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);
  const archive = async (entry: CanvasDataDiagnostic) => {
    if (!entry.trashId) {
      return;
    }
    setBusy(true);
    try {
      if (
        !(await rpcQuarantineDamagedTrash(entry.trashId, entry.token)).success
      ) {
        throw new Error('changed');
      }
      setConfirm('');
      setMessage(m.data_diagnostics_done());
      await reload();
      globalThis.dispatchEvent(new Event('trash-updated'));
    } catch {
      setMessage(m.recovery_failed());
    } finally {
      setBusy(false);
    }
  };
  const exportRaw = (entry: CanvasDataDiagnostic) => {
    const url = URL.createObjectURL(
      new Blob([entry.raw], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'damaged-canvas.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section aria-labelledby="canvas-data-diagnostics" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-xs" id="canvas-data-diagnostics">
          {m.data_diagnostics_title()}
        </h3>
        <button className={buttonClass} onClick={reload} type="button">
          {m.data_diagnostics_refresh()}
        </button>
      </div>
      <p className="text-neutral-500 text-xs">
        {m.data_diagnostics_description()}
      </p>
      {entries.length === 0 ? (
        <p className="text-neutral-500 text-xs">{m.data_diagnostics_empty()}</p>
      ) : (
        entries.map((entry) => (
          <div
            className="space-y-2 rounded-md border border-amber-300 p-3"
            key={entry.file}
          >
            <p className="break-all font-medium text-xs">
              {entry.name} · {entry.file}
            </p>
            <ul className="max-h-32 list-inside list-disc overflow-y-auto text-xs">
              {entry.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            {entry.trashId ? null : (
              <p className="text-xs">{m.data_diagnostics_active()}</p>
            )}
            {confirm === entry.trashId ? (
              <p className="text-xs">{m.data_diagnostics_warning()}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                onClick={() => exportRaw(entry)}
                type="button"
              >
                {m.recovery_export()}
              </button>
              {entry.trashId ? (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    if (confirm !== entry.trashId) {
                      setConfirm(entry.trashId!);
                    } else {
                      archive(entry);
                    }
                  }}
                  type="button"
                >
                  {confirm === entry.trashId
                    ? m.data_diagnostics_confirm()
                    : m.data_diagnostics_quarantine()}
                </button>
              ) : null}
            </div>
          </div>
        ))
      )}
      {message ? <output className="block text-xs">{message}</output> : null}
    </section>
  );
}
