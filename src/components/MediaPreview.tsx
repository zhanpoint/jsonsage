import { useCallback, useEffect, useRef } from 'react';
import { I18nProvider } from '@videojs/react/i18n';
import { Audio, AudioPlayer, NeutralAudioSkin } from '@videojs/react/audio';
import { Video, VideoPlayer, NeutralVideoSkin } from '@videojs/react/video';
import '@videojs/react/audio/neutral-skin.css';
import '@videojs/react/video/neutral-skin.css';

export default function MediaPreview({ url, kind, language }: { url: string; kind: 'audio' | 'video'; language: 'zh' | 'en' }) {
  const media = useRef<HTMLMediaElement>(null);
  const attach = useCallback((element: HTMLMediaElement | null) => { media.current = element; }, []);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    // Restore the source after React StrictMode's cleanup/setup cycle as well.
    if (element.getAttribute('src') !== url) element.src = url;
    return () => { element.pause(); element.removeAttribute('src'); element.load(); };
  }, [url, kind]);
  return <div className="media-preview">
    <I18nProvider locale={language === 'zh' ? 'zh-CN' : 'en'}>
      {kind === 'audio' ? <AudioPlayer>
        <NeutralAudioSkin className="preview-audio-player">
          <Audio src={url} preload="metadata" ref={attach} />
        </NeutralAudioSkin>
      </AudioPlayer> : <VideoPlayer>
        <NeutralVideoSkin className="preview-video-player">
          <Video src={url} preload="metadata" playsInline ref={attach} />
        </NeutralVideoSkin>
      </VideoPlayer>}
    </I18nProvider>
  </div>;
}
