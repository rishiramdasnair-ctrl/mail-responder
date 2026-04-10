import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import { Platform, ScrollView, type ScrollViewProps } from "react-native";
import type React from "react";

type Props = Omit<KeyboardAwareScrollViewProps, "children"> &
  Omit<ScrollViewProps, "children"> & {
    children?: React.ReactNode;
    keyboardShouldPersistTaps?: "handled" | "always" | "never";
  };

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  if (Platform.OS === "web") {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...(props as KeyboardAwareScrollViewProps)}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
