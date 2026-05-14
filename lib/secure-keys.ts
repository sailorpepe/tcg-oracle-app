/**
 * Secure Key Storage — Platform-Adaptive API Key Storage
 * ======================================================
 * Uses expo-secure-store on native (iOS/Android) for Keychain/Keystore protection.
 * Falls back to localStorage on web (Tauri) with a console warning.
 *
 * This replaces raw AsyncStorage for any sensitive data (API keys, tokens, secrets).
 * Non-sensitive data (theme, EULA, wallpaper) should continue using AsyncStorage.
 */

import { Platform } from 'react-native';

// Dynamic import to avoid crash on web where SecureStore isn't available
let SecureStore: typeof import('expo-secure-store') | null = null;

async function getSecureStore() {
  if (SecureStore) return SecureStore;
  if (Platform.OS !== 'web') {
    try {
      SecureStore = await import('expo-secure-store');
      return SecureStore;
    } catch {
      console.warn('[SecureKeys] expo-secure-store not available, falling back to localStorage');
    }
  }
  return null;
}

/**
 * Store a sensitive value securely.
 * Native: expo-secure-store (Keychain/Keystore)
 * Web: localStorage (best available on Tauri/browser)
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  const store = await getSecureStore();
  if (store) {
    await store.setItemAsync(key, value, {
      keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    // Web fallback
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  }
}

/**
 * Retrieve a sensitive value.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  const store = await getSecureStore();
  if (store) {
    return store.getItemAsync(key);
  }
  // Web fallback
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
}

/**
 * Delete a sensitive value.
 */
export async function deleteSecureItem(key: string): Promise<void> {
  const store = await getSecureStore();
  if (store) {
    await store.deleteItemAsync(key);
  } else if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }
}
