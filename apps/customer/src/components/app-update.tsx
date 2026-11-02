import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import { config } from '@/lib/config';

/*
 * Test builds are installed from the website, not a store, so the app checks customer-app.json on
 * the site (on start and when it comes back to the front) and offers a newer build when there is
 * one. Store builds get updates from the store and skip this.
 */

interface LatestVersion {
  versionCode: number;
  versionName: string;
  url: string;
  notes?: string;
}

let asked = false;

export function AppUpdatePrompt() {
  const [latest, setLatest] = useState<LatestVersion | null>(null);
  const installed = Constants.expoConfig?.android?.versionCode ?? 0;

  useEffect(() => {
    if (Platform.OS !== 'android' || !config.siteUrl) return;
    const check = () => {
      if (asked) return;
      fetch(`${config.siteUrl}/customer-app.json?t=${Date.now()}`)
        .then((response) => (response.ok ? (response.json() as Promise<LatestVersion>) : null))
        .then((found) => {
          if (found && found.versionCode > installed) setLatest(found);
        })
        .catch(() => undefined); // offline: try again later
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => subscription.remove();
  }, [installed]);

  useEffect(() => {
    if (!latest || asked) return;
    asked = true;
    Alert.alert('New version available', `Pakka Fix ${latest.versionName} is ready.${latest.notes ? ` ${latest.notes}` : ''}`, [
      { text: 'Later', style: 'cancel' },
      { text: 'Download', onPress: () => void Linking.openURL(new URL(latest.url, `${config.siteUrl}/`).toString()) },
    ]);
  }, [latest]);

  return null;
}
