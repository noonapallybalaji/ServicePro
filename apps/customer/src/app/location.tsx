import { locateServiceability, useCheckServiceability } from '@servicepro/api-client';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Appear, PressableScale, tap } from '@/components/motion';
import { AppText, BottomBar, Button, Chip, Field, IconCircle, Input, Ionicons, Notice } from '@/components/ui';
import { markWelcomed } from '@/lib/onboarding';
import { setServiceArea, useServiceArea } from '@/lib/service-pincode';
import { colors, radius, shadow, space } from '@/lib/theme';

/*
 * "Where do you need service?" Either the phone's location (the API turns it into a PIN code and
 * area) or a PIN code typed in, checked against the areas we serve. First launch ends here.
 */

const PINCODE = /^[1-9]\d{5}$/;

export default function LocationScreen() {
  const { first } = useLocalSearchParams<{ first?: string }>();
  const current = useServiceArea();
  const [pincode, setPincode] = useState(current?.pincode ?? '');
  const [place, setPlace] = useState(current?.place ?? '');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const complete = PINCODE.test(pincode);
  const check = useCheckServiceability(pincode, { query: { enabled: complete, staleTime: 5 * 60_000 } });
  const places = check.data ? [...new Set([...check.data.localities, ...check.data.areas])] : [];
  const chosen = place && places.includes(place) ? place : (places[0] ?? '');

  const finish = (area: { pincode: string; place: string }) => {
    setServiceArea(area);
    if (first) {
      markWelcomed();
      router.replace('/');
    } else {
      router.back();
    }
  };

  async function locateMe() {
    tap();
    setLocateError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocateError('Location is off for Pakka Fix. Enter your PIN code instead, or allow location in Settings.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const found = await locateServiceability({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      if (!found.located || !found.pincode) {
        setLocateError("We couldn't work out your PIN code from here. Enter it below.");
        return;
      }
      setPincode(found.pincode);
      setPlace(found.locality ?? found.areas[0] ?? '');
      if (found.isServiceable) finish({ pincode: found.pincode, place: found.locality ?? found.areas[0] ?? '' });
    } catch {
      setLocateError("Couldn't get your location. Enter your PIN code instead.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <Appear style={{ gap: space.xs }}>
          <AppText variant="display">Where do you need service?</AppText>
          <AppText tone="secondary">We'll show prices and technicians for your area.</AppText>
        </Appear>

        <Appear index={1}>
          <PressableScale
            onPress={() => void locateMe()}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel="Use my current location"
            style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryBorder }, shadow.card]}
          >
            <IconCircle name="locate" />
            <View style={{ flex: 1 }}>
              <AppText bold tone="primary">
                {locating ? 'Finding you…' : 'Use my current location'}
              </AppText>
              <AppText variant="small" tone="muted">
                Quickest: we find your PIN code
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </PressableScale>
        </Appear>
        {locateError ? <Notice tone="warning" title={locateError} /> : null}

        <Appear index={2} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <AppText variant="caption" tone="muted">
            OR ENTER YOUR PIN CODE
          </AppText>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </Appear>

        <Appear index={3} style={{ gap: space.lg }}>
          <Field label="PIN code" hint={complete && check.isPending ? 'Checking…' : 'We serve all of Hyderabad.'}>
            <Input
              icon="location"
              value={pincode}
              onChangeText={(text) => {
                setPincode(text.replace(/\D/g, '').slice(0, 6));
                setPlace('');
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="500081"
            />
          </Field>
          {complete && check.data ? (
            check.data.isServiceable ? (
              <Notice tone="success" title="Great, we work in this area" />
            ) : (
              <Notice tone="warning" title="We don't serve this PIN code yet" description="Check the number, or call us: we may still be able to help." />
            )
          ) : null}
          {complete && check.isError ? <Notice tone="error" title="Couldn't check it right now" description="Check your connection and try again." /> : null}
          {places.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <AppText variant="small" semibold>
                Your area
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {places.map((name) => (
                  <Chip key={name} label={name} selected={chosen === name} onPress={() => setPlace(name)} />
                ))}
              </View>
            </View>
          ) : null}
        </Appear>
      </ScrollView>
      <BottomBar>
        <Button label="Continue" disabled={!check.data?.isServiceable} onPress={() => finish({ pincode, place: chosen })} />
        {first ? (
          <Button
            label="Not now"
            variant="ghost"
            onPress={() => {
              markWelcomed();
              router.replace('/');
            }}
          />
        ) : null}
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
