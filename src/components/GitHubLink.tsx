import { useEffect, useState } from 'react';
import { Github, Star } from 'lucide-react';
import { HelpTooltip } from './ui/HelpTooltip';

const repository = 'zhanpoint/jsonsage';
const refreshInterval = 60_000;

export default function GitHubLink({ language }: { language: 'en' | 'zh' }) {
  const [stars, setStars] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let lastAttempt = 0;

    async function refresh() {
      if (document.hidden || pending || Date.now() - lastAttempt < refreshInterval) return;
      pending = true;
      lastAttempt = Date.now();
      try {
        const response = await fetch(`https://api.github.com/repos/${repository}`, {
          headers: { Accept: 'application/vnd.github+json' },
          credentials: 'omit',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error(`GitHub: ${response.status}`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('stargazers_count' in data)
          || typeof data.stargazers_count !== 'number' || !Number.isSafeInteger(data.stargazers_count)
          || data.stargazers_count < 0) throw new Error('Invalid GitHub star count');
        if (!controller.signal.aborted) {
          setStars(data.stargazers_count);
          setUnavailable(false);
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        pending = false;
      }
    }

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, refreshInterval);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);

  const count = stars?.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
  const status = unavailable
    ? language === 'zh' ? '暂时无法更新 Star 数量' : 'Star count temporarily unavailable'
    : language === 'zh' ? '每分钟自动更新' : 'Updates every minute';
  const label = `GitHub${count === undefined ? '' : ` · ${count} Stars`} · ${status}`;

  return <HelpTooltip side="bottom" label={label}>
    <a className="header-control repo-link" href={`https://github.com/${repository}`} target="_blank" rel="noopener noreferrer" aria-label={label}>
      <Github size={16} aria-hidden="true" /><span>GitHub</span>
      <span className="repo-stars" aria-hidden="true"><Star size={13} /><span>{count ?? (unavailable ? '—' : '…')}</span></span>
    </a>
  </HelpTooltip>;
}
