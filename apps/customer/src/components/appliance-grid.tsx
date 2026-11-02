import type { CategoryResponse } from '@servicepro/api-client';
import { router } from 'expo-router';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Appear, PressableScale, Skeleton } from '@/components/motion';
import { AppText, Ionicons } from '@/components/ui';
import { applianceCutout, applianceIcon } from '@/lib/appliances';
import { formatINR } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

/*
 * Two appliance tiles per row: a soft tile with the product cut-out and its name, sized in points
 * (percent widths don't size images reliably on Android). A tile opens the appliance's page.
 */
export function ApplianceGrid({ categories, loading }: { categories: CategoryResponse[]; loading?: boolean }) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - space.lg * 2 - space.md) / 2);
  const art = Math.round(tile * 0.52);

  if (loading) {
    return (
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={tile} height={tile} style={{ borderRadius: radius.sheet }} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {categories.map((category, i) => {
        const cutout = applianceCutout(category.code);
        return (
          <Appear key={category.id} index={i}>
            <PressableScale
              haptic
              accessibilityRole="button"
              accessibilityLabel={`${category.name}, visit ${formatINR(category.baseVisitCharge)}`}
              onPress={() => router.push(`/service/${category.code}`)}
              style={[styles.tile, { width: tile, height: tile }]}
            >
              <View style={{ height: art, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                {cutout ? (
                  <Image source={cutout} style={{ width: '78%', height: '100%' }} resizeMode="contain" />
                ) : (
                  <View style={styles.iconArt}>
                    <Ionicons name={applianceIcon(category.code)} size={34} color={colors.primary} />
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <AppText bold center numberOfLines={2}>
                  {category.name}
                </AppText>
                <AppText variant="caption" tone="muted" center>
                  From {formatINR(category.baseVisitCharge)}
                </AppText>
              </View>
            </PressableScale>
          </Appear>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { backgroundColor: colors.tile, borderRadius: radius.sheet, padding: space.md, alignItems: 'center', justifyContent: 'space-between' },
  iconArt: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
