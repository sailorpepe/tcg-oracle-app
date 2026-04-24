import React from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Tab layout — 4 tabs: INDEX · SCAN · ORACLE · VAULT
 * Settings moved to ⚙ gear icon in screen headers.
 * Clean Unicode glyphs, no emojis.
 */
export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Index',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⌕</Text>,
        }}
      />
      <Tabs.Screen
        name="grade"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>◎</Text>,
        }}
      />
      <Tabs.Screen
        name="oracle"
        options={{
          title: 'Oracle',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>◈</Text>,
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⬡</Text>,
        }}
      />
      {/* Settings is now accessed via ⚙ gear icon in screen headers */}
      <Tabs.Screen name="settings" options={{ href: null }} />
      {/* Hide the old market tab file if it still exists */}
      <Tabs.Screen name="market" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 18,
    ...Platform.select({
      web: { lineHeight: 22 },
    }),
  },
});
