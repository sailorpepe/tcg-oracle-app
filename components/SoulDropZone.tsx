/**
 * TCG Oracle — Soul Drop Zone
 * Compact card for mounting/unmounting an Undesirables SOUL.md file.
 * Platform-adaptive:
 *   Desktop (Tauri): Native drag-and-drop + file browse
 *   Web: File input picker
 *   Mobile: Would use expo-document-picker (stubbed for now)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import { SoulProfile, TRAIT_COLORS, parseSoulMd, saveSoul, clearSoul } from '@/lib/soul';

interface SoulDropZoneProps {
  soul: SoulProfile | null;
  onSoulMounted: (soul: SoulProfile) => void;
  onSoulUnmounted: () => void;
}

/** Detect Tauri v2 runtime */
const isTauri = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export default function SoulDropZone({ soul, onSoulMounted, onSoulUnmounted }: SoulDropZoneProps) {
  const { theme } = useTheme();
  const [isHovering, setIsHovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ─── Process a SOUL.md file content ──────────
  const processSoulContent = useCallback(async (content: string, pathHint?: string) => {
    setError('');
    setLoading(true);
    try {
      // Extract soul ID from path for fallback naming
      const parts = (pathHint || '').split('/');
      const fallbackId = parts[parts.length - 1]?.replace('.md', '') || parts[parts.length - 2] || 'Unknown';

      const profile = parseSoulMd(content, fallbackId);

      // Validate we got something useful
      if (!profile.name || profile.name === 'Undesirable #Unknown') {
        // Check if the file has ANY personality data
        const hasBigFive = /neuroticism:|extraversion:|openness:|agreeableness:|conscientiousness:/i.test(content);
        if (!hasBigFive) {
          setError('This file doesn\'t look like a SOUL.md — no personality traits found.');
          setLoading(false);
          return;
        }
      }

      await saveSoul(profile);
      onSoulMounted(profile);
    } catch (err: any) {
      setError(err?.message || 'Failed to parse SOUL.md');
    }
    setLoading(false);
  }, [onSoulMounted]);

  // ─── Tauri Drag-and-Drop Listener ────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !isTauri()) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');

        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'over') {
            setIsHovering(true);
          } else if (event.payload.type === 'drop') {
            setIsHovering(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const droppedPath = paths[0];
              const ext = droppedPath.split('.').pop()?.toLowerCase();

              // Only accept .md files or directories (try SOUL.md inside)
              if (ext === 'md') {
                readTextFile(droppedPath)
                  .then((content) => processSoulContent(content, droppedPath))
                  .catch(() => setError('Could not read file'));
              } else {
                // Assume it's a directory — try reading SOUL.md inside
                const soulPath = droppedPath.replace(/\/$/, '') + '/SOUL.md';
                readTextFile(soulPath)
                  .then((content) => processSoulContent(content, soulPath))
                  .catch(() => setError('No SOUL.md found in this folder'));
              }
            }
          } else {
            setIsHovering(false);
          }
        });
      } catch (err) {
        console.error('[SoulDropZone] Failed to bind drag events:', err);
      }
    };

    setup();
    return () => { if (unlisten) unlisten(); };
  }, [processSoulContent]);

  // ─── File Browse (Tauri dialog or web file input) ──
  const handleBrowse = async () => {
    setError('');

    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');

        const selected = await open({
          directory: false,
          multiple: false,
          filters: [{ name: 'Soul File', extensions: ['md'] }],
          title: 'Select your SOUL.md file',
        });

        if (selected) {
          const content = await readTextFile(selected as string);
          await processSoulContent(content, selected as string);
        }
      } catch (err: any) {
        setError(err?.message || 'File dialog error');
      }
    } else if (Platform.OS === 'web') {
      // Web fallback: create a temporary file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md';
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const content = await file.text();
          await processSoulContent(content, file.name);
        }
      };
      input.click();
    }
  };

  // ─── Unmount Soul ────────────────────────────
  const handleUnmount = async () => {
    await clearSoul();
    onSoulUnmounted();
  };

  // ─── HTML5 Drag-and-Drop for browser (non-Tauri web) ──
  // NOTE: All hooks MUST be declared before any early returns (React rules of hooks)
  const dropRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || isTauri() || soul) return;

    // Get the underlying DOM node from the React Native Web view
    const node = (dropRef.current as any);
    if (!node) return;

    // React Native Web exposes the DOM element directly or via _nativeTag
    const domElement: HTMLElement | null =
      node instanceof HTMLElement ? node :
      node._nativeTag ? document.getElementById(String(node._nativeTag)) :
      null;

    if (!domElement) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsHovering(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsHovering(false);
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsHovering(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.md')) {
          const content = await file.text();
          await processSoulContent(content, file.name);
        } else {
          setError('Please drop a .md file');
        }
      }
    };

    domElement.addEventListener('dragover', handleDragOver);
    domElement.addEventListener('dragleave', handleDragLeave);
    domElement.addEventListener('drop', handleDrop);

    return () => {
      domElement.removeEventListener('dragover', handleDragOver);
      domElement.removeEventListener('dragleave', handleDragLeave);
      domElement.removeEventListener('drop', handleDrop);
    };
  }, [processSoulContent, soul]);

  // ─── Render: Soul Mounted ────────────────────
  if (soul) {
    const traits = [
      { key: 'openness', label: 'OPN', value: soul.openness },
      { key: 'conscientiousness', label: 'CON', value: soul.conscientiousness },
      { key: 'extraversion', label: 'EXT', value: soul.extraversion },
      { key: 'agreeableness', label: 'AGR', value: soul.agreeableness },
      { key: 'neuroticism', label: 'NEU', value: soul.neuroticism },
    ];

    return (
      <View style={[styles.mountedCard, { backgroundColor: theme.surface, borderColor: theme.borderGlow }]}>
        <View style={styles.mountedHeader}>
          <View style={styles.mountedInfo}>
            <Text style={[styles.soulIcon]}>🧬</Text>
            <View>
              <Text style={[styles.soulName, { color: theme.textPrimary }]} numberOfLines={1}>
                {soul.name}
              </Text>
              <Text style={[styles.soulArchetype, { color: theme.accent }]}>
                {soul.archetype}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleUnmount} style={styles.unmountBtn} activeOpacity={0.7}>
            <Text style={[styles.unmountText, { color: theme.textDim }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Mini Big Five trait bars */}
        <View style={styles.traitBars}>
          {traits.map((t) => (
            <View key={t.key} style={styles.traitRow}>
              <Text style={[styles.traitLabel, { color: TRAIT_COLORS[t.key] }]}>{t.label}</Text>
              <View style={[styles.traitBarBg, { backgroundColor: theme.background }]}>
                <View
                  style={[
                    styles.traitBarFill,
                    {
                      backgroundColor: TRAIT_COLORS[t.key],
                      width: `${t.value}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.traitValue, { color: theme.textMuted }]}>{t.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ─── Render: No Soul (Drop Zone) ─────────────
  return (
    <TouchableOpacity
      ref={dropRef as any}
      onPress={handleBrowse}
      activeOpacity={0.7}
      style={[
        styles.dropZone,
        {
          backgroundColor: isHovering ? `${theme.accent}10` : theme.surface,
          borderColor: isHovering ? theme.borderGlow : theme.border,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : (
        <>
          <Text style={[styles.dropIcon, { opacity: isHovering ? 1 : 0.5 }]}>🌸</Text>
          <View style={styles.dropTextCol}>
            <Text style={[styles.dropTitle, { color: isHovering ? theme.accent : theme.textSecondary }]}>
              {isHovering ? 'DROP IT!' : isTauri() ? 'DROP SOUL HERE' : 'DROP OR CLICK TO LOAD SOUL'}
            </Text>
            <Text style={[styles.dropHint, { color: theme.textDim }]}>
              {isTauri()
                ? 'Drag your SOUL.md folder or click to browse'
                : 'Drag a SOUL.md file here, or click to browse'}
            </Text>
          </View>
        </>
      )}
      {error ? (
        <Text style={[styles.errorText]}>{error}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // ── Mounted Card ──
  mountedCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  mountedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mountedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  soulIcon: {
    fontSize: 20,
  },
  soulName: {
    fontSize: FontSizes.sm,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  soulArchetype: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  unmountBtn: {
    padding: Spacing.xs,
  },
  unmountText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Trait Bars ──
  traitBars: {
    marginTop: Spacing.sm,
    gap: 4,
  },
  traitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  traitLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    width: 26,
    textAlign: 'right',
  },
  traitBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  traitBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  traitValue: {
    fontSize: 8,
    fontWeight: '700',
    width: 20,
    textAlign: 'right',
  },

  // ── Drop Zone ──
  dropZone: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed' as any,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dropIcon: {
    fontSize: 20,
  },
  dropTextCol: {
    flex: 1,
  },
  dropTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dropHint: {
    fontSize: 10,
    marginTop: 1,
  },
  errorText: {
    fontSize: 9,
    color: '#ff4444',
    marginTop: 4,
  },
});
