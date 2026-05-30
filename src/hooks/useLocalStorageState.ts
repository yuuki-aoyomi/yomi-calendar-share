import { useEffect, useState } from 'react';

// localStorage への保存処理をまとめ、将来 API 呼び出しへ置き換えやすくします。
export function useLocalStorageState<T>(key: string, initialValue: T, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [value, setValue] = useState<T>(() => {
    if (!enabled) return initialValue;

    const storedValue = window.localStorage.getItem(key);
    if (!storedValue) return initialValue;

    try {
      return JSON.parse(storedValue) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (!enabled) return;

    window.localStorage.setItem(key, JSON.stringify(value));
  }, [enabled, key, value]);

  return [value, setValue] as const;
}
