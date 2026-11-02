import { useEffect, useState } from 'react';

export type Language = 'en' | 'zh';

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem('jsonsage-language') === 'zh' ? 'zh' : 'en',
  );
  useEffect(() => {
    localStorage.setItem('jsonsage-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'jsonsage-language') setLanguage(event.newValue === 'zh' ? 'zh' : 'en');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return [language, setLanguage] as const;
}
