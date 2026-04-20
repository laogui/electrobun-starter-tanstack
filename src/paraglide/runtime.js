let currentLocale = 'en';

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = locale;

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}
