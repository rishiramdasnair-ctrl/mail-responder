const { Animated, Easing } = require("react-native");

const useSharedValue = (init) => ({ value: init });
const useAnimatedStyle = (fn) => {
  try { return fn(); } catch { return {}; }
};
const useAnimatedProps = (fn) => {
  try { return fn(); } catch { return {}; }
};
const useAnimatedRef = () => ({ current: null });
const useAnimatedScrollHandler = () => () => {};
const useAnimatedGestureHandler = () => ({});
const useAnimatedReaction = () => {};
const useDerivedValue = (fn) => ({ value: (() => { try { return fn(); } catch { return undefined; } })() });
const useAnimatedSensor = () => ({ sensor: { value: {} }, unregister: () => {} });
const useScrollViewOffset = () => ({ value: 0 });
const useAnimatedKeyboard = () => ({ height: { value: 0 }, state: { value: 0 } });
const useReducedMotion = () => false;
const useFrameCallback = () => {};
const useWorkletCallback = (fn) => fn;
const createWorklet = (fn) => fn;

const withTiming = (toValue, _config, callback) => {
  if (callback) setTimeout(() => callback(true, true), 300);
  return toValue;
};
const withSpring = (toValue, _config, callback) => {
  if (callback) setTimeout(() => callback(true, true), 300);
  return toValue;
};
const withDecay = (config, callback) => {
  if (callback) setTimeout(() => callback(true, true), 300);
  return 0;
};
const withDelay = (_delay, animation) => animation;
const withRepeat = (animation) => animation;
const withSequence = (...animations) => animations[animations.length - 1];
const withClamp = (_config, animation) => animation;

const cancelAnimation = () => {};
const runOnJS = (fn) => fn;
const runOnUI = (fn) => fn;
const makeMutable = (init) => ({ value: init });
const makeShareableCloneRecursive = (v) => v;

const interpolate = (value, inputRange, outputRange, extrapolation) => {
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

const interpolateColor = (_value, _inputRange, outputRange) => outputRange[0];
const Extrapolation = { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" };

const AnimatedProxy = new Proxy(Animated, {
  get(target, key) {
    if (key in target) return target[key];
    return () => null;
  }
});

const createAnimatedComponent = (Component) => Component;

module.exports = {
  default: AnimatedProxy,
  Animated: AnimatedProxy,
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedGestureHandler,
  useAnimatedReaction,
  useDerivedValue,
  useAnimatedSensor,
  useScrollViewOffset,
  useAnimatedKeyboard,
  useReducedMotion,
  useFrameCallback,
  useWorkletCallback,
  createWorklet,
  withTiming,
  withSpring,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withClamp,
  cancelAnimation,
  runOnJS,
  runOnUI,
  makeMutable,
  makeShareableCloneRecursive,
  interpolate,
  interpolateColor,
  Extrapolation,
  Easing,
  FadeIn: {},
  FadeOut: {},
  FadeInUp: {},
  FadeInDown: {},
  FadeOutUp: {},
  FadeOutDown: {},
  SlideInLeft: {},
  SlideInRight: {},
  SlideOutLeft: {},
  SlideOutRight: {},
  ZoomIn: {},
  ZoomOut: {},
  LinearTransition: {},
  Layout: {},
  Keyframe: class {},
  SharedValue: {},
  SharedTransition: { custom: () => ({}) },
  ReduceMotion: { Never: "never", Always: "always", System: "system" },
};
