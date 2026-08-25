import { useEffect, useState } from 'react';

import { GOOGLE_EMBED_APPS, type EmbedAppId } from '@/lib/google/apps';
import {
  EMBED_APPS_NEEDING_COOKIE_RELAXATION,
  relaxGoogleCookiesForIframe,
} from '@/lib/google/keep-embed';

interface GoogleAppEmbedProps {
  appId: EmbedAppId;
}

function needsCookieRelaxation(appId: EmbedAppId): boolean {
  return (EMBED_APPS_NEEDING_COOKIE_RELAXATION as readonly string[]).includes(appId);
}

export function GoogleAppEmbed({ appId }: GoogleAppEmbedProps) {
  const app = GOOGLE_EMBED_APPS[appId];
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);

    const prepare = needsCookieRelaxation(appId)
      ? relaxGoogleCookiesForIframe()
      : Promise.resolve();

    prepare.finally(() => {
      if (!cancelled) setSrc(app.url);
    });

    return () => {
      cancelled = true;
    };
  }, [app.url, appId]);

  if (!src) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        Preparing {app.label}…
      </div>
    );
  }

  return (
    <iframe
      key={src}
      title={app.label}
      src={src}
      className="min-h-0 w-full flex-1 border-0 bg-background"
      referrerPolicy="no-referrer-when-downgrade"
      allow="clipboard-read; clipboard-write; microphone; camera; display-capture; fullscreen"
    />
  );
}
