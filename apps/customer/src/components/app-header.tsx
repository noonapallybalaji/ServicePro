import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/motion';
import { AppText, Ionicons } from '@/components/ui';
import { colors, shadow, space } from '@/lib/theme';

/*
 * The light header used on every pushed screen: a round back button, the title centred, an optional
 * action on the right. Plugged into the stack as its `header`.
 */

interface HeaderProps {
  options: { title?: string; headerRight?: (props: { tintColor?: string; canGoBack: boolean }) => ReactNode };
  back?: unknown;
  navigation: { goBack: () => void };
  route: { name: string };
}

export function AppHeader({ options, back, navigation, route }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const title = options.title ?? route.name;
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.side}>
        {back ? (
          <PressableScale onPress={navigation.goBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={[styles.round, shadow.card]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </PressableScale>
        ) : null}
      </View>
      <AppText variant="h3" numberOfLines={1} center style={{ flex: 1 }}>
        {title}
      </AppText>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{options.headerRight?.({ tintColor: colors.text, canGoBack: !!back })}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.background },
  side: { width: 72 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
});
