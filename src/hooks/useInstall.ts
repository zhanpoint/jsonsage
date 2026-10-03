import { useEffect, useState } from 'react';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export function useInstall() {
  const [event, setEvent] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const available = (event: Event) => { event.preventDefault(); setEvent(event as InstallPrompt); };
    const installed = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', installed); };
  }, []);
  return { available: !!event, install: async () => { if (event) { await event.prompt(); await event.userChoice; setEvent(null); } } };
}
