import { apiFetch } from '@servicepro/api-client';
import { Skeleton, cn } from '@servicepro/ui';
import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Images behind authentication (job photos). A plain <img src> can't send the bearer
 * token, so the bytes are fetched through the API client and shown from an object URL.
 */
export function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    apiFetch<Blob>(src)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
      })
      .catch(() => !cancelled && setState({ url: null, failed: true }));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (state.failed) {
    return (
      <div role="img" aria-label={`${alt} (couldn't load)`} className={cn('flex items-center justify-center bg-surface-sunken text-foreground-muted', className)}>
        <ImageOff aria-hidden className="size-6" />
      </div>
    );
  }

  return state.url ? <img src={state.url} alt={alt} className={cn('object-cover', className)} /> : <Skeleton className={className} />;
}

/** Opens a protected file (invoice PDF) in a new tab. */
export async function openProtectedFile(path: string) {
  const blob = await apiFetch<Blob>(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
