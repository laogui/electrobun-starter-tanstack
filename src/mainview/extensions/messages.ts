import type { LocaleSetting } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import enMessages from '../../../messages/en.json';
import zhMessages from '../../../messages/zh.json';

const catalogs: Record<LocaleSetting, Record<string, string>> = {
  en: enMessages as Record<string, string>,
  zh: zhMessages as Record<string, string>,
};

export function resolveExtensionMessage(
  key: string,
  locale?: LocaleSetting
): string {
  const resolved = locale ?? useAppSettingsStore.getState().locale;
  const value = catalogs[resolved]?.[key];
  return typeof value === 'string' ? value : key;
}
