import { useTheme } from "@/contexts/ThemeContext";

export function useColors() {
  const { palette } = useTheme();
  return palette;
}
