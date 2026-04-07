import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface ToastContextValue {
  showToast: (message: string, type?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"success" | "error">("success");
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, toastType: "success" | "error" = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setType(toastType);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }, 2800);
  }, [opacity]);

  const bgColor = type === "error" ? colors.destructive : colors.foreground;
  const textColor = colors.primaryForeground;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Animated.View
        style={[
          styles.toast,
          { opacity, bottom: insets.bottom + 90, backgroundColor: bgColor },
        ]}
        pointerEvents="none"
      >
        <Text style={[styles.toastText, { color: textColor }]} numberOfLines={2}>
          {message}
        </Text>
      </Animated.View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    zIndex: 9999,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
