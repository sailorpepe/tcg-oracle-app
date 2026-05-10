import { Platform } from 'react-native';

// CRITICAL: Tauri's webview runs under tauri:// protocol which WebKit doesn't
// consider a "secure context". navigator.mediaDevices EXISTS but throws
// "The operation is insecure" when you call getUserMedia/enumerateDevices.
// expo-camera's useCameraPermissions() triggers this on mount and crashes the Scan tab.
// Fix: Force-override both mediaDevices AND permissions with safe stubs.
// The Scan tab uses file-picker/drag-drop on web — camera is never needed.
if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Camera not available in desktop app', 'NotAllowedError')),
        enumerateDevices: () => Promise.resolve([]),
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      },
      writable: true,
      configurable: true,
    });
  } catch { /* readonly in some environments */ }

  try {
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: () => Promise.resolve({ state: 'denied', addEventListener: () => {}, removeEventListener: () => {} }),
      },
      writable: true,
      configurable: true,
    });
  } catch { /* readonly in some environments */ }
}

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { ThemeProvider } from '@/lib/ThemeContext';
import LicenseAgreement, { hasAcceptedEULA } from '@/components/LicenseAgreement';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
try { SplashScreen.preventAutoHideAsync(); } catch {}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Safety: if fonts fail to load within 3s, render anyway (Tauri webview fallback)
  const [forceRender, setForceRender] = useState(false);

  useEffect(() => {
    if (error) {
      console.warn('Font loading error:', error);
      setForceRender(true);
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      try { SplashScreen.hideAsync(); } catch {}
    }
  }, [loaded]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) {
        console.warn('Font loading timeout — forcing render');
        setForceRender(true);
        try { SplashScreen.hideAsync(); } catch {}
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [loaded]);

  if (!loaded && !forceRender) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const [eulaAccepted, setEulaAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    hasAcceptedEULA().then(setEulaAccepted);
  }, []);

  // Don't render anything until we've checked EULA status
  if (eulaAccepted === null) return null;

  return (
    <ThemeProvider>
      <NavThemeProvider value={DarkTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
        </Stack>
        {!eulaAccepted && (
          <LicenseAgreement onAccept={() => setEulaAccepted(true)} />
        )}
      </NavThemeProvider>
    </ThemeProvider>
  );
}
