import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform, TextInput } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { Colors, Spacing, BorderRadius } from '@/constants/Theme';

export default function WalletConnectModal({ visible, onClose }: { visible: boolean, onClose: () => void }) {
  const { theme } = useTheme();
  const [opened, setOpened] = useState(false);
  
  useEffect(() => {
    if (!visible) {
      setOpened(false);
      return;
    }

    if (!opened && visible) {
      setOpened(true);
      // Launch external browser securely using Tauri opener or standard web API
      const bridgeUrl = 'https://the-undesirables.com/bridge?action=connect';
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('open_web3_browser', { url: bridgeUrl }).then((openedInWeb3Browser) => {
            if (openedInWeb3Browser) {
              console.log("Successfully routed to a dedicated Web3 browser.");
            } else {
              console.log("No Web3 browser found. Fell back to OS default.");
            }
          }).catch(console.error);
        });
      } else {
        import('@/lib/open-url').then(({ openUrl }) => {
           openUrl(bridgeUrl).catch(console.error);
        });
      }
    }

    const handleDeepLinkConnect = (e: any) => {
      // The _layout.tsx throws this event when the deep link returns
      console.log('Wallet Connected via Bridge:', e.detail.address);
      onClose();
    };

    if (Platform.OS === 'web') {
      window.addEventListener('tcgoracle-connect', handleDeepLinkConnect);
      return () => window.removeEventListener('tcgoracle-connect', handleDeepLinkConnect);
    }
  }, [visible, opened, onClose]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Secure Browser Bridge</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Connect safely without exposing your private keys to this app.
          </Text>

          <View style={[styles.qrContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={{ marginTop: 12, color: theme.textSecondary, fontSize: 12, fontWeight: 'bold', textAlign: 'center' }}>
                OPENING BROWSER...{'\n'}PLEASE COMPLETE LOGIN THERE
              </Text>
            </View>
          </View>
          
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, textAlign: 'center' }}>
             Safari doesn't have your wallet? Copy this link into Chrome:
          </Text>
          <View style={{ width: '100%', flexDirection: 'row', gap: 8, marginBottom: Spacing.xl }}>
             <TextInput 
                value="https://the-undesirables.com/bridge?action=connect"
                style={[styles.cancelBtn, { flex: 1, borderColor: theme.border, color: theme.textSecondary, backgroundColor: theme.surface }]}
                editable={false}
             />
             <TouchableOpacity 
                style={[styles.cancelBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                onPress={() => {
                   if (typeof window !== 'undefined' && window.navigator) {
                      window.navigator.clipboard.writeText('https://the-undesirables.com/bridge?action=connect');
                   }
                }}
             >
                <Text style={[styles.cancelBtnText, { color: theme.textPrimary }]}>COPY</Text>
             </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: theme.border }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  qrContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: Spacing.xl,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    minHeight: 150,
    minWidth: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
