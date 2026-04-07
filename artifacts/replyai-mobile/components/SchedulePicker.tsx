import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useColors } from "@/hooks/useColors";

interface SchedulePickerProps {
  visible: boolean;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

export function SchedulePicker({ visible, onConfirm, onCancel }: SchedulePickerProps) {
  const colors = useColors();
  const minDate = new Date(Date.now() + 60_000);
  const [step, setStep] = useState<"date" | "time">("date");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(Date.now() + 60 * 60 * 1000));

  const handleChange = (_: unknown, date?: Date) => {
    if (!date) {
      onCancel();
      return;
    }
    if (Platform.OS === "android") {
      if (step === "date") {
        setSelectedDate(date);
        setStep("time");
      } else {
        setStep("date");
        onConfirm(date);
      }
    } else {
      setSelectedDate(date);
    }
  };

  const handleIOSConfirm = () => {
    onConfirm(selectedDate);
    setStep("date");
  };

  const handleIOSCancel = () => {
    onCancel();
    setStep("date");
  };

  if (!visible) return null;

  // Android: native modal dialogs, no wrapper needed
  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={selectedDate}
        mode={step}
        display="default"
        minimumDate={minDate}
        onChange={handleChange}
      />
    );
  }

  // iOS: spinner inside a bottom sheet modal
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: 32,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerBtn: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    confirmBtn: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    title: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleIOSCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleIOSCancel}>
              <Text style={styles.headerBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Schedule Send</Text>
            <TouchableOpacity onPress={handleIOSConfirm}>
              <Text style={styles.confirmBtn}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={selectedDate}
            mode="datetime"
            display="spinner"
            minimumDate={minDate}
            onChange={handleChange}
            style={{ width: "100%" }}
          />
        </View>
      </View>
    </Modal>
  );
}
