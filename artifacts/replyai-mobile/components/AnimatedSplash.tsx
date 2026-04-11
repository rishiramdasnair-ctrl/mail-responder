import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withDelay,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";

const LOGO_W = 184;
const LOGO_H = 160;
const FLY_DISTANCE = 130;
const FLY_DURATION = 450;
const FADE_DURATION = 370;
const MAX_STAGGER = 120;

type BarDef = {
  left: number;
  top: number;
  w: number;
  h: number;
  dir: "left" | "right";
  staggerMs: number;
  tyOffset: number;
};

const BARS: BarDef[] = [
  { left: -4,  top: 24, w: 8, h: 98, dir: "left",  staggerMs: 120, tyOffset: -16 },
  { left: 12,  top: 40, w: 8, h: 98, dir: "left",  staggerMs: 105, tyOffset:  -8 },
  { left: 35,  top: 83, w: 4, h: 66, dir: "left",  staggerMs:  90, tyOffset:   0 },
  { left: 44,  top: 34, w: 4, h: 47, dir: "left",  staggerMs:  75, tyOffset:   8 },
  { left: 51,  top: 81, w: 4, h: 74, dir: "left",  staggerMs:  60, tyOffset:  16 },
  { left: 61,  top: 18, w: 4, h: 62, dir: "left",  staggerMs:  45, tyOffset:   8 },
  { left: 68,  top: 78, w: 4, h: 78, dir: "left",  staggerMs:  30, tyOffset:   0 },
  { left: 78,  top:  6, w: 4, h: 70, dir: "left",  staggerMs:  15, tyOffset:  -8 },
  { left: 84,  top: 74, w: 4, h: 81, dir: "left",  staggerMs:   0, tyOffset: -16 },
  { left: 92,  top:  1, w: 4, h: 72, dir: "right", staggerMs:   0, tyOffset: -16 },
  { left: 100, top: 70, w: 4, h: 80, dir: "right", staggerMs:  15, tyOffset:  -8 },
  { left: 110, top:  0, w: 4, h: 69, dir: "right", staggerMs:  30, tyOffset:   0 },
  { left: 117, top: 67, w: 4, h: 76, dir: "right", staggerMs:  45, tyOffset:   8 },
  { left: 126, top:  1, w: 4, h: 65, dir: "right", staggerMs:  60, tyOffset:  16 },
  { left: 133, top: 64, w: 4, h: 57, dir: "right", staggerMs:  75, tyOffset:   8 },
  { left: 142, top:  8, w: 4, h: 56, dir: "right", staggerMs:  90, tyOffset:   0 },
  { left: 156, top: 18, w: 8, h: 98, dir: "right", staggerMs: 105, tyOffset:  -8 },
  { left: 172, top: 35, w: 8, h: 98, dir: "right", staggerMs: 120, tyOffset: -16 },
];

type BarViewProps = {
  def: BarDef;
  trigger: Animated.SharedValue<number>;
};

function BarView({ def, trigger }: BarViewProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);

  const targetTx = def.dir === "left" ? -FLY_DISTANCE : FLY_DISTANCE;
  const easing = Easing.out(Easing.cubic);
  const fadeEasing = Easing.out(Easing.quad);

  useAnimatedReaction(
    () => trigger.value,
    (val) => {
      "worklet";
      if (val === 1) {
        tx.value = withDelay(def.staggerMs, withTiming(targetTx, { duration: FLY_DURATION, easing }));
        ty.value = withDelay(def.staggerMs, withTiming(def.tyOffset, { duration: FLY_DURATION, easing }));
        opacity.value = withDelay(def.staggerMs, withTiming(0, { duration: FADE_DURATION, easing: fadeEasing }));
      }
    }
  );

  const style = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { rotate: `${tx.value * 0.09}deg` },
      ],
      opacity: opacity.value,
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

export default function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
  const trigger = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    trigger.value = 1;

    const totalMs = MAX_STAGGER + FLY_DURATION + 80;
    const t = setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        "worklet";
        if (finished) runOnJS(onComplete)();
      });
    }, totalMs);

    return () => clearTimeout(t);
  }, []);

  const overlayStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: overlayOpacity.value };
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlay, overlayStyle]}
      pointerEvents="none"
    >
      <View style={styles.logoContainer}>
        {BARS.map((bar, i) => (
          <BarView key={i} def={bar} trigger={trigger} />
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
