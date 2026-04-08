import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useInboxSheet } from "@/contexts/InboxSheetContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="agent">
        <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
        <Label>Agent</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <Icon sf={{ default: "calendar", selected: "calendar" }} />
        <Label>Calendar</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { emitOpenAccountSheet } = useInboxSheet();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "person.circle.fill" : "person.circle"} tintColor={focused ? colors.foreground : colors.mutedForeground} size={24} />
            ) : (
              <Feather name="user" size={22} color={focused ? colors.foreground : colors.mutedForeground} />
            ),
        }}
        listeners={{
          tabPress: () => {
            emitOpenAccountSheet();
          },
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: "Agent",
          tabBarIcon: ({ focused }) =>
            isIOS ? (
              <SymbolView name="sparkles" tintColor={focused ? colors.foreground : colors.mutedForeground} size={24} />
            ) : (
              <Feather name="zap" size={22} color={focused ? colors.foreground : colors.mutedForeground} />
            ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ focused }) =>
            isIOS ? (
              <SymbolView name="calendar" tintColor={focused ? colors.foreground : colors.mutedForeground} size={24} />
            ) : (
              <Feather name="calendar" size={22} color={focused ? colors.foreground : colors.mutedForeground} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
