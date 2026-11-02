import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '@/lib/theme';

/*
 * Motion: short, purposeful animations that follow the platform's feel. Things enter with a small
 * rise and fade (staggered in lists), buttons press in, loading shows a soft pulse. Reanimated runs
 * them on the UI thread, so they stay smooth on budget phones.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A light tap on the phone's vibration motor for meaningful actions (select, confirm). */
export const tap = () => void Haptics.selectionAsync().catch(() => undefined);
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

/** Pressable that scales down slightly while pressed. */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic,
  onPress,
  ...props
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: boolean; children: ReactNode }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.set(withSpring(scaleTo, { damping: 18, stiffness: 400 }));
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        props.onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic) tap();
        onPress?.(event);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Rises and fades in; pass the item's index for a staggered list. */
export function Appear({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(380).easing(Easing.out(Easing.cubic))} style={style}>
      {children}
    </Animated.View>
  );
}

/** A grey placeholder that pulses while content loads. */
export function Skeleton({ width = '100%', height = 16, round, style }: { width?: number | `${number}%`; height?: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.45, 0.9]) }));
  return <Animated.View style={[{ width, height, borderRadius: round ? radius.pill : radius.sm, backgroundColor: colors.sunken }, animated, style]} />;
}

/** The big tick after a booking: pops in, then the ring settles. */
export function SuccessMark({ size = 96 }: { size?: number }) {
  const scale = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    scale.set(withSequence(withSpring(1.12, { damping: 8 }), withSpring(1, { damping: 12 })));
    ring.set(withDelay(150, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
    success();
  }, [scale, ring]);
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 1 - ring.value, transform: [{ scale: 1 + ring.value * 0.6 }] }));
  return (
    <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: colors.successSubtle }, halo]} />
      <Animated.View
        style={[{ width: size * 0.72, height: size * 0.72, borderRadius: size, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }, dot]}
      >
        <Animated.Text style={{ color: '#ffffff', fontSize: size * 0.36, fontWeight: '900' }}>✓</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

/** A progress bar that glides to its value. */
export function ProgressBar({ value, color = colors.accent }: { value: number; color?: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.set(withTiming(Math.max(0, Math.min(1, value)), { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, [value, width]);
  const animated = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <Animated.View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.sunken, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: radius.pill, backgroundColor: color }, animated]} />
    </Animated.View>
  );
}

/** A soft pulsing dot (live status). */
export function LiveDot({ color = colors.success }: { color?: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.ease) }), -1, false));
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 1 - pulse.value, transform: [{ scale: 1 + pulse.value * 1.6 }] }));
  return (
    <Animated.View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color }, halo]} />
      <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </Animated.View>
  );
}

export { Animated };
