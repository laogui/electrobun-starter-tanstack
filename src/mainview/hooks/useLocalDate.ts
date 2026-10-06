import { useEffect, useState } from 'react';

import { localDateKey } from '@/store/learningStore';

/** Refresh on local midnight and when returning to a suspended app. */
export function useLocalDate(): string {
  const [date, setDate] = useState(localDateKey);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setDate(localDateKey());
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 100);
    };
    refresh();
    globalThis.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      globalThis.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return date;
}
