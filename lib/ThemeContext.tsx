import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, themeMetadata, defaultTheme, ThemeName, ThemeColors } from '@/constants/Themes';
import { WallpaperState, getWallpaper, saveWallpaper as saveWallpaperStorage, clearWallpaper as clearWallpaperStorage, BorderEffect } from '@/lib/wallpaper';

const THEME_KEY = '@tcg_oracle_theme';

interface ThemeContextValue {
  theme: ThemeColors;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  allThemes: typeof themeMetadata;
  wallpaper: WallpaperState;
  setWallpaper: (state: Partial<WallpaperState>) => void;
  clearWallpaper: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes[defaultTheme],
  themeName: defaultTheme,
  setTheme: () => {},
  allThemes: themeMetadata,
  wallpaper: { uri: null, borderEffect: 'none', opacity: 0.25, effectsEnabled: true },
  setWallpaper: () => {},
  clearWallpaper: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme);
  const [wallpaper, setWallpaperState] = useState<WallpaperState>({
    uri: null, borderEffect: 'none', opacity: 0.25, effectsEnabled: true
  });

  // Load saved theme + wallpaper on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved && saved in themes) {
        setThemeName(saved as ThemeName);
      }
    });
    getWallpaper().then(wp => setWallpaperState(wp));
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    AsyncStorage.setItem(THEME_KEY, name);
  }, []);

  const setWallpaper = useCallback(async (update: Partial<WallpaperState>) => {
    const merged = await saveWallpaperStorage(update);
    setWallpaperState(merged);
  }, []);

  const clearWallpaper = useCallback(async () => {
    await clearWallpaperStorage();
    setWallpaperState({ uri: null, borderEffect: 'none', opacity: 0.25, effectsEnabled: true });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: themes[themeName],
        themeName,
        setTheme,
        allThemes: themeMetadata,
        wallpaper,
        setWallpaper,
        clearWallpaper,
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
 *   const { theme, themeName, setTheme, allThemes, wallpaper } = useTheme();
 *   <View style={{ backgroundColor: theme.background }}>
 */
export function useTheme() {
  return useContext(ThemeContext);
}
