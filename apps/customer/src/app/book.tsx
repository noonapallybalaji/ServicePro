import {
  getListMyBookingsQueryKey,
  isApiError,
  useBookServiceOnline,
  useCheckServiceability,
  useGetActiveCatalog,
  useGetMyAccount,
  useRequestBookingCode,
  type OnlineBookingResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { AppText, Button, Card, Chip, CodeInput, Field, Input, Ionicons, Notice, SectionTitle } from '@/components/ui';
import { applianceIcon, appliancePhoto } from '@/lib/appliances';
import { config } from '@/lib/config';
import { formatINR, mobileDigits, prettyPhone } from '@/lib/format';
import { useServiceArea } from '@/lib/service-pincode';
import { signInWith, useCustomer } from '@/lib/session';
import { colors, radius, space } from '@/lib/theme';

/*
 * Booking a repair, on one screen like the website's confirm step: the appliance, an optional note,
 * where (a saved address or a new one checked against the PIN codes we serve) and who to call. No
 * time: the office calls to agree the visit. A customer who isn't signed in proves their number with
 * a code as they confirm, and the booking signs them in.
 */

const PINCODE = /^[1-9]\d{5}$/;

/** One id per booking attempt: a double tap or a retry returns the same booking. */
const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function BookScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const queryClient = useQueryClient();
  const catalog = useGetActiveCatalog();
  const area = useServiceArea();
  const { customer } = useCustomer();
  const account = useGetMyAccount({ query: { enabled: customer !== null } });
  const saved = customer ? (account.data?.addresses ?? []) : [];

  const [categoryId, setCategoryId] = useState(params.category ?? '');
  const [problem, setProblem] = useState('');
  const [addressChoice, setAddressChoice] = useState<string | null>(null); // a saved address id, or 'new'
  const [pincode, setPincode] = useState(area?.pincode ?? '');
  const [locality, setLocality] = useState(area?.place ?? '');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const [touched, setTouched] = useState(false);
  const [booked, setBooked] = useState<OnlineBookingResponse | null>(null);
  const [requestId] = useState(newRequestId);
  const submitting = useRef(false);

  const requestCode = useRequestBookingCode({ mutation: { meta: { silent: true } } });
  const book = useBookServiceOnline({ mutation: { meta: { silent: true } } });

  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const category = categories.find((c) => c.id === categoryId);
  const savedChoice = addressChoice ?? saved.find((a) => a.isDefault)?.id ?? saved[0]?.id ?? 'new';
  const usingSaved = customer !== null && savedChoice !== 'new' && saved.some((a) => a.id === savedChoice);

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

  function confirm() {
    if (!category || submitting.current) return;
    submitting.current = true;
    book.mutate(
      {
        data: {
          categoryId: category.id,
          issueTypeId: null,
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
            latitude: null,
            longitude: null,
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
    setTouched(true);
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
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
          </View>
          <AppText variant="title" center>
            Booking confirmed
          </AppText>
          <AppText tone="secondary" center>
            Your request number is <AppText bold>{booked.srNumber}</AppText>. We'll call you shortly to fix a time for the visit.
          </AppText>
        </Card>
        <Button label="View booking" icon="receipt" onPress={() => router.replace(`/booking/${booked.serviceRequestId}`)} />
        <Button label="Back to home" variant="outline" onPress={() => router.dismissTo('/')} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        {/* 1. The appliance */}
        <View>
          <SectionTitle>What needs repair?</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.map((c) => {
              const selected = c.id === categoryId;
              const photo = appliancePhoto(c.code);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${c.name}, visit ${formatINR(c.baseVisitCharge)}`}
                  onPress={() => setCategoryId(c.id)}
                  style={{
                    width: '31%',
                    borderRadius: radius.control,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySubtle : colors.surface,
                    overflow: 'hidden',
                  }}
                >
                  {photo ? (
                    <Image source={photo} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySubtle }}>
                      <Ionicons name={applianceIcon(c.code)} size={26} color={colors.primary} />
                    </View>
                  )}
                  <AppText variant="caption" bold center numberOfLines={1} style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
                    {c.name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {catalog.isPending ? <AppText tone="muted">Loading…</AppText> : null}
          {touched && !category ? (
            <AppText variant="small" tone="error" style={{ marginTop: space.sm }}>
              Choose the appliance.
            </AppText>
          ) : null}
        </View>

        <Field label="What's the problem?" optional hint="For example: not cooling, water leaking, error E4. Or leave it: the technician checks.">
          <Input value={problem} onChangeText={setProblem} multiline maxLength={500} placeholder="Describe the problem" />
        </Field>

        {/* 2. Where */}
        <View style={{ gap: space.md }}>
          <SectionTitle>Visit address</SectionTitle>
          {saved.length > 0 ? (
            <View style={{ gap: space.sm }}>
              {saved.map((a) => (
                <Card key={a.id} onPress={() => setAddressChoice(a.id)} accessibilityLabel={`${a.label}: ${a.line1}, ${a.locality}`} style={savedChoice === a.id ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                  <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                    <Ionicons name={savedChoice === a.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <AppText bold>{a.label}</AppText>
                      <AppText variant="small" tone="secondary">
                        {[a.line1, a.line2, a.locality, a.pincode].filter(Boolean).join(', ')}
                      </AppText>
                    </View>
                  </View>
                </Card>
              ))}
              <Chip label="A different address" icon="add" selected={savedChoice === 'new'} onPress={() => setAddressChoice('new')} />
            </View>
          ) : null}

          {!usingSaved ? (
            <View style={{ gap: space.md }}>
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
                <Input value={line1} onChangeText={setLine1} maxLength={120} placeholder="Flat 302" autoComplete="street-address" />
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

        {/* 3. Who */}
        <View style={{ gap: space.md }}>
          <SectionTitle>Your details</SectionTitle>
          {customer ? (
            <Card>
              <AppText bold>{customer.fullName}</AppText>
              <AppText variant="small" tone="secondary">
                {prettyPhone(customer.phone)}
              </AppText>
            </Card>
          ) : (
            <>
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
            </>
          )}
        </View>

        {category ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primarySubtle, borderColor: colors.primaryBorder }}>
            <Ionicons name="cash" size={22} color={colors.primarySubtleText} />
            <View style={{ flex: 1 }}>
              <AppText bold>Visiting charge {formatINR(category.baseVisitCharge)}</AppText>
              <AppText variant="small" tone="secondary">
                Pay after the visit. The technician gives you an estimate before any repair.
              </AppText>
            </View>
          </Card>
        ) : null}

        {sendError && !sendError.fieldError('phone') ? <Notice tone="error" title={sendError.message} /> : null}
        {bookError ? <Notice tone="error" title={bookError.message} /> : null}
        {book.isError && !bookError ? <Notice tone="error" title="Couldn't book right now" description="Check your connection and try again." /> : null}

        {codeOpen && sentTo ? (
          <Field label={`Code sent to ${prettyPhone(sentTo.phone)}`} hint={sentTo.developmentCode ? `Test code: ${sentTo.developmentCode}` : 'It can take a few seconds to arrive.'}>
            <CodeInput length={sentTo.length} value={code} onChange={setCode} />
          </Field>
        ) : null}

        <Button
          label={customer || codeOpen ? 'Confirm booking' : 'Send code and book'}
          icon={customer || codeOpen ? 'checkmark' : 'chatbox-ellipses'}
          onPress={submit}
          loading={requestCode.isPending || book.isPending}
          disabled={codeOpen && code.length !== sentTo?.length}
        />
        <AppText variant="caption" tone="muted" center>
          By booking you agree to the Pakka Fix terms, privacy and cancellation policies.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
