import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

export interface Spot {
  latitude: number;
  longitude: number;
}

export type FindFailure = 'denied' | 'blocked' | 'off' | 'failed';

/**
 * Finds the phone: asks for permission if it may, asks Android to turn location on if it's off,
 * then returns where it is (giving up after a few seconds). `onRough` gets the last known spot
 * first, so a map can move at once.
 */
export async function findPhone(onRough?: (spot: Spot) => void): Promise<Spot | FindFailure> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) return 'blocked';
      permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return permission.canAskAgain ? 'denied' : 'blocked';
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      if (Platform.OS !== 'android') return 'off';
      try {
        await Location.enableNetworkProviderAsync(); // the system's "Turn on location?" dialog
      } catch {
        return 'off';
      }
    }
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
    if (last) onRough?.({ latitude: last.coords.latitude, longitude: last.coords.longitude });
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    const best = current ?? last;
    return best ? { latitude: best.coords.latitude, longitude: best.coords.longitude } : 'failed';
  } catch {
    return 'failed';
  }
}

/** Tells the customer why their location couldn't be used, with a way to fix it. */
export function explainFailure(failure: FindFailure) {
  if (failure === 'blocked') {
    Alert.alert('Location is off for Pakka Fix', 'Allow location for Pakka Fix in Settings, or enter your area instead.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: () => void Linking.openSettings() },
    ]);
  } else if (failure === 'off') {
    Alert.alert('Turn on location', "Your phone's location is off. Turn it on, or enter your area instead.");
  } else if (failure === 'failed') {
    Alert.alert("Couldn't find you", 'Move the map to your home, or enter your area instead.');
  }
}
