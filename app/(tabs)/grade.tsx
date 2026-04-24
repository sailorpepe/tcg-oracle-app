import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import ScreenTitle from '@/components/ScreenTitle';

export default function GradeScreen() {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const isWeb = Platform.OS === 'web';

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
      }
    } catch (e) {
      console.warn('Capture failed:', e);
    }
  };

  const resetCapture = () => setCapturedUri(null);

  // ─── Permission not granted yet ───
  if (!isWeb && permission && !permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <View style={styles.permissionBox}>
          <ScreenTitle title="Scan" subtitle="Neural vision pipeline" />
          <View style={styles.permissionContent}>
            <Text style={styles.permissionEmoji}>◎</Text>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary }]}>
              Sensor Access Required
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textMuted }]}>
              Enable device sensor to initialize the on-device grading pipeline. All inference runs locally — zero data transmitted.
            </Text>
            <TouchableOpacity
              style={[styles.permissionBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
              onPress={requestPermission}
            >
              <Text style={[styles.permissionBtnText, { color: theme.accent }]}>
                AUTHORIZE SENSOR
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pro badge */}
          <View style={[styles.proBadge, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.proText, { color: theme.accent }]}>◆ PRO</Text>
            <Text style={[styles.proDesc, { color: theme.textMuted }]}>
              Full neural grading requires Pro tier — all inference runs locally on your device
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Web fallback (no camera in browser) ───
  if (isWeb) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <View style={styles.contentBox}>
          <ScreenTitle title="Scan" subtitle="Neural vision pipeline" showGear />

          <View style={[styles.viewfinderBox, { borderColor: theme.border }]}>
            <LinearGradient
              colors={[theme.accentDim, 'transparent', theme.accentDim]}
              style={styles.viewfinderGradient}
            />

            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />

            <View style={styles.viewfinderCenter}>
              <Text style={styles.cameraEmoji}>◎</Text>
              <Text style={[styles.viewfinderText, { color: theme.textSecondary }]}>
                Sensor available on native device
              </Text>
              <Text style={[styles.viewfinderSubtext, { color: theme.textMuted }]}>
                Deploy via EAS to initialize pipeline
              </Text>
            </View>
          </View>

          {/* Feature grid */}
          <View style={styles.featuresGrid}>
            {[
              { emoji: '◈', title: 'On-Device AI', desc: 'Zero cloud dependency' },
              { emoji: '▷', title: 'Sub-Second', desc: 'Grade prediction in <1s' },
              { emoji: '◎', title: 'PSA · BGS · CGC', desc: 'Multi-scale prediction' },
              { emoji: '⬡', title: 'Local Only', desc: 'No data transmitted' },
            ].map((f, i) => (
              <View key={i} style={[styles.featureCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={styles.featureEmoji}>{f.emoji}</Text>
                <Text style={[styles.featureTitle, { color: theme.textPrimary }]}>{f.title}</Text>
                <Text style={[styles.featureDesc, { color: theme.textMuted }]}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Camera view (native iOS/Android) ───
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />

      {capturedUri ? (
        <View style={styles.resultBox}>
          <ScreenTitle title="Scan" subtitle="Analysis complete" />
          {/* TODO: Show grading result here */}
          <View style={[styles.gradePlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.gradePreview, { color: theme.accent }]}>PSA 9</Text>
            <Text style={[styles.gradeLabel, { color: theme.textSecondary }]}>Estimated Grade</Text>
            <Text style={[styles.gradeNote, { color: theme.textMuted }]}>
              Full neural pipeline initializing in next build
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.retakeBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
            onPress={resetCapture}
          >
            <Text style={[styles.retakeBtnText, { color: theme.accent }]}>RE-SCAN</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />

          {/* Overlay with corner brackets */}
          <View style={styles.cameraOverlay}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />

            <Text style={[styles.overlayHint, { color: theme.textPrimary }]}>
              ALIGN ASSET IN FRAME
            </Text>
          </View>

          {/* Capture button */}
          <View style={styles.captureRow}>
            <TouchableOpacity
              style={[styles.captureBtn, { borderColor: theme.accent }]}
              onPress={handleCapture}
              disabled={!cameraReady}
            >
              <View style={[styles.captureBtnInner, { backgroundColor: theme.accent }]} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Permission screen
  permissionBox: { flex: 1, padding: Spacing.xl },
  permissionContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.lg },
  permissionEmoji: { fontSize: 64, marginBottom: Spacing.md },
  permissionTitle: { fontSize: FontSizes.xl, fontWeight: '800' },
  permissionDesc: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  permissionBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
  },
  permissionBtnText: { fontSize: FontSizes.md, fontWeight: '700' },

  // Pro badge
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.xl,
  },
  proText: { fontSize: FontSizes.sm, fontWeight: '800' },
  proDesc: { flex: 1, fontSize: FontSizes.xs, lineHeight: 16 },

  // Content (web fallback)
  contentBox: { flex: 1, padding: Spacing.xl },

  // Viewfinder
  viewfinderBox: {
    height: 300,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginTop: Spacing.xl,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  viewfinderCenter: { alignItems: 'center', gap: Spacing.sm, zIndex: 1 },
  cameraEmoji: { fontSize: 48 },
  viewfinderText: { fontSize: FontSizes.md, fontWeight: '600' },
  viewfinderSubtext: { fontSize: FontSizes.xs },

  // Corners
  corner: { position: 'absolute', width: 24, height: 24, borderWidth: 2 },
  cornerTL: { top: 16, left: 16, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 16, right: 16, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 16, left: 16, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 16, right: 16, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  // Features grid
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.xl },
  featureCard: {
    width: '47%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 4,
  },
  featureEmoji: { fontSize: 24 },
  featureTitle: { fontSize: FontSizes.sm, fontWeight: '700' },
  featureDesc: { fontSize: FontSizes.xs, lineHeight: 14 },

  // Camera (native)
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayHint: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Capture button
  captureRow: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },

  // Result screen
  resultBox: { flex: 1, padding: Spacing.xl },
  gradePlaceholder: {
    padding: Spacing.xxxl,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  gradePreview: { fontSize: 48, fontWeight: '900' },
  gradeLabel: { fontSize: FontSizes.md, fontWeight: '600' },
  gradeNote: { fontSize: FontSizes.xs, textAlign: 'center' },
  retakeBtn: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  retakeBtnText: { fontSize: FontSizes.md, fontWeight: '700' },
});
