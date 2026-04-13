import Electrobun, { Electroview } from 'electrobun/view';

type SettingsRPC = {
  bun: {
    requests: {
      getSettings: {
        params: Record<string, unknown>;
        response: { theme: string; locale: string };
      };
      saveSettings: {
        params: { theme: string; locale: string };
        response: { success: boolean };
      };
    };
    messages: Record<string, unknown>;
  };
  webview: {
    requests: Record<string, unknown>;
    messages: Record<string, unknown>;
  };
};

const localeStrings: Record<
  string,
  { title: string; language: string; theme: string }
> = {
  en: { title: 'Settings', language: 'Language', theme: 'Theme' },
  zh: { title: '设置', language: '语言', theme: '主题' },
};

function applyTheme(theme: string) {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
  } else if (theme === 'light') {
    html.classList.remove('dark');
  } else {
    // system
    html.classList.toggle(
      'dark',
      globalThis.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }
}

function applyLocale(locale: string) {
  const strings = localeStrings[locale] ?? localeStrings.en;
  if (!strings) return;
  const titleEl = document.querySelector('#settings-title');
  const labelLanguage = document.querySelector('#label-language');
  const labelTheme = document.querySelector('#label-theme');
  if (titleEl) titleEl.textContent = strings.title;
  if (labelLanguage) labelLanguage.textContent = strings.language;
  if (labelTheme) labelTheme.textContent = strings.theme;
  document.documentElement.lang = locale;
}

// Set up RPC immediately (before DOM ready) so the IPC bridge is established
const rpc = Electroview.defineRPC<SettingsRPC>({
  handlers: {
    requests: {},
    messages: {},
  },
});

const electrobun = new Electrobun.Electroview({ rpc });

// Wire up UI after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const localeSelect = document.querySelector('#locale-select')!;
  const themeSelect = document.querySelector('#theme-select')!;

  // Load initial settings from bun process
  electrobun
    .rpc!.request.getSettings({})
    .then((settings) => {
      themeSelect.value = settings.theme;
      localeSelect.value = settings.locale;
      applyTheme(settings.theme);
      applyLocale(settings.locale);
    })
    .catch((error: unknown) => {
      console.warn('[settings] Failed to load settings:', error);
    });

  function saveCurrentSettings() {
    electrobun
      .rpc!.request.saveSettings({
        theme: themeSelect.value,
        locale: localeSelect.value,
      })
      .catch((error: unknown) => {
        console.warn('[settings] Failed to save settings:', error);
      });
  }

  localeSelect.addEventListener('change', () => {
    applyLocale(localeSelect.value);
    saveCurrentSettings();
  });

  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
    saveCurrentSettings();
  });

  // React to system theme changes when in "system" mode
  globalThis
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (themeSelect.value === 'system') {
        applyTheme('system');
      }
    });
});
