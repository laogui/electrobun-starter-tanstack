import {
  Check,
  FileArchive,
  Link,
  LoaderCircle,
  ShieldAlert,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  rpcCancelPluginInstall,
  rpcCommitPluginInstall,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcListPluginPackages,
  rpcPreparePluginInstallFromFile,
  rpcPreparePluginInstallFromUrl,
} from '@/lib/rpc';
import type {
  InstalledPluginSummary,
  PluginInstallPreview,
  PluginPackageSummary,
} from '../../../../shared/plugins/management';

import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

interface PluginsPanelProps {
  strings: SettingsLocaleStrings;
}

interface Feedback {
  kind: 'error' | 'success';
  message: string;
}

export function PluginsPanel({ strings }: PluginsPanelProps) {
  const [available, setAvailable] = useState(true);
  const [activationCandidate, setActivationCandidate] =
    useState<InstalledPluginSummary | null>(null);
  const [busy, setBusy] = useState<
    'cancel' | 'commit' | 'disable' | 'enable' | 'file' | 'url' | null
  >(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [plugins, setPlugins] = useState<InstalledPluginSummary[]>([]);
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const [url, setUrl] = useState('');

  const refresh = useCallback(async () => {
    const result = await rpcListPluginPackages();
    setAvailable(result.available);
    setPlugins(result.plugins);
  }, []);

  useEffect(() => {
    let mounted = true;
    refresh().catch(() => {
      if (mounted) {
        setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
      }
    });
    return () => {
      mounted = false;
    };
  }, [refresh, strings.pluginsUnknownError]);

  const acceptPreparation = (
    result: Awaited<ReturnType<typeof rpcPreparePluginInstallFromFile>>
  ) => {
    if (result.success) {
      setFeedback(null);
      setPreview(result.preview);
      return;
    }
    if (!('cancelled' in result)) {
      setFeedback({ kind: 'error', message: result.error });
    }
  };

  const inspectFile = async () => {
    setBusy('file');
    setFeedback(null);
    try {
      acceptPreparation(await rpcPreparePluginInstallFromFile());
    } catch {
      setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
    } finally {
      setBusy(null);
    }
  };

  const inspectUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedUrl = url.trim();
    if (!submittedUrl) {
      setFeedback({ kind: 'error', message: strings.pluginsUrlRequired });
      return;
    }
    setBusy('url');
    setFeedback(null);
    try {
      acceptPreparation(await rpcPreparePluginInstallFromUrl(submittedUrl));
    } catch {
      setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
    } finally {
      setBusy(null);
    }
  };

  const cancelPreview = async () => {
    if (!preview) {
      return;
    }
    const transactionId = preview.transactionId;
    setBusy('cancel');
    try {
      const result = await rpcCancelPluginInstall(transactionId);
      if (result.success) {
        setPreview(null);
      } else {
        setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
      }
    } catch {
      setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
    } finally {
      setBusy(null);
    }
  };

  const commitPreview = async () => {
    if (!preview) {
      return;
    }
    setBusy('commit');
    setFeedback(null);
    try {
      const result = await rpcCommitPluginInstall(preview.transactionId);
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setPreview(null);
      setFeedback({
        kind: 'success',
        message: strings.pluginsInstallSuccess(result.plugin.name),
      });
      await refresh();
    } catch {
      setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
    } finally {
      setBusy(null);
    }
  };

  const enablePlugin = async () => {
    if (!activationCandidate) {
      return;
    }
    setBusy('enable');
    setFeedback(null);
    try {
      const result = await rpcEnablePlugin({
        digest: activationCandidate.digest,
        pluginId: activationCandidate.pluginId,
      });
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setActivationCandidate(null);
      setFeedback({
        kind: 'success',
        message: strings.pluginsEnableSuccess(result.plugin.name),
      });
      await refresh();
    } catch {
      setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
    } finally {
      setBusy(null);
    }
  };

  const disablePlugin = async (plugin: InstalledPluginSummary) => {
    setBusy('disable');
    setFeedback(null);
    try {
      const result = await rpcDisablePlugin({
        digest: plugin.digest,
        pluginId: plugin.pluginId,
      });
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({
        kind: 'success',
        message: strings.pluginsDisableSuccess(result.plugin.name),
      });
      await refresh();
    } catch {
      setFeedback({ kind: 'error', message: strings.pluginsUnknownError });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
          {strings.pluginsTitle}
        </h2>
        <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
          {strings.pluginsDescription}
        </p>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          {strings.pluginsRuntimeNotice}
        </p>
      </header>

      {available ? (
        <>
          <section
            aria-labelledby="plugin-install-heading"
            className="space-y-3"
          >
            <h3
              className="font-medium text-[13px] text-neutral-900 dark:text-neutral-50"
              id="plugin-install-heading"
            >
              {strings.pluginsInstallTitle}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                disabled={busy !== null || preview !== null}
                onClick={inspectFile}
                type="button"
              >
                {busy === 'file' ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <FileArchive size={14} />
                )}
                {strings.pluginsChooseFile}
              </button>
            </div>
            <form className="flex max-w-xl gap-2" onSubmit={inspectUrl}>
              <label className="sr-only" htmlFor="plugin-package-url">
                {strings.pluginsUrlLabel}
              </label>
              <input
                className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[12px] shadow-sm outline-none placeholder:text-neutral-400 focus:border-accent dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                disabled={busy !== null || preview !== null}
                id="plugin-package-url"
                onChange={(event) => setUrl(event.target.value)}
                placeholder={strings.pluginsUrlPlaceholder}
                type="url"
                value={url}
              />
              <button
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                disabled={busy !== null || preview !== null}
                type="submit"
              >
                {busy === 'url' ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <Link size={14} />
                )}
                {busy === 'url'
                  ? strings.pluginsInspecting
                  : strings.pluginsInspectUrl}
              </button>
            </form>
          </section>

          {feedback ? <FeedbackMessage feedback={feedback} /> : null}

          {preview ? (
            <section
              aria-labelledby="plugin-preview-heading"
              className="space-y-3 rounded-xl border border-accent-soft bg-accent-softer p-4"
            >
              <div>
                <h3
                  className="font-medium text-[13px] text-neutral-900 dark:text-neutral-50"
                  id="plugin-preview-heading"
                >
                  {strings.pluginsPreviewTitle}
                </h3>
                <p className="mt-1 text-[12px] text-neutral-600 dark:text-neutral-300">
                  {strings.pluginsPreviewDescription}
                </p>
              </div>
              <PluginDetails plugin={preview.plugin} strings={strings} />
              <div className="space-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                <p>{strings.pluginsPreviewSource(preview.source.label)}</p>
                <p>{strings.pluginsPreviewDigest(preview.digest)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-[12px] text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy !== null}
                  onClick={commitPreview}
                  type="button"
                >
                  {busy === 'commit' ? (
                    <LoaderCircle className="animate-spin" size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  {busy === 'commit'
                    ? strings.pluginsInstalling
                    : strings.pluginsConfirmInstall}
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-[12px] text-neutral-700 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-white/10"
                  disabled={busy !== null}
                  onClick={cancelPreview}
                  type="button"
                >
                  <X size={14} />
                  {strings.pluginsCancelInstall}
                </button>
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="stored-plugin-packages-heading"
            className="space-y-3"
          >
            <h3
              className="font-medium text-[13px] text-neutral-900 dark:text-neutral-50"
              id="stored-plugin-packages-heading"
            >
              {strings.pluginsInstalledTitle}
            </h3>
            {plugins.length === 0 ? (
              <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
                {strings.pluginsEmpty}
              </p>
            ) : (
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {plugins.map((plugin) => (
                  <li className="space-y-3 px-4 py-3" key={plugin.pluginId}>
                    {plugin.plugin ? (
                      <PluginDetails plugin={plugin.plugin} strings={strings} />
                    ) : (
                      <div>
                        <p className="font-medium text-[13px]">{plugin.name}</p>
                        <p className="text-[12px] text-neutral-500">
                          {plugin.pluginId} · {plugin.version}
                        </p>
                      </div>
                    )}
                    {plugin.status === 'stored' ? (
                      <PluginEnablementControls
                        activationCandidate={activationCandidate}
                        busy={busy}
                        onCancelEnable={() => setActivationCandidate(null)}
                        onConfirmEnable={enablePlugin}
                        onDisable={() => disablePlugin(plugin)}
                        onRequestEnable={() => {
                          setFeedback(null);
                          setActivationCandidate(plugin);
                        }}
                        plugin={plugin}
                        strings={strings}
                      />
                    ) : (
                      <p
                        className="flex items-start gap-1.5 text-[12px] text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        <ShieldAlert className="mt-0.5 shrink-0" size={14} />
                        <span>
                          {plugin.status === 'legacy'
                            ? strings.pluginsLegacy
                            : (plugin.validationError ??
                              strings.pluginsInvalid)}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
          {strings.pluginsUnavailable}
        </p>
      )}
    </div>
  );
}

function PluginEnablementControls({
  activationCandidate,
  busy,
  onCancelEnable,
  onConfirmEnable,
  onDisable,
  onRequestEnable,
  plugin,
  strings,
}: {
  activationCandidate: InstalledPluginSummary | null;
  busy: 'cancel' | 'commit' | 'disable' | 'enable' | 'file' | 'url' | null;
  onCancelEnable: () => void;
  onConfirmEnable: () => void;
  onDisable: () => void;
  onRequestEnable: () => void;
  plugin: InstalledPluginSummary;
  strings: SettingsLocaleStrings;
}) {
  const enabled = plugin.enabled;
  const confirming = activationCandidate?.pluginId === plugin.pluginId;
  if (enabled) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-[11px] text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {strings.pluginsEnabled}
        </span>
        <button
          className="rounded-md px-2 py-1 font-medium text-[12px] text-neutral-700 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-white/10"
          disabled={busy !== null}
          onClick={onDisable}
          type="button"
        >
          {busy === 'disable'
            ? strings.pluginsDisabling
            : strings.pluginsDisable}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {strings.pluginsStored}
        </span>
        <button
          className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
          disabled={busy !== null}
          onClick={onRequestEnable}
          type="button"
        >
          {strings.pluginsEnable}
        </button>
      </div>
      {confirming ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">
            {strings.pluginsEnableReviewTitle(plugin.name)}
          </p>
          <p>{strings.pluginsEnableReviewDescription}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md bg-accent px-2.5 py-1 font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy !== null}
              onClick={onConfirmEnable}
              type="button"
            >
              {busy === 'enable'
                ? strings.pluginsEnabling
                : strings.pluginsConfirmEnable}
            </button>
            <button
              className="rounded-md px-2.5 py-1 font-medium transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/10"
              disabled={busy !== null}
              onClick={onCancelEnable}
              type="button"
            >
              {strings.pluginsCancelEnable}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  return (
    <p
      className={
        feedback.kind === 'error'
          ? 'text-[13px] text-red-600 dark:text-red-400'
          : 'text-[13px] text-emerald-700 dark:text-emerald-400'
      }
      role={feedback.kind === 'error' ? 'alert' : 'status'}
    >
      {feedback.message}
    </p>
  );
}

function PluginDetails({
  plugin,
  strings,
}: {
  plugin: PluginPackageSummary;
  strings: SettingsLocaleStrings;
}) {
  return (
    <div className="space-y-2 text-[12px]">
      <p className="font-medium text-[13px]">{plugin.name}</p>
      <p>
        {plugin.id} · {plugin.version} · GhostBoard {plugin.ghostboard}
      </p>
      {plugin.author ? <p>{plugin.author}</p> : null}
      {plugin.description ? <p>{plugin.description}</p> : null}
      <p className="font-medium">{strings.pluginsCapabilities}</p>
      {plugin.capabilities.length ? (
        <ul>
          {plugin.capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      ) : (
        <p>{strings.pluginsNoCapabilities}</p>
      )}
      <p>{strings.pluginsSignatureUnverified}</p>
      <p>
        {strings.pluginsUpdateSource(
          plugin.updateUrl ?? strings.pluginsNoUpdateSource
        )}
      </p>
    </div>
  );
}
