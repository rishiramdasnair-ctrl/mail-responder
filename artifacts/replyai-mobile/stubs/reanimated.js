"use strict";
// Web stub for react-native-reanimated — no-op shim, no native worklet runtime needed
const { Animated, Easing } = require("react-native");

exports.useSharedValue = (init) => ({ value: init });
exports.useAnimatedStyle = (fn) => { try { return fn(); } catch { return {}; } };
exports.useAnimatedProps = (fn) => { try { return fn(); } catch { return {}; } };
exports.useAnimatedRef = () => ({ current: null });
exports.useAnimatedScrollHandler = () => () => {};
exports.useAnimatedGestureHandler = () => ({});
exports.useAnimatedReaction = () => {};
exports.useDerivedValue = (fn) => ({ value: (() => { try { return fn(); } catch { return undefined; } })() });
exports.useAnimatedSensor = () => ({ sensor: { value: {} }, unregister: () => {} });
exports.useScrollViewOffset = () => ({ value: 0 });
exports.useAnimatedKeyboard = () => ({ height: { value: 0 }, state: { value: 0 } });
exports.useReducedMotion = () => false;
exports.useFrameCallback = () => {};
exports.useWorkletCallback = (fn) => fn;
exports.createWorklet = (fn) => fn;

exports.withTiming = (toValue, _config, cb) => { if (cb) setTimeout(() => cb(true, true), 300); return toValue; };
exports.withSpring = (toValue, _config, cb) => { if (cb) setTimeout(() => cb(true, true), 300); return toValue; };
exports.withDecay = (_config, cb) => { if (cb) setTimeout(() => cb(true, true), 300); return 0; };
exports.withDelay = (_delay, animation) => animation;
exports.withRepeat = (animation) => animation;
exports.withSequence = (...animations) => animations[animations.length - 1];
exports.withClamp = (_config, animation) => animation;

exports.cancelAnimation = () => {};
exports.runOnJS = (fn) => fn;
exports.runOnUI = (fn) => fn;
exports.makeMutable = (init) => ({ value: init });
exports.makeShareableCloneRecursive = (v) => v;

exports.interpolate = (value, inputRange, outputRange) => {
  const len = inputRange.length;
  if (value <= inputRange[0]) return outputRange[0];
  if (value >= inputRange[len - 1]) return outputRange[len - 1];
  for (let i = 1; i < len; i++) {
    if (value < inputRange[i]) {
      const t = (value - inputRange[i - 1]) / (inputRange[i] - inputRange[i - 1]);
      return outputRange[i - 1] + t * (outputRange[i] - outputRange[i - 1]);
    }
  }
  return outputRange[len - 1];
};
exports.interpolateColor = (_value, _inputRange, outputRange) => outputRange[0];
exports.Extrapolation = { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" };

exports.Animated = Animated;
exports.Easing = Easing;
exports.createAnimatedComponent = (Component) => Component;

exports.FadeIn = {};
exports.FadeOut = {};
exports.FadeInUp = {};
exports.FadeInDown = {};
exports.FadeOutUp = {};
exports.FadeOutDown = {};
exports.SlideInLeft = {};
exports.SlideInRight = {};
exports.SlideOutLeft = {};
exports.SlideOutRight = {};
exports.ZoomIn = {};
exports.ZoomOut = {};
exports.LinearTransition = {};
exports.Layout = {};
exports.Keyframe = class {};
exports.SharedTransition = { custom: () => ({}) };
exports.ReduceMotion = { Never: "never", Always: "always", System: "system" };
