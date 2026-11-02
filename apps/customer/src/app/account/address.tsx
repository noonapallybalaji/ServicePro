import {
  getGetMyAccountQueryKey,
  isApiError,
  useAddMyAddress,
  useCheckServiceability,
  useGetMyAccount,
  useUpdateMyAddress,
  type AccountAddressResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Skeleton, success } from '@/components/motion';
import { AppText, BottomBar, Button, Chip, Field, Input, Notice } from '@/components/ui';
import { config } from '@/lib/config';
import { colors, space } from '@/lib/theme';

const LABELS = ['Home', 'Work', 'Other'] as const;
const PINCODE = /^[1-9]\d{5}$/;

/** Add a saved address, or edit one (?id=). The PIN code is checked against the areas we serve. */
export default function AddressFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const account = useGetMyAccount();
  const existing = account.data?.addresses.find((a) => a.id === id);
  if (id && !account.data) {
    return (
      <View style={{ padding: space.lg, gap: space.lg }}>
        <Skeleton height={60} />
        <Skeleton height={60} />
      </View>
    );
  }
  return <AddressForm id={id} existing={existing} />;
}

function AddressForm({ id, existing }: { id?: string; existing?: AccountAddressResponse }) {
  const queryClient = useQueryClient();
  const add = useAddMyAddress({ mutation: { meta: { silent: true } } });
  const update = useUpdateMyAddress({ mutation: { meta: { silent: true } } });
  const [label, setLabel] = useState<string>(existing?.label ?? 'Home');
  const [line1, setLine1] = useState(existing?.line1 ?? '');
  const [line2, setLine2] = useState(existing?.line2 ?? '');
  const [landmark, setLandmark] = useState(existing?.landmark ?? '');
  const [pincode, setPincode] = useState(existing?.pincode ?? '');
  const [locality, setLocality] = useState(existing?.locality ?? '');
  const [makeDefault, setMakeDefault] = useState(existing?.isDefault ?? false);
  const [touched, setTouched] = useState(false);

  const pinOk = PINCODE.test(pincode);
  const check = useCheckServiceability(pincode, { query: { enabled: pinOk, staleTime: 5 * 60_000 } });
  const places = check.data ? [...new Set([...check.data.localities, ...check.data.areas])] : [];
  const place = locality.trim() || places[0] || '';
  const ok = line1.trim() !== '' && pinOk && place !== '';
  const error = isApiError(add.error) ? add.error : isApiError(update.error) ? update.error : null;

  function save() {
    setTouched(true);
    if (!ok) return;
    const data = {
      label,
      line1: line1.trim(),
      line2: line2.trim() || null,
      landmark: landmark.trim() || null,
      locality: place,
      city: existing?.city ?? config.city,
      pincode,
      makeDefault,
    };
    const done = {
      onSuccess: () => {
        success();
        void queryClient.invalidateQueries({ queryKey: getGetMyAccountQueryKey() });
        router.back();
      },
    };
    if (id) update.mutate({ addressId: id, data }, done);
    else add.mutate({ data }, done);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: id ? 'Edit address' : 'New address' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.sm }}>
          <AppText variant="small" semibold>
            Save as
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {LABELS.map((l) => (
              <Chip key={l} label={l} icon={l === 'Home' ? 'home' : l === 'Work' ? 'briefcase' : 'location'} selected={label === l} onPress={() => setLabel(l)} />
            ))}
          </View>
        </View>
        <Field label="PIN code" error={touched && !pinOk ? 'Enter the 6-digit PIN code.' : check.data && !check.data.isServiceable ? "We don't serve this PIN code yet." : undefined}>
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
        <Chip label="Use as my default address" icon="star-outline" selected={makeDefault} onPress={() => setMakeDefault(!makeDefault)} />
        {error ? <Notice tone="error" title={error.message} /> : null}
      </ScrollView>
      <BottomBar>
        <Button label="Save address" onPress={save} loading={add.isPending || update.isPending} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
