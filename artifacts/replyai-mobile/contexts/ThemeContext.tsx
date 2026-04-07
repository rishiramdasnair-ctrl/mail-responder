import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_THEME_ID, getTheme, type ThemeId, type ColorPalette } from "@/constants/themes";

const STORAGE_KEY = "replyai_theme_id";

interface ThemeContextValue {
  themeId: ThemeId;
  palette: ColorPalette;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  palette: getTheme(DEFAULT_THEME_ID).palette,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) setThemeId(saved as ThemeId);
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  const palette = getTheme(themeId).palette;

  return (
    <ThemeContext.Provider value={{ themeId, palette, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
