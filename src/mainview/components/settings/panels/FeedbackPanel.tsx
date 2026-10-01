import { FileText, LoaderCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SettingsClient } from '@/settingsClient';
import type {
  DiagnosticsStatus,
  FeedbackInput,
  SubmitReportResult,
} from '../../../../shared/support/reports';
import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

interface FeedbackPanelProps {
  client: SettingsClient;
  strings: SettingsLocaleStrings;
}

const FIELD_CLASS =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
const BUTTON_CLASS =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-200 px-3 text-[13px] font-medium transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-accent/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800';

export function FeedbackPanel({ client, strings }: FeedbackPanelProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsStatus | null>(
    null
  );
  const [category, setCategory] = useState<FeedbackInput['category']>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [includeLogs, setIncludeLogs] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState(false);
  const [result, setResult] = useState<SubmitReportResult | null>(null);
  const reportId = useRef(crypto.randomUUID());
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    if (!client.getDiagnosticsStatus) {
      setDiagnosticError(true);
      return;
    }
    client
      .getDiagnosticsStatus()
      .then((status) => {
        if (active) {
          setDiagnostics(status);
        }
      })
      .catch(() => {
        if (active) {
          setDiagnosticError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [client]);

  const edit = () => {
    reportId.current = crypto.randomUUID();
    setResult(null);
  };

  const preview = async () => {
    if (!client.getDiagnosticsPreview) {
      return;
    }
    setPreviewBusy(true);
    try {
      const next = await client.getDiagnosticsPreview();
      setLogs(next.logs);
      setDiagnosticError(false);
    } catch {
      setDiagnosticError(true);
    } finally {
      setPreviewBusy(false);
    }
  };

  const toggleAutoUpload = async (enabled: boolean) => {
    if (!client.setCrashAutoUpload) {
      return;
    }
    setSavingPreference(true);
    try {
      setDiagnostics(await client.setCrashAutoUpload(enabled));
      setDiagnosticError(false);
    } catch {
      setDiagnosticError(true);
    } finally {
      setSavingPreference(false);
    }
  };

  const submit = async () => {
    if (submitting.current || !client.submitFeedback) {
      return;
    }
    submitting.current = true;
    setBusy(true);
    setResult(null);
    try {
      const next = await client.submitFeedback({
        reportId: reportId.current,
        category,
        message: message.trim(),
        email: email.trim(),
        includeLogs,
      });
      setResult(next);
      if (next.success) {
        setMessage('');
        reportId.current = crypto.randomUUID();
      }
    } catch {
      setResult({ success: false, error: 'network' });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-[15px]">{strings.feedbackTitle}</h2>
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {strings.feedbackDescription}
        </p>
      </div>

      {diagnostics && !diagnostics.configured ? (
        <output className="block rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
          {strings.feedbackNotConfigured}
        </output>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="space-y-1.5">
          <label
            className="font-medium text-[13px]"
            htmlFor="feedback-category"
          >
            {strings.feedbackCategory}
          </label>
          <select
            className={FIELD_CLASS}
            disabled={busy}
            id="feedback-category"
            onChange={(event) => {
              setCategory(event.target.value as FeedbackInput['category']);
              edit();
            }}
            value={category}
          >
            <option value="bug">{strings.feedbackBug}</option>
            <option value="idea">{strings.feedbackIdea}</option>
            <option value="other">{strings.feedbackOther}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="font-medium text-[13px]" htmlFor="feedback-message">
            {strings.feedbackMessage}
          </label>
          <textarea
            className={`${FIELD_CLASS} min-h-32 resize-y`}
            disabled={busy}
            id="feedback-message"
            maxLength={8000}
            onChange={(event) => {
              setMessage(event.target.value);
              edit();
            }}
            placeholder={strings.feedbackPlaceholder}
            required
            rows={5}
            value={message}
          />
          <p className="text-right text-[11px] text-neutral-400">
            {message.length} / 8000
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="font-medium text-[13px]" htmlFor="feedback-email">
            {strings.feedbackEmail}
          </label>
          <input
            autoComplete="email"
            className={FIELD_CLASS}
            disabled={busy}
            id="feedback-email"
            maxLength={254}
            onChange={(event) => {
              setEmail(event.target.value);
              edit();
            }}
            placeholder={strings.feedbackEmailPlaceholder}
            type="email"
            value={email}
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              checked={includeLogs}
              disabled={busy}
              onChange={(event) => {
                setIncludeLogs(event.target.checked);
                edit();
              }}
              type="checkbox"
            />
            {strings.feedbackIncludeLogs}
          </label>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {strings.feedbackLogsDescription}
          </p>
          <button
            className={BUTTON_CLASS}
            disabled={previewBusy || !client.getDiagnosticsPreview}
            onClick={() => preview()}
            type="button"
          >
            <FileText size={14} />
            {previewBusy
              ? strings.feedbackLoadingLogs
              : strings.feedbackPreviewLogs}
          </button>
          {logs !== null ? (
            <pre
              className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-neutral-200 bg-neutral-100 p-3 text-[11px] dark:border-neutral-800 dark:bg-neutral-900"
              title={strings.feedbackPreviewLogs}
            >
              {logs || strings.feedbackNoLogs}
            </pre>
          ) : null}
        </div>
        <button
          className={`${BUTTON_CLASS} border-transparent bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200`}
          disabled={
            busy ||
            !message.trim() ||
            !diagnostics?.configured ||
            !client.submitFeedback
          }
          type="submit"
        >
          {busy ? (
            <LoaderCircle className="animate-spin" size={14} />
          ) : (
            <Send size={14} />
          )}
          {busy ? strings.feedbackSending : strings.feedbackSend}
        </button>
        {result ? (
          <output
            aria-live="polite"
            className={`text-[12px] ${result.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
          >
            {result.success
              ? strings.feedbackSuccess(result.id)
              : strings.feedbackError(result.error)}
          </output>
        ) : null}
      </form>

      <section className="space-y-3 border-neutral-200 border-t pt-5 dark:border-neutral-800">
        <label className="flex items-center justify-between gap-4 text-[13px]">
          <span className="font-medium">{strings.feedbackAutoUpload}</span>
          <input
            checked={diagnostics?.autoUpload ?? false}
            disabled={
              !diagnostics || savingPreference || !client.setCrashAutoUpload
            }
            onChange={(event) => toggleAutoUpload(event.target.checked)}
            type="checkbox"
          />
        </label>
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {strings.feedbackAutoUploadDescription}
        </p>
        {diagnostics?.pendingReports ? (
          <p className="text-[12px] text-neutral-500">
            {strings.feedbackPending(diagnostics.pendingReports)}
          </p>
        ) : null}
        {diagnosticError ? (
          <p className="text-[12px] text-red-600" role="alert">
            {strings.feedbackDiagnosticsError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
