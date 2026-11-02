import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Appear, PressableScale } from '@/components/motion';
import { AppText, Button, Ionicons, type IconName } from '@/components/ui';
import { colors, radius, space } from '@/lib/theme';

/*
 * First launch: three short slides about what Pakka Fix does, then the service area. Swipe or tap
 * Next; Skip goes straight to the area. Shown once per phone.
 */

const SLIDES: { key: string; image?: ReturnType<typeof require>; icon?: IconName; title: string; text: string }[] = [
  {
    key: 'repair',
    image: require('../../assets/banner.jpg'),
    title: 'Appliance repair at your doorstep',
    text: 'AC, refrigerator, washing machine, TV, microwave and more, fixed at home by trained technicians.',
  },
  {
    key: 'price',
    icon: 'pricetags',
    title: 'Honest, upfront prices',
    text: 'A fixed visiting charge, and an estimate you approve before any repair starts. No surprises.',
  },
  {
    key: 'track',
    icon: 'navigate',
    title: 'Track every step',
    text: 'See your technician on the way, approve estimates, pay and get your invoice, all in the app.',
  },
];

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const list = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const onViewable = useCallback(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }, []);
  const next = () => (last ? router.replace('/location?first=1') : list.current?.scrollToIndex({ index: index + 1, animated: true }));

  return (
    <LinearGradient colors={[colors.navy950, colors.navy800]} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Image source={require('../../assets/logo-light.png')} style={{ width: 120, height: 22 }} resizeMode="contain" accessibilityLabel="Pakka Fix" />
          {!last ? (
            <PressableScale onPress={() => router.replace('/location?first=1')} hitSlop={12} accessibilityRole="button">
              <AppText tone="inverseMuted" bold>
                Skip
              </AppText>
            </PressableScale>
          ) : null}
        </View>

        <FlatList
          ref={list}
          data={SLIDES}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(slide) => slide.key}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index: i }) => (
            <View style={{ width, paddingHorizontal: space.xl, justifyContent: 'center', gap: space.xl }}>
              <View style={[styles.art, { height: width * 0.78 }]}>
                {item.image ? (
                  <Image source={item.image} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                ) : (
                  <View style={styles.iconArt}>
                    <View style={styles.iconRing}>
                      <Ionicons name={item.icon ?? 'construct'} size={72} color={colors.accent} />
                    </View>
                  </View>
                )}
              </View>
              {i === index ? (
                <Appear key={`${item.key}-${index}`} style={{ gap: space.sm }}>
                  <AppText variant="display" tone="inverse">
                    {item.title}
                  </AppText>
                  <AppText tone="inverseMuted">{item.text}</AppText>
                </Appear>
              ) : (
                <View style={{ height: 120 }} />
              )}
            </View>
          )}
        />

        <View style={styles.bottom}>
          <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`}>
            {SLIDES.map((slide, i) => (
              <Dot key={slide.key} active={i === index} />
            ))}
          </View>
          <Button label={last ? 'Get started' : 'Next'} variant="accent" trailingIcon="arrow-forward" onPress={next} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Dot({ active }: { active: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 24 : 8, { duration: 250 }),
    backgroundColor: withTiming(active ? colors.accent : 'rgba(255,255,255,0.35)', { duration: 250 }),
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4 }, style]} />;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.md },
  art: { borderRadius: radius.sheet, overflow: 'hidden' },
  iconArt: { flex: 1, borderRadius: radius.sheet, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  iconRing: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,128,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.lg },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
});
