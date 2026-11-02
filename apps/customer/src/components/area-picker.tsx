import { useCheckServiceability } from '@servicepro/api-client';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Chip, Field, Input, Notice } from '@/components/ui';
import { setServiceArea, type ServiceArea } from '@/lib/service-pincode';
import { colors, space } from '@/lib/theme';

const PINCODE = /^[1-9]\d{5}$/;

/** "Where do you need service?": a PIN code, checked against the areas we serve, then the place. */
export function AreaPicker({ visible, current, onClose }: { visible: boolean; current: ServiceArea | null; onClose: () => void }) {
  const [pincode, setPincode] = useState(current?.pincode ?? '');
  const [place, setPlace] = useState(current?.place ?? '');
  const complete = PINCODE.test(pincode);
  const check = useCheckServiceability(pincode, { query: { enabled: complete, staleTime: 5 * 60_000 } });
  const places = check.data ? [...new Set([...check.data.localities, ...check.data.areas])] : [];
  const chosen = place && places.includes(place) ? place : (places[0] ?? '');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg }}>
          <AppText variant="h2">Where do you need service?</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
            <AppText tone="primary" bold>
              Close
            </AppText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Field label="PIN code" hint={complete && check.isPending ? 'Checking…' : 'We serve all of Hyderabad.'}>
            <Input
              icon="location"
              value={pincode}
              onChangeText={(text) => setPincode(text.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="500081"
              autoFocus
            />
          </Field>
          {complete && check.data ? (
            check.data.isServiceable ? (
              <Notice tone="success" title="We work in this area" />
            ) : (
              <Notice tone="warning" title="We don't serve this PIN code yet" description="Check the number, or call us: we may still be able to help." />
            )
          ) : null}
          {complete && check.isError ? <Notice tone="error" title="Couldn't check it right now" description="Check your connection and try again." /> : null}
          {places.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <AppText variant="small" bold>
                Your area
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {places.map((name) => (
                  <Chip key={name} label={name} selected={chosen === name} onPress={() => setPlace(name)} />
                ))}
              </View>
            </View>
          ) : null}
          <Button
            label="Use this area"
            disabled={!check.data?.isServiceable}
            onPress={() => {
              setServiceArea({ pincode, place: chosen });
              onClose();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
