/**
 * TabScreenGuard — Workaround for Tauri WebKit not hiding inactive tab screens.
 *
 * React Navigation uses `display: 'none'` to hide inactive tabs, but Tauri's
 * WKWebView ignores this in certain rendering contexts, causing all tab screens
 * to stack on top of each other.
 *
 * This component checks if the screen is focused and renders an empty zero-height
 * container when it's not, guaranteeing no visual overlap.
 */
import React from 'react';
import { View, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

export default function TabScreenGuard({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  // On non-web platforms, the navigator handles visibility correctly
  if (Platform.OS !== 'web') return <>{children}</>;

  if (!isFocused) {
    return <View style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }} />;
  }

  return <>{children}</>;
}
