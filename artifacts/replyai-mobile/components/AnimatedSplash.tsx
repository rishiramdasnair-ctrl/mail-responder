import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  makeMutable,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  runOnJS,
  Easing,
  SharedValue,
} from "react-native-reanimated";

const LOGO_W = 184;
const LOGO_H = 160;
const FLY_DISTANCE = 130;
const FLY_DURATION = 400;
const FADE_DURATION = 340;

type BarDef = {
  left: number;
  top: number;
  w: number;
  h: number;
  staggerMs: number;
};

type BarAnim = {
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  opacity: SharedValue<number>;
};

const BARS_LEFT: BarDef[] = [
  { left: -4,  top: 24, w: 8, h: 98, staggerMs: 96 },
  { left: 12,  top: 40, w: 8, h: 98, staggerMs: 84 },
  { left: 35,  top: 83, w: 4, h: 66, staggerMs: 72 },
  { left: 44,  top: 34, w: 4, h: 47, staggerMs: 60 },
  { left: 51,  top: 81, w: 4, h: 74, staggerMs: 48 },
  { left: 61,  top: 18, w: 4, h: 62, staggerMs: 36 },
  { left: 68,  top: 78, w: 4, h: 78, staggerMs: 24 },
  { left: 78,  top:  6, w: 4, h: 70, staggerMs: 12 },
  { left: 84,  top: 74, w: 4, h: 81, staggerMs:  0 },
];

const BARS_RIGHT: BarDef[] = [
  { left: 92,  top:  1, w: 4, h: 72, staggerMs:  0 },
  { left: 100, top: 70, w: 4, h: 80, staggerMs: 12 },
  { left: 110, top:  0, w: 4, h: 69, staggerMs: 24 },
  { left: 117, top: 67, w: 4, h: 76, staggerMs: 36 },
  { left: 126, top:  1, w: 4, h: 65, staggerMs: 48 },
  { left: 133, top: 64, w: 4, h: 57, staggerMs: 60 },
  { left: 142, top:  8, w: 4, h: 56, staggerMs: 72 },
  { left: 156, top: 18, w: 8, h: 98, staggerMs: 84 },
  { left: 172, top: 35, w: 8, h: 98, staggerMs: 96 },
];

function BarView({ def, anim }: { def: BarDef; anim: BarAnim }) {
  const style = useAnimatedStyle(() => {
    const rot = anim.tx.value * 0.09;
    return {
      transform: [
        { translateX: anim.tx.value },
        { translateY: anim.ty.value },
        { rotate: `${rot}deg` },
      ],
      opacity: anim.opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: def.left,
          top: def.top,
          width: def.w,
          height: def.h,
          borderRadius: def.w / 2,
          backgroundColor: "#000000",
        },
        style,
      ]}
    />
  );
}

function makeBarAnims(count: number): BarAnim[] {
  return Array.from({ length: count }, () => ({
    tx: makeMutable(0),
    ty: makeMutable(0),
    opacity: makeMutable(1),
  }));
}

const TY_OFFSETS = [-16, -8, 0, 8, 16, 8, 0, -8, -16];
const MAX_STAGGER = 96;

export default function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
  const overlayOpacity = useSharedValue(1);
  const leftAnims = useRef(makeBarAnims(BARS_LEFT.length)).current;
  const rightAnims = useRef(makeBarAnims(BARS_RIGHT.length)).current;

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    const fadeEasing = Easing.out(Easing.quad);

    BARS_LEFT.forEach((bar, i) => {
      const a = leftAnims[i];
      a.tx.value = withDelay(bar.staggerMs, withTiming(-FLY_DISTANCE, { duration: FLY_DURATION, easing }));
      a.ty.value = withDelay(bar.staggerMs, withTiming(TY_OFFSETS[i], { duration: FLY_DURATION, easing }));
      a.opacity.value = withDelay(bar.staggerMs, withTiming(0, { duration: FADE_DURATION, easing: fadeEasing }));
    });

    BARS_RIGHT.forEach((bar, i) => {
      const a = rightAnims[i];
      a.tx.value = withDelay(bar.staggerMs, withTiming(FLY_DISTANCE, { duration: FLY_DURATION, easing }));
      a.ty.value = withDelay(bar.staggerMs, withTiming(TY_OFFSETS[i], { duration: FLY_DURATION, easing }));
      a.opacity.value = withDelay(bar.staggerMs, withTiming(0, { duration: FADE_DURATION, easing: fadeEasing }));
    });

    const totalMs = MAX_STAGGER + FLY_DURATION + 60;
    const t = setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(onComplete)();
      });
    }, totalMs);

    return () => clearTimeout(t);
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlay, overlayStyle]}
      pointerEvents="none"
    >
      <View style={styles.logoContainer}>
        {BARS_LEFT.map((bar, i) => (
          <BarView key={`l${i}`} def={bar} anim={leftAnims[i]} />
        ))}
        {BARS_RIGHT.map((bar, i) => (
          <BarView key={`r${i}`} def={bar} anim={rightAnims[i]} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  logoContainer: {
    width: LOGO_W,
    height: LOGO_H,
  },
});
