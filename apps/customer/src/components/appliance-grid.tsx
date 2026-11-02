import type { CategoryResponse } from '@servicepro/api-client';
import { router } from 'expo-router';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Appear, PressableScale, Skeleton } from '@/components/motion';
import { AppText, Ionicons } from '@/components/ui';
import { applianceIcon, appliancePhoto } from '@/lib/appliances';
import { formatINR } from '@/lib/format';
import { colors, radius, shadow, space } from '@/lib/theme';

/** Two appliance tiles per row, sized in points (percent widths don't size images reliably on Android). */
export function ApplianceGrid({ categories, loading }: { categories: CategoryResponse[]; loading?: boolean }) {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - space.lg * 2 - space.md) / 2);
  const photoHeight = Math.round(tile * 0.68);

  if (loading) {
    return (
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.tile, { width: tile }]}>
            <Skeleton width={tile} height={photoHeight} style={{ borderRadius: 0 }} />
            <View style={{ padding: space.md, gap: 6 }}>
              <Skeleton width="70%" height={14} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {categories.map((category, i) => {
        const photo = appliancePhoto(category.code);
        return (
          <Appear key={category.id} index={i}>
            <PressableScale
              haptic
              accessibilityRole="button"
              accessibilityLabel={`${category.name} repair, visit ${formatINR(category.baseVisitCharge)}`}
              onPress={() => router.push({ pathname: '/book', params: { category: category.id } })}
              style={[styles.tile, shadow.card, { width: tile }]}
            >
              {photo ? (
                <Image source={photo} style={{ width: tile, height: photoHeight }} resizeMode="cover" />
              ) : (
                <View style={{ width: tile, height: photoHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySubtle }}>
                  <Ionicons name={applianceIcon(category.code)} size={40} color={colors.primary} />
                </View>
              )}
              <View style={{ padding: space.md, gap: 2 }}>
                <AppText bold numberOfLines={1}>
                  {category.name}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="caption" tone="muted">
                    Visit {formatINR(category.baseVisitCharge)}
                  </AppText>
                  <Ionicons name="arrow-forward-circle" size={20} color={colors.accent} />
                </View>
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
  tile: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
