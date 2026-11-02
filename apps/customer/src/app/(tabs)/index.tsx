import { useGetActiveCatalog } from '@servicepro/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AreaPicker } from '@/components/area-picker';
import { AppText, Button, Card, Ionicons, Notice, SectionTitle } from '@/components/ui';
import { applianceIcon, appliancePhoto } from '@/lib/appliances';
import { callSupport, formatINR, whatsappSupport } from '@/lib/format';
import { useServiceArea } from '@/lib/service-pincode';
import { colors, radius, space } from '@/lib/theme';

const PROMISES = [
  { icon: 'shield-checkmark' as const, text: 'Verified, trained technicians' },
  { icon: 'pricetag' as const, text: 'Fixed visiting charge, estimate before any repair' },
  { icon: 'ribbon' as const, text: 'Warranty on every repair' },
];

export default function HomeScreen() {
  const catalog = useGetActiveCatalog();
  const area = useServiceArea();
  const [picking, setPicking] = useState(false);
  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const lowestVisit = categories.length > 0 ? Math.min(...categories.map((c) => c.baseVisitCharge)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.navy950 }}>
        <View style={styles.header}>
          <Image source={require('../../../assets/logo-light.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Pakka Fix" />
          <Pressable accessibilityRole="button" accessibilityLabel="Change service area" onPress={() => setPicking(true)} style={styles.areaChip}>
            <Ionicons name="location" size={15} color={colors.accent} />
            <AppText variant="small" tone="inverse" bold numberOfLines={1} style={{ maxWidth: 150 }}>
              {area ? area.place || area.pincode : 'Set location'}
            </AppText>
            <Ionicons name="chevron-down" size={14} color="#ffffff" />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={catalog.isRefetching} onRefresh={() => void catalog.refetch()} />}
      >
        <ImageBackground source={require('../../../assets/banner.jpg')} style={styles.banner} imageStyle={{ borderRadius: radius.card }} resizeMode="cover">
          <View style={styles.bannerShade}>
            <AppText variant="title" tone="inverse">
              Appliance repair at your doorstep
            </AppText>
            <AppText tone="inverse" style={{ opacity: 0.9 }}>
              {lowestVisit !== null ? `Visit from ${formatINR(lowestVisit)}, adjusted in your final bill.` : 'Trained technicians, honest prices.'}
            </AppText>
            <Button label="Book a repair" variant="accent" icon="construct" onPress={() => router.push('/book')} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
          </View>
        </ImageBackground>

        <View>
          <SectionTitle>What needs repair?</SectionTitle>
          {catalog.isError ? (
            <Notice tone="error" title="Couldn't load the services" description="Check your connection." action={<Button small variant="outline" label="Try again" onPress={() => void catalog.refetch()} />} />
          ) : null}
          <View style={styles.grid}>
            {categories.map((category) => {
              const photo = appliancePhoto(category.code);
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.name} repair, visit ${formatINR(category.baseVisitCharge)}`}
                  onPress={() => router.push({ pathname: '/book', params: { category: category.id } })}
                  style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
                >
                  {photo ? (
                    <Image source={photo} style={styles.tilePhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.tilePhoto, styles.tileIcon]}>
                      <Ionicons name={applianceIcon(category.code)} size={34} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ padding: space.md, gap: 2 }}>
                    <AppText bold numberOfLines={1}>
                      {category.name}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      Visit {formatINR(category.baseVisitCharge)}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {catalog.isPending ? (
            <AppText tone="muted" center>
              Loading…
            </AppText>
          ) : null}
        </View>

        <Card style={{ gap: space.md }}>
          <AppText variant="h3">Why Pakka Fix</AppText>
          {PROMISES.map((promise) => (
            <View key={promise.text} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <Ionicons name={promise.icon} size={20} color={colors.success} />
              <AppText variant="small" tone="secondary" style={{ flex: 1 }}>
                {promise.text}
              </AppText>
            </View>
          ))}
        </Card>

        <Card style={{ gap: space.md, backgroundColor: colors.accentSubtle, borderColor: '#ffd2a3' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Ionicons name="cog" size={20} color={colors.accentSubtleText} />
            <AppText variant="h3">Spare parts shop</AppText>
          </View>
          <AppText variant="small" tone="secondary">
            Genuine spares for your appliances. Coming soon.
          </AppText>
        </Card>

        <View style={{ gap: space.sm }}>
          <AppText variant="h3">Need help?</AppText>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button label="Call us" variant="outline" icon="call" onPress={callSupport} style={{ flex: 1 }} />
            <Button label="WhatsApp" variant="outline" icon="logo-whatsapp" onPress={() => whatsappSupport()} style={{ flex: 1 }} />
          </View>
        </View>
      </ScrollView>

      {picking ? <AreaPicker visible current={area} onClose={() => setPicking(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  logo: { width: 124, height: 24 },
  areaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  banner: { minHeight: 210, justifyContent: 'flex-end' },
  bannerShade: { padding: space.lg, gap: space.xs, borderRadius: radius.card, backgroundColor: 'rgba(0,29,63,0.62)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: '47.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tilePhoto: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.sunken },
  tileIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySubtle },
});
