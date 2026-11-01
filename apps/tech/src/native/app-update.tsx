import { App } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import { ConfirmationDialog } from '@servicepro/ui';
import { useEffect, useState } from 'react';

import { isNativeApp } from './native-app';

/*
 * Test builds are installed from the website, not a store, so nothing tells a partner a new build
 * exists. On start and whenever the app comes back to the front, it reads the latest version the
 * site publishes (partner-app.json next to the download) and, if it's newer than this build, offers
 * to download it. Native HTTP: the site is another origin and sends no CORS headers.
 */

interface LatestVersion {
  versionCode: number;
  versionName: string;
  url: string;
  notes?: string;
}

const SITE = (import.meta.env.VITE_SITE_URL ?? '').replace(/\/$/, '');
/** Asked once per run of the app; "Later" waits for the next start. */
let dismissed = false;

async function latestVersion(): Promise<LatestVersion | null> {
  const [installed, response] = await Promise.all([App.getInfo(), CapacitorHttp.get({ url: `${SITE}/partner-app.json?t=${Date.now()}` })]);
  const latest = (typeof response.data === 'string' ? JSON.parse(response.data) : response.data) as LatestVersion;
  return response.status === 200 && latest.versionCode > Number(installed.build) ? latest : null;
}

export function AppUpdatePrompt() {
  const [update, setUpdate] = useState<LatestVersion | null>(null);

  useEffect(() => {
    if (!isNativeApp || !SITE) return;
    const check = () => {
      if (!dismissed) void latestVersion().then(setUpdate, () => undefined); // offline: try again later
    };
    check();
    const listener = App.addListener('resume', check);
    return () => void listener.then((l) => l.remove());
  }, []);

  if (!update) return null;
  return (
    <ConfirmationDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          dismissed = true;
          setUpdate(null);
        }
      }}
      title="New version available"
      description={`Pakka Fix Partner ${update.versionName} is ready.${update.notes ? ` ${update.notes}` : ''} Download it, then tap the file to install. Your sign-in stays.`}
      confirmLabel="Download update"
      cancelLabel="Later"
      onConfirm={() => {
        // Leaving the app's origin opens the phone's browser, which downloads the APK.
        window.location.href = new URL(update.url, `${SITE}/`).toString();
      }}
    />
  );
}
