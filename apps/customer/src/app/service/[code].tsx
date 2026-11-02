import { useGetActiveCatalog } from '@servicepro/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Appear, PressableScale, Skeleton } from '@/components/motion';
import { AppText, BottomBar, Button, IconCircle, Ionicons } from '@/components/ui';
import { applianceCutout, applianceIcon } from '@/lib/appliances';
import { formatINR } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

/*
 * One appliance's page: its picture, the visiting charge and what's included, then the common
 * repairs, each with its typical time and a Book button that starts the booking with it chosen.
 */

const INCLUDED = [
  { icon: 'shield-checkmark' as const, text: 'Verified, trained technician' },
  { icon: 'document-text' as const, text: 'Estimate before any repair' },
  { icon: 'ribbon' as const, text: 'Warranty on the repair' },
];

export default function ServiceScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const catalog = useGetActiveCatalog();
  const category = catalog.data?.find((c) => c.code === code);
  const issues = (category?.issueTypes ?? []).filter((i) => i.isActive);
  const cutout = applianceCutout(code);

  if (!category) {
    return (
      <View style={{ padding: space.lg, gap: space.lg }}>
        <Skeleton height={160} style={{ borderRadius: radius.sheet }} />
        <Skeleton height={28} width="60%" />
        <Skeleton height={90} style={{ borderRadius: radius.card }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }}>
        <Animated.View entering={ZoomIn.duration(320)} style={styles.art}>
          {cutout ? <Image source={cutout} style={{ width: '70%', height: '80%' }} resizeMode="contain" /> : <Ionicons name={applianceIcon(code)} size={64} color={colors.primary} />}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(360)} style={{ gap: space.sm }}>
          <AppText variant="display">{category.name} Service & Repair</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name="star" size={16} color={colors.accent} />
            <AppText semibold>Trusted by Hyderabad homes</AppText>
          </View>
          <View style={styles.priceRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" tone="muted">
                VISITING CHARGE
              </AppText>
              <AppText variant="title">{formatINR(category.baseVisitCharge)}</AppText>
            </View>
            <AppText variant="small" tone="secondary" style={{ flex: 1.4 }}>
              Adjusted in your final bill if you go ahead with the repair.
            </AppText>
          </View>
        </Animated.View>

        <View style={{ gap: space.sm }}>
          {INCLUDED.map((item, i) => (
            <Appear key={item.text} index={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <IconCircle name={item.icon} size={34} tone="success" />
              <AppText tone="secondary">{item.text}</AppText>
            </Appear>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={{ gap: space.md }}>
          <AppText variant="title">Services</AppText>
          {issues.length === 0 ? (
            <AppText tone="secondary">The technician checks the appliance and gives you an estimate before any repair.</AppText>
          ) : null}
          {issues.map((issue, i) => (
            <Appear key={issue.id} index={i}>
              <View style={[styles.service, i < issues.length - 1 && styles.serviceDivider]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="h3">{issue.name}</AppText>
                  <AppText variant="small" tone="secondary">
                    Diagnosis and repair at home, with an estimate first.
                  </AppText>
                  <AppText semibold style={{ marginTop: 4 }}>
                    Starting at {formatINR(category.baseVisitCharge)}
                    <AppText tone="muted"> · ~{issue.typicalDurationMinutes} mins</AppText>
                  </AppText>
                </View>
                <PressableScale
                  haptic
                  onPress={() => router.push({ pathname: '/book', params: { category: category.id, issue: issue.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Book ${issue.name}`}
                  style={styles.bookPill}
                >
                  <AppText tone="inverse" bold>
                    Book
                  </AppText>
                </PressableScale>
              </View>
            </Appear>
          ))}
        </View>
      </ScrollView>
      <BottomBar>
        <Button label={`Book ${category.name} repair`} variant="accent" trailingIcon="arrow-forward" onPress={() => router.push({ pathname: '/book', params: { category: category.id } })} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  art: { height: 180, borderRadius: radius.sheet, backgroundColor: '#eef1f6', alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm, padding: space.md, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  divider: { height: 1, backgroundColor: colors.border },
  service: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  serviceDivider: { borderBottomWidth: 1, borderBottomColor: colors.border, borderStyle: 'dashed' },
  bookPill: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: colors.primary },
});
