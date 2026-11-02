import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/motion';
import { AppText, Ionicons } from '@/components/ui';
import { formatINR, whatsappSupport } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

/*
 * The home banners, like the website's carousel: the designed Pakka Fix banner as it is (its text
 * is part of the artwork), then two offers drawn in the app (they keep their brand colours in dark mode). Swipe, or let it move on every few
 * seconds; it pauses while the customer is touching it.
 */

const GUTTER = space.lg;

export function BannerCarousel({ lowestVisit }: { lowestVisit: number | null }) {
  const { width } = useWindowDimensions();
  const slideWidth = width - GUTTER * 2;
  const height = Math.round((slideWidth * 492) / 960); // the designed banner's proportions
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const touching = useRef(false);

  const slides = [
    { key: 'hero', render: () => <Image source={require('../../assets/banner.jpg')} style={{ width: slideWidth, height }} resizeMode="cover" /> },
    {
      key: 'visit',
      render: () => (
        <LinearGradient colors={[colors.navy800, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.drawn, { width: slideWidth, height }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="caption" tone="inverseMuted">
              FIXED VISITING CHARGE
            </AppText>
            <AppText variant="title" tone="inverse">
              {lowestVisit !== null ? `Visit from ${formatINR(lowestVisit)}` : 'Honest prices'}
            </AppText>
            <AppText variant="small" tone="inverseMuted">
              Adjusted in your final bill. Estimate before any repair.
            </AppText>
            <View style={styles.pill}>
              <AppText variant="caption" bold style={{ color: colors.accentText }}>
                Book now
              </AppText>
            </View>
          </View>
          <Image source={require('../../assets/appliances/ac.jpg')} style={styles.drawnImage} resizeMode="cover" />
        </LinearGradient>
      ),
      onPress: () => router.push('/book'),
    },
    {
      key: 'warranty',
      render: () => (
        <LinearGradient colors={['#a34300', colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.drawn, { width: slideWidth, height }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="caption" style={{ color: 'rgba(31,15,0,0.75)' }}>
              PEACE OF MIND
            </AppText>
            <AppText variant="title" style={{ color: colors.accentText }}>
              Warranty on every repair
            </AppText>
            <AppText variant="small" style={{ color: 'rgba(31,15,0,0.8)' }}>
              Questions? Chat with us on WhatsApp.
            </AppText>
          </View>
          <View style={styles.badgeCircle}>
            <Ionicons name="ribbon" size={44} color={colors.accent} />
          </View>
        </LinearGradient>
      ),
      onPress: () => whatsappSupport(),
    },
  ];

  // Move on every 4.5 seconds unless the customer is swiping.
  useEffect(() => {
    const timer = setInterval(() => {
      if (touching.current) return;
      const next = (index + 1) % slides.length;
      list.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next); // Android doesn't always report the end of a scroll it didn't start

    }, 4500);
    return () => clearInterval(timer);
  }, [index, slides.length]);

  return (
    <View style={{ gap: space.sm }}>
      <FlatList
        ref={list}
        data={slides}
        horizontal
        snapToInterval={slideWidth + space.md}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.md }}
        keyExtractor={(slide) => slide.key}
        getItemLayout={(_, i) => ({ length: slideWidth + space.md, offset: (slideWidth + space.md) * i, index: i })}
        onScrollBeginDrag={() => (touching.current = true)}
        onScrollEndDrag={() => (touching.current = false)}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / (slideWidth + space.md)))}
        renderItem={({ item }) => (
          <PressableScale scaleTo={0.985} onPress={item.onPress ?? (() => router.push('/book'))} accessibilityRole="button" style={{ borderRadius: radius.card, overflow: 'hidden' }}>
            {item.render()}
          </PressableScale>
        )}
      />
      <View style={styles.dots}>
        {slides.map((slide, i) => (
          <Dot key={slide.key} active={i === index} />
        ))}
      </View>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 18 : 6, { duration: 250 }),
    backgroundColor: withTiming(active ? colors.primary : colors.borderStrong, { duration: 250 }),
  }));
  return <Animated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}

const styles = StyleSheet.create({
  drawn: { borderRadius: radius.card, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, overflow: 'hidden' },
  drawnImage: { width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' },
  pill: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  badgeCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#fff3e6', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
});
