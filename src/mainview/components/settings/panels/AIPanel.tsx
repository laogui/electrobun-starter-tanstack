import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  AI_PROVIDER_OPTIONS,
  type AIProviderSetting,
  type AppSettings,
  type SettingsClient,
} from '@/settingsClient';

import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

interface AIPanelProps {
  client: SettingsClient;
  onUpdate: (patch: Partial<AppSettings>) => void;
  settings: AppSettings;
  strings: SettingsLocaleStrings;
}

export function AIPanel({ client, onUpdate, settings, strings }: AIPanelProps) {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [feedback, setFeedback] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    client
      .getAICredentialStatus()
      .then((status) => {
        if (mounted) {
          setHasApiKey(status.hasApiKey);
        }
      })
      .catch(() => {
        if (mounted) {
          setHasApiKey(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [client]);

  const providerLabels: Record<AIProviderSetting, string> = {
    openai: strings.aiProviderOpenai,
    anthropic: strings.aiProviderAnthropic,
    ollama: strings.aiProviderOllama,
    custom: strings.aiProviderCustom,
  };
  const enableLabels = { on: strings.aiEnabledOn, off: strings.aiEnabledOff };
  const showBaseUrl =
    settings.aiProvider === 'ollama' || settings.aiProvider === 'custom';

  async function commitApiKey(apiKey: string | null) {
    try {
      const result = await client.setAIApiKey(apiKey);
      if (!result.success) {
        setFeedback({ kind: 'error', text: strings.aiApiKeySaveFailed });
        return;
      }
      setHasApiKey(apiKey != null && apiKey.length > 0);
      setApiKeyDraft('');
      setFeedback({
        kind: 'success',
        text: apiKey ? strings.aiApiKeySaved : strings.aiApiKeyCleared,
      });
    } catch {
      setFeedback({ kind: 'error', text: strings.aiApiKeySaveFailed });
    }
  }

  return (
    <div className="space-y-5">
      <PanelHeading>{strings.aiTitle}</PanelHeading>
      <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
        {strings.aiDescription}
      </p>

      <div className="space-y-4">
        <PanelSelect
          id="settings-ai-enabled"
          label={strings.aiEnabledLabel}
          onValueChange={(value) => {
            onUpdate({ aiEnabled: value === 'on' });
          }}
          options={[
            { label: enableLabels.on, value: 'on' },
            { label: enableLabels.off, value: 'off' },
          ]}
          value={settings.aiEnabled ? 'on' : 'off'}
        />
        <PanelSelect
          id="settings-ai-provider"
          label={strings.aiProviderLabel}
          onValueChange={(value) => {
            onUpdate({ aiProvider: value as AIProviderSetting });
          }}
          options={AI_PROVIDER_OPTIONS.map((value) => ({
            label: providerLabels[value],
            value,
          }))}
          value={settings.aiProvider}
        />
        <PanelTextInput
          id="settings-ai-model"
          label={strings.aiModelLabel}
          onValueChange={(aiModel) => {
            onUpdate({ aiModel });
          }}
          placeholder={strings.aiModelPlaceholder}
          value={settings.aiModel}
        />
        {showBaseUrl ? (
          <PanelTextInput
            description={strings.aiBaseUrlHint}
            id="settings-ai-base-url"
            label={strings.aiBaseUrlLabel}
            onValueChange={(aiBaseUrl) => {
              onUpdate({ aiBaseUrl });
            }}
            placeholder={strings.aiBaseUrlPlaceholder}
            value={settings.aiBaseUrl}
          />
        ) : null}

        <ApiKeySection
          apiKeyDraft={apiKeyDraft}
          hasApiKey={hasApiKey}
          onClear={() => commitApiKey(null)}
          onDraftChange={setApiKeyDraft}
          onSave={() => commitApiKey(apiKeyDraft)}
          strings={strings}
        />

        {feedback ? (
          <p
            className={
              feedback.kind === 'error'
                ? 'text-red-600 text-sm dark:text-red-400'
                : 'text-emerald-600 text-sm dark:text-emerald-400'
            }
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.text}
          </p>
        ) : null}

        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {strings.aiReloadHint}
        </p>
      </div>
    </div>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
      {children}
    </h2>
  );
}

interface PanelSelectOption {
  label: string;
  value: string;
}

interface PanelSelectProps {
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly PanelSelectOption[];
  value: string;
}

function PanelSelect({
  id,
  label,
  onValueChange,
  options,
  value,
}: PanelSelectProps) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      items={options}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onValueChange(next);
        }
      }}
      value={value}
    >
      <div className="flex flex-col gap-2">
        <SelectLabel>
          <span
            className="font-medium text-[13px] text-neutral-800 dark:text-neutral-100"
            id={id}
          >
            {label}
          </span>
        </SelectLabel>
        <SelectTrigger
          aria-labelledby={id}
          className="inline-flex h-8 w-full max-w-[240px] items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-accent/60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          <SelectValue>{selected?.label ?? value}</SelectValue>
        </SelectTrigger>
      </div>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            label={option.label}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface PanelTextInputProps {
  description?: string;
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

function PanelTextInput({
  description,
  id,
  label,
  onValueChange,
  placeholder,
  value,
}: PanelTextInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="font-medium text-[13px] text-neutral-800 dark:text-neutral-100"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        className="h-8 w-full max-w-[320px] rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent/60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        id={id}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {description ? (
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}

interface ApiKeySectionProps {
  apiKeyDraft: string;
  hasApiKey: boolean;
  onClear: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  strings: SettingsLocaleStrings;
}

function ApiKeySection({
  apiKeyDraft,
  hasApiKey,
  onClear,
  onDraftChange,
  onSave,
  strings,
}: ApiKeySectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="font-medium text-[13px] text-neutral-800 dark:text-neutral-100"
        htmlFor="settings-ai-api-key"
      >
        {strings.aiApiKeyLabel}
      </label>
      <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
        {hasApiKey ? strings.aiApiKeyConfigured : strings.aiApiKeyNotConfigured}
      </p>
      <div className="flex items-center gap-2">
        <input
          autoComplete="off"
          className="h-8 w-full max-w-[260px] rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-800 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent/60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          id="settings-ai-api-key"
          onChange={(event) => {
            onDraftChange(event.target.value);
          }}
          placeholder={strings.aiApiKeyPlaceholder}
          type="password"
          value={apiKeyDraft}
        />
        <button
          className="inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 font-medium text-[12px] text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          disabled={apiKeyDraft.length === 0}
          onClick={onSave}
          type="button"
        >
          {strings.aiApiKeySave}
        </button>
        {hasApiKey ? (
          <button
            className="inline-flex h-8 items-center rounded-md border border-neutral-200 bg-white px-3 font-medium text-[12px] text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            onClick={onClear}
            type="button"
          >
            {strings.aiApiKeyClear}
          </button>
        ) : null}
      </div>
    </div>
  );
}
