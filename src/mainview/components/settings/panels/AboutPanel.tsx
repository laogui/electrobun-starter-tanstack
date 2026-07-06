import { CheckCircle2, ExternalLink, Info, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type {
  AppInfo,
  SettingsClient,
  UpdateCheckResult,
} from '@/settingsClient';

import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

const RELEASE_NOTES_URL =
  'https://github.com/laogui/electrobun-starter-tanstack/releases';

interface AboutPanelProps {
  client: SettingsClient;
  strings: SettingsLocaleStrings;
}

type CheckStatus =
  | { kind: 'available'; info: UpdateCheckResult }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'idle' }
  | { kind: 'none' };

export function AboutPanel({ client, strings }: AboutPanelProps) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<CheckStatus>({ kind: 'idle' });

  useEffect(() => {
    let mounted = true;
    client.getAppInfo().then((next) => {
      if (mounted) {
        setInfo(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  const handleCheck = useCallback(async () => {
    setStatus({ kind: 'checking' });
    try {
      const result = await client.checkForUpdate();
      if (result.error) {
        setStatus({ kind: 'error', message: strings.aboutUpdateError });
        return;
      }
      setStatus(
        result.updateAvailable
          ? { kind: 'available', info: result }
          : { kind: 'none' }
      );
    } catch {
      setStatus({ kind: 'error', message: strings.aboutUpdateError });
    }
  }, [client, strings.aboutUpdateError]);

  const isDevChannel = info?.channel === 'dev';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
          {strings.aboutTitle}
        </h2>
      </div>

      <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-accent-foreground text-base shadow-sm">
              {info?.name?.slice(0, 1) ?? 'G'}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
                {info?.name ?? 'GhostBoard'}
              </p>
              <p className="font-mono text-2xs text-neutral-500 dark:text-neutral-400">
                {info?.identifier ?? '—'}
              </p>
            </div>
          </div>
        </div>

        <dl className="space-y-2 border-neutral-200 border-t pt-4 dark:border-neutral-800">
          <InfoRow
            label={strings.aboutVersion}
            value={info?.version || '0.0.0'}
          />
          <InfoRow
            label={strings.aboutChannel}
            value={info?.channel || 'dev'}
          />
          <InfoRow
            isMono
            label={strings.aboutCommitHash}
            value={info?.hash ? info.hash.slice(0, 12) : '—'}
          />
        </dl>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md bg-neutral-900 px-3 font-medium text-[13px] text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            disabled={status.kind === 'checking' || isDevChannel}
            onClick={handleCheck}
            type="button"
          >
            <RefreshCw
              className={status.kind === 'checking' ? 'animate-spin' : ''}
              size={13}
            />
            {status.kind === 'checking'
              ? strings.aboutCheckUpdateChecking
              : strings.aboutCheckUpdate}
          </button>
          <a
            className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 font-medium text-[13px] text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            href={RELEASE_NOTES_URL}
            rel="noreferrer noopener"
            target="_blank"
          >
            <ExternalLink size={13} />
            {strings.aboutChangelog}
          </a>
        </div>

        <UpdateStatusBanner
          devChannelMessage={strings.aboutDevChannelNote}
          isDevChannel={isDevChannel}
          noUpdateMessage={strings.aboutUpdateNoUpdate}
          status={status}
          updateAvailableMessage={strings.aboutUpdateAvailable}
        />
      </section>
    </div>
  );
}

function InfoRow({
  isMono,
  label,
  value,
}: {
  isMono?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[12px] text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right text-[13px] text-neutral-800 dark:text-neutral-100 ${isMono ? 'font-mono text-2xs' : ''}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function UpdateStatusBanner({
  devChannelMessage,
  isDevChannel,
  noUpdateMessage,
  status,
  updateAvailableMessage,
}: {
  devChannelMessage: string;
  isDevChannel: boolean;
  noUpdateMessage: string;
  status: CheckStatus;
  updateAvailableMessage: (version: string) => string;
}) {
  if (isDevChannel) {
    return (
      <Banner kind="info">
        <Info className="shrink-0" size={14} />
        <span>{devChannelMessage}</span>
      </Banner>
    );
  }
  if (status.kind === 'available') {
    return (
      <Banner kind="success">
        <CheckCircle2 className="shrink-0" size={14} />
        <span>{updateAvailableMessage(status.info.version || '?')}</span>
      </Banner>
    );
  }
  if (status.kind === 'none') {
    return (
      <Banner kind="info">
        <CheckCircle2 className="shrink-0" size={14} />
        <span>{noUpdateMessage}</span>
      </Banner>
    );
  }
  if (status.kind === 'error') {
    return (
      <Banner kind="error">
        <Info className="shrink-0" size={14} />
        <span>{status.message}</span>
      </Banner>
    );
  }
  return null;
}

function Banner({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: 'error' | 'info' | 'success';
}) {
  const className =
    kind === 'success'
      ? 'flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
      : kind === 'error'
        ? 'flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
        : 'flex items-center gap-2 rounded-md border border-accent-soft bg-accent-softer px-3 py-2 text-[12px] text-accent-strong';
  return <output className={className}>{children}</output>;
}
