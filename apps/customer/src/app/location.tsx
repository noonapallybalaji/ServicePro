import { locateServiceability, type LocatedServiceabilityResponse } from '@servicepro/api-client';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapPicker, type MapPickerHandle } from '@/components/map-picker';
import { PressableScale, tap } from '@/components/motion';
import { AppText, Badge, Button, Ionicons } from '@/components/ui';
import { deliverPick } from '@/lib/location-pick';
import { markWelcomed } from '@/lib/onboarding';
import { setServiceArea } from '@/lib/service-pincode';
import { colors, fonts, radius, shadow, space, type } from '@/lib/theme';

/*
 * "Select a location": move the map under the pin, or search an area or PIN code. The address under
 * the pin is looked up as the map settles, with whether we serve it. Sets the service area, or hands
 * the point back to the booking that asked (?for=pick). First launch (?first=1) ends here.
 */

const HYDERABAD = { latitude: 17.385, longitude: 78.4867 };

interface SearchResult {
  label: string;
  latitude: number;
  longitude: number;
}

/** Places in and around Hyderabad (OpenStreetMap's search; light use, one query at a time). */
async function searchPlaces(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&bounded=1&viewbox=78.15,17.65,78.75,17.15&q=' + encodeURIComponent(query);
  const response = await fetch(url, { headers: { 'User-Agent': 'PakkaFix-Customer-App/1.2 (support@pakkafix.in)', 'Accept-Language': 'en' }, signal });
  if (!response.ok) return [];
  const found = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return found.map((place) => ({ label: place.display_name.split(', ').slice(0, 4).join(', '), latitude: Number(place.lat), longitude: Number(place.lon) }));
}

export default function LocationScreen() {
  const { first, for: purpose } = useLocalSearchParams<{ first?: string; for?: string }>();
  const insets = useSafeAreaInsets();
  const map = useRef<MapPickerHandle>(null);
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [spot, setSpot] = useState<LocatedServiceabilityResponse | null>(null);
  const [looking, setLooking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [locating, setLocating] = useState(false);
  const lookup = useRef(0);

  // Search as they type (debounced; the previous query is cancelled).
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(/^\d{6}$/.test(text) ? `${text}, Hyderabad` : text, controller.signal)
        .then(setResults)
        .catch(() => undefined);
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function onCenter(latitude: number, longitude: number) {
    setCenter({ latitude, longitude });
    const id = ++lookup.current;
    setLooking(true);
    locateServiceability({ latitude, longitude })
      .then((found) => id === lookup.current && setSpot(found))
      .catch(() => id === lookup.current && setSpot(null))
      .finally(() => id === lookup.current && setLooking(false));
  }

  async function locateMe() {
    tap();
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      map.current?.goTo(position.coords.latitude, position.coords.longitude);
    } finally {
      setLocating(false);
    }
  }

  // Start where the phone is, if location is already allowed (no prompt on open).
  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then(async (permission) => {
      if (!permission.granted) return;
      const last = await Location.getLastKnownPositionAsync();
      if (last) map.current?.goTo(last.coords.latitude, last.coords.longitude);
    });
  }, []);

  function confirm() {
    if (!spot?.pincode || !center) return;
    const place = spot.locality ?? spot.areas[0] ?? '';
    if (purpose === 'pick' && deliverPick({ ...center, pincode: spot.pincode, locality: place })) {
      router.back();
      return;
    }
    setServiceArea({ pincode: spot.pincode, place });
    if (first) {
      markWelcomed();
      router.replace('/');
    } else {
      router.back();
    }
  }

  const serviceable = spot?.located && spot.isServiceable;
  const typing = query.trim().length >= 3;

  return (
    <View style={{ flex: 1, backgroundColor: colors.sunken }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MapPicker ref={map} latitude={HYDERABAD.latitude} longitude={HYDERABAD.longitude} onCenter={onCenter} />

      <View style={[styles.topRow, { top: insets.top + space.sm }]}>
        {first ? (
          <View />
        ) : (
          <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={[styles.round, shadow.raised]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </PressableScale>
        )}
        <PressableScale onPress={() => void locateMe()} accessibilityRole="button" accessibilityLabel="Use my current location" style={[styles.round, shadow.raised]}>
          {locating ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="navigate" size={20} color={colors.primary} />}
        </PressableScale>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        {!typing ? (
          <Animated.View entering={FadeIn} style={{ paddingHorizontal: space.lg, marginBottom: space.md }}>
            <PressableScale onPress={confirm} disabled={!serviceable} accessibilityRole="button" style={[styles.useBtn, shadow.raised, !serviceable && { opacity: 0.6 }]}>
              <AppText tone="inverse" bold center>
                Use this location
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Ionicons name="location" size={13} color="#ffffff" />
                <AppText variant="caption" tone="inverseMuted" numberOfLines={1}>
                  {looking ? 'Finding the address…' : spot?.pincode ? `${spot.locality ?? spot.areas[0] ?? 'Hyderabad'}, ${spot.pincode}` : 'Move the map to your home'}
                </AppText>
              </View>
            </PressableScale>
          </Animated.View>
        ) : null}

        <Animated.View entering={SlideInDown.springify().damping(18)} style={[styles.sheet, shadow.raised, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.grabber} />
          <AppText variant="h2">Select a location</AppText>
          <AppText variant="small" tone="muted">
            Search your area or PIN code, or move the map to your home.
          </AppText>
          <View style={styles.search}>
            <AppText variant="small" semibold>
              Location
            </AppText>
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (text.trim().length < 3) setResults([]);
              }}
              placeholder="Area, street or PIN code"
              placeholderTextColor={colors.textMuted}
              style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0, fontFamily: fonts.regular }]}
              returnKeyType="search"
              accessibilityLabel="Search a location"
            />
            {query ? (
              <PressableScale onPress={() => {
                  setQuery('');
                  setResults([]);
                }} accessibilityLabel="Clear" hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </PressableScale>
            ) : null}
          </View>

          {typing ? (
            <View>
              {results.length === 0 ? (
                <AppText variant="small" tone="muted" style={{ paddingVertical: space.md }}>
                  Searching…
                </AppText>
              ) : (
                results.map((result, i) => (
                  <PressableScale
                    key={`${result.latitude}-${i}`}
                    onPress={() => {
                      tap();
                      map.current?.goTo(result.latitude, result.longitude);
                      setQuery('');
                      setResults([]);
                    }}
                    accessibilityRole="button"
                    style={[styles.result, i < results.length - 1 && styles.resultDivider]}
                  >
                    <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                    <AppText variant="small" style={{ flex: 1 }} numberOfLines={2}>
                      {result.label}
                    </AppText>
                  </PressableScale>
                ))
              )}
            </View>
          ) : spot ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              {spot.located && spot.isServiceable ? (
                <Badge label="We serve this area" tone="success" icon="checkmark-circle" />
              ) : spot.located ? (
                <Badge label="Not served here yet" tone="warning" icon="alert-circle" />
              ) : (
                <Badge label="Move the pin onto a street" tone="neutral" />
              )}
            </View>
          ) : null}

          {first && !typing ? (
            <Button
              small
              variant="ghost"
              label="Not now"
              onPress={() => {
                markWelcomed();
                router.replace('/');
              }}
            />
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  useBtn: { backgroundColor: colors.primary, borderRadius: radius.control, paddingVertical: space.md, paddingHorizontal: space.lg, gap: 2 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.lg, gap: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.xs },
  search: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  resultDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
