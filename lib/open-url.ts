/**
 * Cross-platform URL opener.
 * In Tauri: uses the opener plugin to open in system browser.
 * In browser: uses window.open.
 * On native: uses RN Linking.
 */
import { Platform, Linking } from 'react-native';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export async function openUrl(url: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await Linking.openURL(url);
    return;
  }

  if (isTauri()) {
    try {
      // Tauri v2 opener plugin — opens URL in system default browser
      const internals = (window as any).__TAURI_INTERNALS__;
      if (internals?.invoke) {
        await internals.invoke('plugin:opener|open_url', { url });
        return;
      }
    } catch (e: any) {
      console.warn('[openUrl] Tauri opener failed, falling back to window.open:', e?.message);
    }
  }

  // Fallback for standard browser
  window.open(url, '_blank');
}
