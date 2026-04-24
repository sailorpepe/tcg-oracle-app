import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, themeMetadata, defaultTheme, ThemeName, ThemeColors } from '@/constants/Themes';

const THEME_KEY = '@tcg_oracle_theme';

interface ThemeContextValue {
  theme: ThemeColors;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  allThemes: typeof themeMetadata;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes[defaultTheme],
  themeName: defaultTheme,
  setTheme: () => {},
  allThemes: themeMetadata,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme);

  // Load saved theme on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved && saved in themes) {
        setThemeName(saved as ThemeName);
      }
    });
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    AsyncStorage.setItem(THEME_KEY, name);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: themes[themeName],
        themeName,
        setTheme,
        allThemes: themeMetadata,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access the current theme
 *
 * Usage:
 *   const { theme, themeName, setTheme, allThemes } = useTheme();
 *   <View style={{ backgroundColor: theme.background }}>
 */
export function useTheme() {
  return useContext(ThemeContext);
}
