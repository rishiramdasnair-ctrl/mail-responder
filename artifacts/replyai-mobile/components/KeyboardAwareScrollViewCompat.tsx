import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import { Platform, ScrollView, type ScrollViewProps } from "react-native";
import React from "react";

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...(props as any)}>
        {children as any}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...(props as KeyboardAwareScrollViewProps)}
    >
      {children as any}
    </KeyboardAwareScrollView>
  );
}
