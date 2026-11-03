import { useCallback, useEffect, useState } from 'react';
import {
  rpcListTransactionRecovery,
  rpcResolveTransactionRecovery,
} from '@/lib/rpc';
import * as m from '../../../../paraglide/messages.js';
import type { TransactionRecoveryEntry } from '../../../../shared/transactionRecovery';

const buttonClass =
  'rounded-md border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-700';
export function TransactionRecoverySection() {
  const [entries, setEntries] = useState<TransactionRecoveryEntry[]>([]);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    try {
      setEntries(await rpcListTransactionRecovery());
    } catch {
      setMessage(m.recovery_failed());
    }
  }, []);
  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);
  const resolve = async (
    entry: TransactionRecoveryEntry,
    action: 'retry' | 'quarantine'
  ) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await rpcResolveTransactionRecovery(
        entry.id,
        entry.token,
        action
      );
      if (!result.success) {
        throw new Error('source changed');
      }
      setMessage(
        result.archivedFile
          ? m.transaction_recovery_archived({ file: result.archivedFile })
          : m.transaction_recovery_done()
      );
      setConfirm('');
      await reload();
      globalThis.dispatchEvent(new Event('workspace-recovery-updated'));
    } catch {
      setMessage(m.recovery_failed());
    } finally {
      setBusy(false);
    }
  };
  const exportEntry = (entry: TransactionRecoveryEntry) => {
    const url = URL.createObjectURL(
      new Blob([entry.raw], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.id}-transaction-recovery.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (entries.length === 0 && !message) {
    return null;
  }
  return (
    <section
      aria-labelledby="transaction-recovery-heading"
      className="space-y-3 rounded-lg border border-amber-400 p-3"
    >
      <h3 className="font-semibold text-sm" id="transaction-recovery-heading">
        {entries.length
          ? m.transaction_recovery_title()
          : m.transaction_recovery_done()}
      </h3>
      {entries.length ? (
        <p className="text-xs">{m.transaction_recovery_description()}</p>
      ) : null}
      {entries.map((entry) => (
        <div className="space-y-2" key={entry.id}>
          <p className="break-all text-xs">{entry.file}</p>
          {entry.error ? (
            <p className="text-amber-700 text-xs" role="alert">
              {entry.error}
            </p>
          ) : null}
          {entry.conflicts.length > 0 ? (
            <ul className="list-inside list-disc text-xs">
              {entry.conflicts.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          ) : null}
          {confirm === entry.id ? (
            <p className="text-xs">
              {m.transaction_recovery_quarantine_warning()}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => resolve(entry, 'retry')}
              type="button"
            >
              {m.transaction_recovery_retry()}
            </button>
            <button
              className={buttonClass}
              onClick={() => exportEntry(entry)}
              type="button"
            >
              {m.recovery_export()}
            </button>
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => {
                if (confirm !== entry.id) {
                  setConfirm(entry.id);
                } else {
                  resolve(entry, 'quarantine');
                }
              }}
              type="button"
            >
              {confirm === entry.id
                ? m.transaction_recovery_quarantine_confirm()
                : m.transaction_recovery_quarantine()}
            </button>
          </div>
        </div>
      ))}
      {message ? (
        <output className="block break-all text-xs">{message}</output>
      ) : null}
    </section>
  );
}
