import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Custom tab bar — React Navigation's default web renderer
 * breaks in static/SPA Expo export (renders tabs as a vertical link list).
 * This custom component always renders as a horizontal bottom bar.
 */
function CustomTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useTheme();

  return (
    <View style={[tabBarStyles.container, { backgroundColor: theme.tabBar, borderTopColor: theme.tabBarBorder }]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        // Skip hidden tabs (settings, market) — href:null doesn't propagate to custom renderers
        if (options.href === null || !options.tabBarIcon || route.name === 'settings' || route.name === 'market') return null;

        const isFocused = state.index === index;
        const color = isFocused ? theme.tabActive : theme.tabInactive;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Render the icon
        const icon = options.tabBarIcon ? options.tabBarIcon({ color, focused: isFocused, size: 22 }) : null;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={tabBarStyles.tab}
            activeOpacity={0.7}
          >
            {icon}
            <Text style={[tabBarStyles.label, { color }]}>
              {options.title || route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 24,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});

/**
 * Tab layout — 4 tabs: INDEX · SCAN · ORACLE · VAULT
 * Settings moved to ⚙ gear icon in screen headers.
 * Clean Unicode glyphs, no emojis.
 */
export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        // Force opaque background on each tab's content area so inactive tabs don't bleed through
        sceneStyle: { backgroundColor: theme.background },
        lazy: true,
      } as any}
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
