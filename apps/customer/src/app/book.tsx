import {
  getListMyBookingsQueryKey,
  isApiError,
  locateServiceability,
  useBookServiceOnline,
  useCheckServiceability,
  useGetActiveCatalog,
  useGetMyAccount,
  useRequestBookingCode,
  type OnlineBookingResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';

import { Appear, PressableScale, ProgressBar, SuccessMark, tap } from '@/components/motion';
import { AppText, BottomBar, Button, Card, Chip, CodeInput, Field, IconCircle, Input, Ionicons, Notice } from '@/components/ui';
import { applianceIcon, appliancePhoto } from '@/lib/appliances';
import { config } from '@/lib/config';
import { formatINR, mobileDigits, prettyPhone } from '@/lib/format';
import { pickOnMap } from '@/lib/location-pick';
import { useServiceArea } from '@/lib/service-pincode';
import { signInWith, useCustomer } from '@/lib/session';
import { colors, radius, shadow, space } from '@/lib/theme';

/*
 * Booking a repair, one decision per step: the appliance → what's wrong → where → confirm. No time:
 * the office calls to agree the visit. A customer who isn't signed in proves their number with a code
 * on the last step, and the booking signs them in. Android's back button goes back a step.
 */

const STEPS = ['Appliance', 'Problem', 'Address', 'Confirm'] as const;
const PINCODE = /^[1-9]\d{5}$/;

/** One id per booking attempt: a double tap or a retry returns the same booking. */
const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function BookScreen() {
  const params = useLocalSearchParams<{ category?: string; issue?: string }>();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const catalog = useGetActiveCatalog();
  const area = useServiceArea();
  const { customer } = useCustomer();
  const account = useGetMyAccount({ query: { enabled: customer !== null } });
  const saved = customer ? (account.data?.addresses ?? []) : [];

  const [step, setStep] = useState(params.category ? 1 : 0);
  const [categoryId, setCategoryId] = useState(params.category ?? '');
  const [issueTypeId, setIssueTypeId] = useState<string | null>(params.issue ?? null);
  const [problem, setProblem] = useState('');
  const [addressChoice, setAddressChoice] = useState<string | null>(null); // a saved address id, or 'new'
  const [pincode, setPincode] = useState(area?.pincode ?? '');
  const [locality, setLocality] = useState(area?.place ?? '');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const [touched, setTouched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [booked, setBooked] = useState<OnlineBookingResponse | null>(null);
  const [requestId] = useState(newRequestId);
  const submitting = useRef(false);

  const requestCode = useRequestBookingCode({ mutation: { meta: { silent: true } } });
  const book = useBookServiceOnline({ mutation: { meta: { silent: true } } });

  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const category = categories.find((c) => c.id === categoryId);
  const issues = (category?.issueTypes ?? []).filter((issue) => issue.isActive);
  const savedChoice = addressChoice ?? saved.find((a) => a.isDefault)?.id ?? saved[0]?.id ?? 'new';
  const usingSaved = customer !== null && savedChoice !== 'new' && saved.some((a) => a.id === savedChoice);
  const savedAddress = saved.find((a) => a.id === savedChoice);

  const pinOk = PINCODE.test(pincode);
  const check = useCheckServiceability(pincode, { query: { enabled: pinOk && !usingSaved, staleTime: 5 * 60_000 } });
  const places = check.data ? [...new Set([...check.data.localities, ...check.data.areas])] : [];
  const place = locality.trim() || places[0] || '';
  const addressOk = usingSaved || (pinOk && check.data?.isServiceable !== false && place !== '' && line1.trim() !== '');
  const digits = mobileDigits(phone);
  const contactOk = customer !== null || (fullName.trim().length >= 2 && digits !== null);
  const codeOpen = customer === null && sentTo !== null && sentTo.phone === digits;
  const sendError = isApiError(requestCode.error) ? requestCode.error : null;
  const bookError = isApiError(book.error) ? book.error : null;

  // Android back: one step back, not out of the booking.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (booked || step === 0) return false;
      setStep((s) => s - 1);
      return true;
    });
    return () => subscription.remove();
  }, [step, booked]);

  const go = (to: number) => {
    setTouched(false);
    setStep(to);
  };

  function next() {
    setTouched(true);
    if (step === 0 && category) go(1);
    else if (step === 1) go(2);
    else if (step === 2 && addressOk) go(3);
    else if (step === 3) submit();
  }

  async function locateMe() {
    tap();
    setLocateError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocateError('Location is off for Pakka Fix. Enter the address instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const found = await locateServiceability({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setAddressChoice('new');
      if (found.pincode) {
        setPincode(found.pincode);
        setLocality(found.locality ?? found.areas[0] ?? '');
      } else {
        setLocateError("We couldn't find the PIN code here. Enter it below.");
      }
    } catch {
      setLocateError("Couldn't get your location. Enter the address instead.");
    } finally {
      setLocating(false);
    }
  }

  function confirm() {
    if (!category || submitting.current) return;
    submitting.current = true;
    book.mutate(
      {
        data: {
          categoryId: category.id,
          issueTypeId,
          problemDescription: problem.trim() || null,
          fullName: customer ? customer.fullName : fullName.trim(),
          phone: customer ? customer.phone : (digits ?? phone),
          code: customer ? null : code,
          address: {
            label: usingSaved ? null : saved.length === 0 ? 'Home' : 'Other',
            line1: line1.trim() || null,
            line2: line2.trim() || null,
            landmark: landmark.trim() || null,
            locality: place,
            city: config.city,
            state: null,
            pincode,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
          },
          acceptedPolicies: true,
          extras: null,
          requestId,
          addressId: usingSaved ? savedChoice : null,
        },
      },
      {
        onSuccess: (booking) => {
          // A verified booking signs the customer in, so "My bookings" works straight away.
          if (booking.session) signInWith(booking.session);
          void queryClient.invalidateQueries({ queryKey: getListMyBookingsQueryKey() });
          setBooked(booking);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  function submit() {
    if (!category || !addressOk || !contactOk) return;
    if (customer || codeOpen) {
      if (customer || code.length === sentTo?.length) confirm();
      return;
    }
    if (!digits) return;
    setCode('');
    requestCode.mutate(
      { data: { phone: digits } },
      { onSuccess: (response) => setSentTo({ phone: digits, length: response.codeLength, developmentCode: response.developmentCode }) },
    );
  }

  if (booked) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Booked', headerBackVisible: false }} />
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, alignItems: 'center', paddingTop: space.xxl }}>
          <SuccessMark />
          <Appear index={1} style={{ gap: space.sm, alignItems: 'center' }}>
            <AppText variant="display" center>
              Booking confirmed!
            </AppText>
            <AppText tone="secondary" center>
              We'll call you shortly to fix a time for the visit.
            </AppText>
          </Appear>
          <Appear index={2} style={{ alignSelf: 'stretch' }}>
            <Card style={{ gap: space.sm }}>
              <Row label="Request number" value={booked.srNumber} />
              <Row label="Appliance" value={category?.name ?? ''} />
              {category ? <Row label="Visiting charge" value={formatINR(category.baseVisitCharge)} /> : null}
            </Card>
          </Appear>
          <Appear index={3} style={{ alignSelf: 'stretch', gap: space.md }}>
            <Notice tone="info" title="What happens next" description="You get WhatsApp updates at every step, and you can follow the technician live in the app." />
          </Appear>
        </ScrollView>
        <BottomBar>
          <Button label="Track this booking" icon="navigate" onPress={() => router.replace(`/booking/${booked.serviceRequestId}`)} />
          <Button label="Back to home" variant="ghost" onPress={() => router.dismissTo('/')} />
        </BottomBar>
      </View>
    );
  }

  const tile = Math.floor((width - space.lg * 2 - space.md * 2) / 3);
  const cta =
    step < 3 ? 'Continue' : customer || codeOpen ? 'Confirm booking' : 'Send code to confirm';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={styles.progress}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="muted" bold>
            STEP {step + 1} OF {STEPS.length}
          </AppText>
          <AppText variant="caption" tone="primary" bold>
            {STEPS[step]}
          </AppText>
        </View>
        <ProgressBar value={(step + 1) / STEPS.length} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={SlideInRight.duration(260)} style={{ gap: space.xl }}>
          {step === 0 ? (
            <View style={{ gap: space.md }}>
              <AppText variant="title">What needs repair?</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                {categories.map((c) => {
                  const selected = c.id === categoryId;
                  const photo = appliancePhoto(c.code);
                  return (
                    <PressableScale
                      key={c.id}
                      haptic
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${c.name}, visit ${formatINR(c.baseVisitCharge)}`}
                      onPress={() => {
                        setCategoryId(c.id);
                        setIssueTypeId(null);
                      }}
                      style={[styles.applianceTile, { width: tile }, selected && styles.applianceSelected]}
                    >
                      {photo ? (
                        <Image source={photo} style={{ width: tile - 4, height: Math.round((tile - 4) * 0.75) }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: tile - 4, height: Math.round((tile - 4) * 0.75), alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySubtle }}>
                          <Ionicons name={applianceIcon(c.code)} size={28} color={colors.primary} />
                        </View>
                      )}
                      <View style={{ padding: 6 }}>
                        <AppText variant="caption" bold center numberOfLines={1}>
                          {c.name}
                        </AppText>
                        <AppText variant="caption" tone="muted" center>
                          {formatINR(c.baseVisitCharge)}
                        </AppText>
                      </View>
                      {selected ? (
                        <View style={styles.tick}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>
              {touched && !category ? (
                <AppText variant="small" tone="error">
                  Choose the appliance.
                </AppText>
              ) : null}
            </View>
          ) : null}

          {step === 1 && category ? (
            <View style={{ gap: space.lg }}>
              <View style={{ gap: 4 }}>
                <AppText variant="title">What's wrong with your {category.name.toLowerCase()}?</AppText>
                <AppText tone="secondary">Pick the closest match, or skip: the technician checks it.</AppText>
              </View>
              {issues.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {issues.map((issue) => (
                    <Chip key={issue.id} label={issue.name} icon="ellipse-outline" selected={issueTypeId === issue.id} onPress={() => setIssueTypeId(issueTypeId === issue.id ? null : issue.id)} />
                  ))}
                </View>
              ) : null}
              <Field label="Tell us more" optional hint="For example: not cooling, water leaking, error E4.">
                <Input value={problem} onChangeText={setProblem} multiline maxLength={500} placeholder="Describe the problem" />
              </Field>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: space.lg }}>
              <AppText variant="title">Where should we come?</AppText>
              {saved.length > 0 ? (
                <View style={{ gap: space.sm }}>
                  {saved.map((a) => {
                    const selected = savedChoice === a.id;
                    return (
                      <Card key={a.id} onPress={() => setAddressChoice(a.id)} accessibilityLabel={`${a.label}: ${a.line1}, ${a.locality}`} style={selected ? styles.selectedCard : undefined}>
                        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                          <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <AppText bold>{a.label}</AppText>
                            <AppText variant="small" tone="secondary">
                              {[a.line1, a.line2, a.locality, a.pincode].filter(Boolean).join(', ')}
                            </AppText>
                          </View>
                        </View>
                      </Card>
                    );
                  })}
                  <Chip label="A different address" icon="add" selected={savedChoice === 'new'} onPress={() => setAddressChoice('new')} />
                </View>
              ) : null}

              {!usingSaved ? (
                <View style={{ gap: space.lg }}>
                  <PressableScale onPress={() => void locateMe()} disabled={locating} accessibilityRole="button" style={[styles.locateRow, shadow.card]}>
                    <IconCircle name="locate" size={40} />
                    <View style={{ flex: 1 }}>
                      <AppText bold tone="primary">
                        {locating ? 'Finding you…' : coords ? 'Location added' : 'Use my current location'}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        Helps the technician find you
                      </AppText>
                    </View>
                    {coords ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      pickOnMap((picked) => {
                        setCoords({ latitude: picked.latitude, longitude: picked.longitude });
                        setPincode(picked.pincode);
                        setLocality(picked.locality);
                        setAddressChoice('new');
                      })
                    }
                    accessibilityRole="button"
                    style={[styles.locateRow, shadow.card]}
                  >
                    <IconCircle name="map" size={40} tone="accent" />
                    <View style={{ flex: 1 }}>
                      <AppText bold tone="primary">
                        Choose on the map
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        Drop the pin on your building
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                  </PressableScale>
                  {locateError ? <Notice tone="warning" title={locateError} /> : null}
                  <Field
                    label="PIN code"
                    error={touched && !pinOk ? 'Enter the 6-digit PIN code.' : check.data && !check.data.isServiceable ? "We don't serve this PIN code yet." : undefined}
                    hint={pinOk && check.isPending ? 'Checking…' : undefined}
                  >
                    <Input
                      icon="location"
                      value={pincode}
                      onChangeText={(text) => {
                        setPincode(text.replace(/\D/g, '').slice(0, 6));
                        setLocality('');
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="500081"
                    />
                  </Field>
                  {places.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                      {places.map((name) => (
                        <Chip key={name} label={name} selected={place === name} onPress={() => setLocality(name)} />
                      ))}
                    </View>
                  ) : null}
                  <Field label="House / flat number" error={touched && !line1.trim() ? 'Enter the house or flat number.' : undefined}>
                    <Input value={line1} onChangeText={setLine1} maxLength={120} placeholder="Flat 302" />
                  </Field>
                  <Field label="Building, street" optional>
                    <Input value={line2} onChangeText={setLine2} maxLength={120} placeholder="Sai Residency, Road No. 4" />
                  </Field>
                  <Field label="Landmark" optional>
                    <Input value={landmark} onChangeText={setLandmark} maxLength={120} placeholder="Near the temple" />
                  </Field>
                </View>
              ) : null}
            </View>
          ) : null}

          {step === 3 && category ? (
            <View style={{ gap: space.lg }}>
              <AppText variant="title">Confirm your booking</AppText>
              <Card style={{ gap: space.md }}>
                <SummaryRow icon={applianceIcon(category.code)} label="Appliance" value={category.name} onEdit={() => go(0)} />
                <SummaryRow
                  icon="build"
                  label="Problem"
                  value={[issues.find((i) => i.id === issueTypeId)?.name, problem.trim()].filter(Boolean).join(' · ') || 'The technician checks it'}
                  onEdit={() => go(1)}
                />
                <SummaryRow
                  icon="home"
                  label="Address"
                  value={
                    usingSaved && savedAddress
                      ? [savedAddress.line1, savedAddress.locality, savedAddress.pincode].filter(Boolean).join(', ')
                      : [line1, line2, place, pincode].filter((s) => s.trim()).join(', ')
                  }
                  onEdit={() => go(2)}
                />
              </Card>

              {customer ? (
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <IconCircle name="person" size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText bold>{customer.fullName}</AppText>
                    <AppText variant="small" tone="secondary">
                      {prettyPhone(customer.phone)}
                    </AppText>
                  </View>
                </Card>
              ) : (
                <View style={{ gap: space.lg }}>
                  <Field label="Your name" error={touched && fullName.trim().length < 2 ? 'Enter your name.' : undefined}>
                    <Input icon="person" value={fullName} onChangeText={setFullName} maxLength={120} autoComplete="name" placeholder="Full name" />
                  </Field>
                  <Field
                    label="Mobile number"
                    error={(touched && !digits ? 'Enter a 10-digit mobile number.' : undefined) ?? sendError?.fieldError('phone')}
                    hint="We send a code to confirm it's yours, and call this number about the visit."
                  >
                    <Input icon="call" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={16} placeholder="98765 43210" />
                  </Field>
                </View>
              )}

              <Card flat style={styles.charge}>
                <IconCircle name="cash" size={40} />
                <View style={{ flex: 1 }}>
                  <AppText bold>Visiting charge {formatINR(category.baseVisitCharge)}</AppText>
                  <AppText variant="small" tone="secondary">
                    Pay after the visit. You approve an estimate before any repair.
                  </AppText>
                </View>
              </Card>

              {sendError && !sendError.fieldError('phone') ? <Notice tone="error" title={sendError.message} /> : null}
              {bookError ? <Notice tone="error" title={bookError.message} /> : null}
              {book.isError && !bookError ? <Notice tone="error" title="Couldn't book right now" description="Check your connection and try again." /> : null}

              {codeOpen && sentTo ? (
                <Animated.View entering={FadeIn}>
                  <Field label={`Code sent to ${prettyPhone(sentTo.phone)}`} hint={sentTo.developmentCode ? `Test code: ${sentTo.developmentCode}` : 'It can take a few seconds to arrive.'}>
                    <CodeInput length={sentTo.length} value={code} onChange={setCode} />
                  </Field>
                </Animated.View>
              ) : null}

              <AppText variant="caption" tone="muted" center>
                By booking you agree to the Pakka Fix terms, privacy and cancellation policies.
              </AppText>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <BottomBar>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {step > 0 ? <Button label="Back" variant="outline" icon="arrow-back" onPress={() => go(step - 1)} style={{ paddingHorizontal: space.lg }} /> : null}
          <Button
            label={cta}
            variant={step === 3 ? 'accent' : 'primary'}
            trailingIcon={step < 3 ? 'arrow-forward' : undefined}
            onPress={next}
            loading={requestCode.isPending || book.isPending}
            disabled={(step === 0 && !category) || (codeOpen && code.length !== sentTo?.length)}
            style={{ flex: 1 }}
          />
        </View>
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ icon, label, value, onEdit }: { icon: Parameters<typeof IconCircle>[0]['name']; label: string; value: string; onEdit: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <IconCircle name={icon} size={36} />
      <View style={{ flex: 1 }}>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
        <AppText semibold>{value}</AppText>
      </View>
      <PressableScale onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Change ${label.toLowerCase()}`}>
        <AppText variant="small" tone="primary" bold>
          Change
        </AppText>
      </PressableScale>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <AppText tone="secondary">{label}</AppText>
      <AppText bold>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  applianceTile: { borderRadius: radius.control, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  applianceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySubtle },
  tick: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  selectedCard: { borderColor: colors.primary, borderWidth: 2 },
  locateRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryBorder },
  charge: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primarySubtle, borderColor: colors.primaryBorder },
});
