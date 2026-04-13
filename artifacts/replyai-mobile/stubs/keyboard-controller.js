const React = require("react");

const NOOP = () => {};
const NOOP_REMOVE = () => ({ remove: NOOP });

const KeyboardContext = React.createContext({
  enabled: true,
  animated: { progress: { value: 0 }, height: { value: 0 } },
  reanimated: { progress: { value: 0 }, height: { value: 0 } },
  layout: { value: null },
  setKeyboardHandlers: () => NOOP,
  setInputHandlers: () => NOOP,
  setEnabled: NOOP,
});

function KeyboardProvider({ children }) {
  return React.createElement(KeyboardContext.Provider, { value: KeyboardContext._currentValue }, children);
}

function KeyboardAwareScrollView({ children, ...props }) {
  const { ScrollView } = require("react-native");
  return React.createElement(ScrollView, props, children);
}

function KeyboardAvoidingView({ children, ...props }) {
  const { KeyboardAvoidingView: RNKeyboardAvoidingView } = require("react-native");
  return React.createElement(RNKeyboardAvoidingView, props, children);
}

function KeyboardStickyView({ children, ...props }) {
  const { View } = require("react-native");
  return React.createElement(View, props, children);
}

const KeyboardController = {
  setDefaultMode: NOOP,
  setInputMode: NOOP,
  preload: NOOP,
  dismiss: NOOP,
  setFocusTo: NOOP,
  addListener: NOOP_REMOVE,
  removeListeners: NOOP,
};

const KeyboardEvents = {
  addListener: NOOP_REMOVE,
};

const FocusedInputEvents = {
  addListener: NOOP_REMOVE,
};

function useKeyboardContext() {
  return React.useContext(KeyboardContext);
}

function useKeyboardController() {
  return { setEnabled: NOOP };
}

function useKeyboardAnimation() {
  const { Animated } = require("react-native");
  return { height: new Animated.Value(0), progress: new Animated.Value(0) };
}

function useReanimatedKeyboardAnimation() {
  return { height: { value: 0 }, progress: { value: 0 } };
}

function useKeyboardHandler() {}
function useFocusedInputHandler() {}
function useAnimatedKeyboardHandler() { return NOOP; }
function useFocusedInputLayoutHandler() { return NOOP; }

module.exports = {
  KeyboardProvider,
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
  KeyboardStickyView,
  KeyboardContext,
  KeyboardController,
  KeyboardEvents,
  FocusedInputEvents,
  useKeyboardContext,
  useKeyboardController,
  useKeyboardAnimation,
  useReanimatedKeyboardAnimation,
  useKeyboardHandler,
  useFocusedInputHandler,
  useAnimatedKeyboardHandler,
  useFocusedInputLayoutHandler,
  KeyboardGestureArea: ({ children }) => children,
  KeyboardExtender: ({ children }) => children,
  OverKeyboardView: ({ children }) => children,
};
