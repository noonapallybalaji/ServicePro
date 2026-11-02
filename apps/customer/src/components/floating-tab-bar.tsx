import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, tap } from '@/components/motion';
import { AppText, Ionicons, type IconName } from '@/components/ui';
import { colors, fonts, radius, shadow, space } from '@/lib/theme';

/*
 * The floating tab bar: a rounded white pill above the bottom edge. A soft highlight glides to the
 * active tab with a spring; its icon fills in.
 */

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  bookings: ['calendar', 'calendar-outline'],
  help: ['chatbubbles', 'chatbubbles-outline'],
  account: ['person', 'person-outline'],
};

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string; tabBarBadge?: string | number } }>;
  emitter: { emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
  navigateToTab: (routeKey: string) => void;
}

export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const slot = width / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    x.set(withSpring(state.index * slot, { damping: 18, stiffness: 200 }));
  }, [state.index, slot, x]);

  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]} pointerEvents="box-none">
      <View style={[styles.bar, shadow.raised]} onLayout={(event) => setWidth(event.nativeEvent.layout.width - 12)}>
        {width > 0 ? <Animated.View style={[styles.highlight, { width: slot }, highlight]} /> : null}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const [active, inactive] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const label = descriptors[route.key]?.options.title ?? route.name;
          const badge = descriptors[route.key]?.options.tabBarBadge;
          return (
            <PressableScale
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              scaleTo={0.9}
              onPress={() => {
                tap();
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              style={styles.item}
            >
              <View>
                <Ionicons name={focused ? active : inactive} size={22} color={focused ? colors.primary : colors.textMuted} />
                {badge ? <View style={styles.badge} /> : null}
              </View>
              <AppText variant="caption" style={{ fontFamily: focused ? fonts.bold : fonts.medium, color: focused ? colors.primary : colors.textMuted, fontSize: 11 }}>
                {label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  bar: { flexDirection: 'row', padding: 6, borderRadius: radius.sheet, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  highlight: { position: 'absolute', top: 6, bottom: 6, left: 6, borderRadius: radius.card + 2, backgroundColor: colors.primarySubtle },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  badge: { position: 'absolute', top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface },
});

/** Space to leave at the bottom of tab screens so content clears the floating bar. */
export const TAB_BAR_SPACE = 110;
