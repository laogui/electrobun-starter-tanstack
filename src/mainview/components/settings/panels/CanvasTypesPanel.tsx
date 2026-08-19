import { useEffect, useState } from 'react';
import { resolveExtensionMessage } from '@/extensions/messages';
import { canvasTypeRegistry } from '@/extensions/registry';
import {
  rpcClearExtensionTypeData,
  rpcListExtensionEnablement,
} from '@/lib/rpc';
import type { LocaleSetting } from '@/settingsClient';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';

import type { SettingsLocaleStrings } from '../i18n/getLocaleStrings';

interface CanvasTypesPanelProps {
  locale: LocaleSetting;
  strings: SettingsLocaleStrings;
}

export function CanvasTypesPanel({ locale, strings }: CanvasTypesPanelProps) {
  const disabledCanvasTypes = useExtensionEnablementStore(
    (s) => s.disabledCanvasTypes
  );
  const hydrate = useExtensionEnablementStore((s) => s.hydrate);
  const setEnabled = useExtensionEnablementStore((s) => s.setEnabled);
  const [instanceCounts, setInstanceCounts] = useState<Record<string, number>>(
    {}
  );
  const [pendingClearId, setPendingClearId] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const types = canvasTypeRegistry.list();

  const refreshCounts = async () => {
    const result = await rpcListExtensionEnablement();
    hydrate(result.disabledCanvasTypes);
    setInstanceCounts(result.instanceCounts ?? {});
  };

  useEffect(() => {
    let mounted = true;
    rpcListExtensionEnablement()
      .then((result) => {
        if (!mounted) {
          return;
        }
        hydrate(result.disabledCanvasTypes);
        setInstanceCounts(result.instanceCounts ?? {});
      })
      .catch(() => {
        // Keep the last in-memory enablement when RPC is unavailable.
      });
    return () => {
      mounted = false;
    };
  }, [hydrate]);

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-50">
        {strings.canvasTypesTitle}
      </h2>
      <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
        {strings.canvasTypesDescription}
      </p>
      {clearError ? (
        <p className="text-[13px] text-red-600 dark:text-red-400" role="alert">
          {clearError}
        </p>
      ) : null}
      {types.length === 0 ? (
        <p className="text-[13px] text-neutral-500">
          {strings.canvasTypesEmpty}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {types.map((type) => {
            const enabled = !disabledCanvasTypes.includes(type.id);
            const count = instanceCounts[type.id] ?? 0;
            const name = resolveExtensionMessage(type.titleKey, locale);
            return (
              <li className="flex items-center gap-3 px-4 py-3" key={type.id}>
                <type.icon className="shrink-0 text-neutral-500" size={16} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[13px]">{name}</div>
                  <div className="text-[12px] text-neutral-500">
                    {type.descriptionKey
                      ? resolveExtensionMessage(type.descriptionKey, locale)
                      : type.id}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {strings.canvasTypesInstanceCount(count)}
                  </div>
                  {pendingClearId === type.id ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-[12px] text-red-600 dark:text-red-400">
                        {strings.canvasTypesClearConfirm(count, name)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="rounded-md bg-red-600 px-2 py-1 text-[12px] text-white"
                          onClick={() => {
                            setClearError(null);
                            rpcClearExtensionTypeData(type.id)
                              .then((result) => {
                                if (!result.success) {
                                  setClearError(strings.canvasTypesClearFailed);
                                  return;
                                }
                                setPendingClearId(null);
                                return refreshCounts();
                              })
                              .catch(() => {
                                setClearError(strings.canvasTypesClearFailed);
                              });
                          }}
                          type="button"
                        >
                          {strings.canvasTypesClear}
                        </button>
                        <button
                          className="rounded-md px-2 py-1 text-[12px] text-neutral-600 dark:text-neutral-300"
                          onClick={() => {
                            setPendingClearId(null);
                          }}
                          type="button"
                        >
                          {strings.cleanupConfirmCancel}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {count > 0 && pendingClearId !== type.id ? (
                    <button
                      className="rounded-md px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      onClick={() => {
                        setClearError(null);
                        setPendingClearId(type.id);
                      }}
                      type="button"
                    >
                      {strings.canvasTypesClear}
                    </button>
                  ) : null}
                  <select
                    aria-label={name}
                    className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] dark:border-neutral-700 dark:bg-neutral-900"
                    onChange={(event) => {
                      setEnabled(type.id, event.target.value === 'on').catch(
                        () => undefined
                      );
                    }}
                    value={enabled ? 'on' : 'off'}
                  >
                    <option value="on">{strings.canvasTypesEnabled}</option>
                    <option value="off">{strings.canvasTypesDisabled}</option>
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
