import React, { useState, useRef, useEffect } from 'react';
import ForecastPanel from '@/components/ForecastPanel';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from '@/lib/camera-safe';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import ScreenTitle from '@/components/ScreenTitle';
import WallpaperBackground from '@/components/WallpaperBackground';
import UNDSRSlab from '@/components/UNDSRSlab';
import { analyzeCardImage } from '@/lib/inference/card-grader';
import { identifyCard, CardIdentification } from '@/lib/inference/card-identifier';
import { addToVault } from '@/lib/vault';
import { Card, GameId } from '@/lib/api';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasXAIKey, speakText, buildGradeNarration, XAIVoice, DEFAULT_VOICE } from '@/lib/xai-voice';
import SoulParticlesLite from '@/components/SoulParticlesLite';
import { SoulProfile, getSoul } from '@/lib/soul';
import { useWeb3 } from '@/lib/web3';
import WalletConnectModal from '@/components/WalletConnectModal';

const GRADE_NOTARY_ABI = [
  {
    "inputs": [
      { "internalType": "string", "name": "cardName", "type": "string" },
      { "internalType": "string", "name": "predictedGrade", "type": "string" },
      { "internalType": "string", "name": "imageHash", "type": "string" }
    ],
    "name": "notarizeGrade",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
const GRADE_NOTARY_ADDRESS = "0x36C02dA8a0983159322a80FFE9F24b1acfF8B570";

// File extension allowlist for drag-and-drop (browsers may not set MIME for HEIC/HEIF)
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.bmp', '.gif', '.avif'];

function isAllowedImageFile(file: File): boolean {
  // Check MIME type first
  if (file.type && file.type.startsWith('image/')) return true;
  // Fallback: check extension (handles HEIC on browsers that report empty MIME)
  const name = file.name.toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some(ext => name.endsWith(ext));
}

export default function GradeScreen() {
  const { theme } = useTheme();
  const isWeb = Platform.OS === 'web';
  const router = useRouter();
  
  const { isConnected, address } = useWeb3();
  const [isNotarizing, setIsNotarizing] = useState(false);
  const [wcModalVisible, setWcModalVisible] = useState(false);
  const [notarizedTx, setNotarizedTx] = useState<string | null>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const [cameraReady, setCameraReady] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const cameraRef = useRef<any>(null);

  // Grading analysis state
  const [analysisText, setAnalysisText] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  // Scan-to-Search state
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentification | null>(null);

  // Drop zone ref for native DOM event listeners (RN Web View doesn't handle drag events)
  const dropZoneRef = useRef<any>(null);
  const isFocused = useIsFocused();

  // Voice narration state
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<XAIVoice>(DEFAULT_VOICE);

  // Soul — for ambient particles
  const [mountedSoul, setMountedSoul] = useState<SoulProfile | null>(null);
  useEffect(() => { getSoul().then(setMountedSoul); }, []);

  useEffect(() => {
    hasXAIKey().then(setVoiceAvailable);
    AsyncStorage.getItem('@tcg_oracle_xai_voice').then(v => {
      if (v) setSelectedVoice(v as XAIVoice);
    });
    AsyncStorage.getItem('@tcg_oracle_voice_enabled').then(v => {
      if (v !== null) setVoiceEnabled(v === 'true');
    });
  }, []);

  // Attach native DOM drag listeners on the DOCUMENT level
  // (React Native Web's View refs are unreliable after tab switches)
  useEffect(() => {
    if (!isWeb || !isFocused || capturedUri) return;

    // --- Tauri native drag-drop (intercepts OS-level drag before browser sees it) ---
    let tauriUnlisten: (() => void) | null = null;
    const isTauriEnv = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
    if (isTauriEnv) {
      (async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const appWindow = getCurrentWindow();
          tauriUnlisten = await appWindow.onDragDropEvent(async (event) => {
            if (event.payload.type === 'over') {
              setIsDragging(true);
            } else if (event.payload.type === 'drop') {
              setIsDragging(false);
              const paths = event.payload.paths;
              if (paths && paths.length > 0) {
                const filePath = paths[0];
                try {
                  const fileBytes = await readFile(filePath);
                  const ext = filePath.split('.').pop()?.toLowerCase() || '';
                  const mimeMap: Record<string, string> = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
                    bmp: 'image/bmp', gif: 'image/gif'
                  };
                  const mime = mimeMap[ext] || 'image/jpeg';
                  const blob = new Blob([fileBytes], { type: mime });
                  const file = new File([blob], filePath.split('/').pop() || `card.${ext}`, { type: mime });
                  handleFileSelected(file);
                } catch (e) {
                  console.warn('Tauri file read failed:', e);
                }
              }
            } else if ((event.payload as any).type === 'cancel') {
              setIsDragging(false);
            }
          });
        } catch (e) {
          console.warn('Tauri drag-drop setup failed:', e);
        }
      })();
    }

    // --- Browser fallback drag listeners ---
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragEnter = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileSelected(file);
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      if (tauriUnlisten) tauriUnlisten();
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [isWeb, capturedUri, isFocused]); // re-attach when tab focus or view toggles

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        runGradingAnalysis(photo.uri);
      }
    } catch (e) {
      console.warn('Capture failed:', e);
    }
  };

  const resetCapture = () => {
    setCapturedUri(null);
    setAnalysisText('');
    setAnalysisError('');
    setAnalysisLoading(false);
    setIdentifiedCard(null);
    setIdentifyLoading(false);
  };

  /** Helper to launch eBay in the native browser */
  const openEbaySearch = (query: string) => {
    const encodedQuery = encodeURIComponent(query);
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}`;
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('launch_web3_browser', { url: ebayUrl }).then((opened) => {
          if (!opened) {
            import('@/lib/open-url').then(({ openUrl }) => openUrl(ebayUrl).catch(console.error));
          }
        }).catch(() => {
          import('@/lib/open-url').then(({ openUrl }) => openUrl(ebayUrl).catch(console.error));
        });
      });
    } else {
      import('@/lib/open-url').then(({ openUrl }) => openUrl(ebayUrl).catch(console.error));
    }
  };

  /** Save graded/identified card to local vault */
  const handleSaveToVault = async () => {
    if (!capturedUri) return;
    setIdentifyLoading(true);
    try {
      const cardIdMatch = analysisText.match(/CARD:\s*(.+?)(?=\n[A-Z]+:|$)/s);
      const parsedCardId = cardIdMatch ? cardIdMatch[1].trim() : '';
      let finalName = parsedCardId || identifiedCard?.name;
      let finalSet = identifiedCard?.set || 'Graded Slab';
      
      if (!finalName) {
        const result = await identifyCard(capturedUri);
        if (result?.name) {
          setIdentifiedCard(result);
          finalName = result.name;
          finalSet = result.set || 'Graded Slab';
        } else {
          setAnalysisError('Could not identify card. Try a clearer photo.');
          setIdentifyLoading(false);
          return;
        }
      }

      let gameType: GameId = 'pokemon';
      const nLower = finalName.toLowerCase();
      if (nLower.includes('magic') || nLower.includes('mtg')) gameType = 'magic';
      if (nLower.includes('yu-gi-oh') || nLower.includes('yugioh')) gameType = 'yugioh';
      if (nLower.includes('one piece')) gameType = 'onepiece';
      if (nLower.includes('lorcana')) gameType = 'lorcana';
      if (nLower.includes('star wars')) gameType = 'starwars';
      if (nLower.includes('digimon')) gameType = 'digimon';
      
      const vaultCard: Card = {
        id: Math.random().toString(36).substr(2, 9),
        name: finalName,
        imageUrl: capturedUri,
        imageUrlSmall: capturedUri,
        set: finalSet,
        game: gameType,
        notarizedTx: notarizedTx || undefined,
      };
      
      const { added, alreadyExists } = await addToVault(vaultCard);
      if (added) {
        if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
          setTimeout(() => router.push('/vault'), 100);
        } else {
          router.push('/vault');
        }
      } else if (alreadyExists) {
        alert('This card is already in your Vault!');
      }
    } catch (e: any) {
      if (e.message === 'NO_ENGINE') {
        setAnalysisError('NO_ENGINE');
      } else {
        alert('Failed to save to Vault: ' + e.message);
      }
    }
    setIdentifyLoading(false);
  };

  /** Run AI-powered grading analysis on the captured image */
  const runGradingAnalysis = async (imageUri: string) => {
    setAnalysisText('');
    setAnalysisError('');
    setAnalysisLoading(true);

    try {
      await analyzeCardImage(imageUri, (token) => {
        setAnalysisText(prev => prev + token);
      });
    } catch (e: any) {
      if (e.message === 'NO_ENGINE') {
        setAnalysisError('NO_ENGINE');
      } else {
        setAnalysisError(e.message || 'Analysis failed');
      }
    }
    setAnalysisLoading(false);
  };

  /** Handle file selection from both drag-drop and file picker */
  const handleFileSelected = async (file: File) => {
    try {
      if (!isAllowedImageFile(file)) {
        alert('Please upload an image file (JPG, PNG, HEIC, WebP).');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`);
        return;
      }

      setAnalysisLoading(true);
      setAnalysisText('');
      setAnalysisError('');

      let fileToRead = file;

      // Convert HEIC to JPEG
      const name = file.name.toLowerCase();
      if (name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
        const isTauriEnv = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
        if (isTauriEnv) {
          // WebKit (Tauri/Safari) natively supports HEIC — use Canvas to convert to JPEG data URI
          try {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('WebKit HEIC decode failed'));
              img.src = objectUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
            URL.revokeObjectURL(objectUrl);
            setCapturedUri(jpegDataUrl);
            runGradingAnalysis(jpegDataUrl);
            return; // Skip the FileReader path below
          } catch (e) {
            console.warn('WebKit HEIC canvas conversion failed:', e);
            // Fall through to heic2any as last resort
          }
        }
        // Non-Tauri browsers: use heic2any library
        try {
          const heic2any = (await import('heic2any')).default;
          const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }) as Blob;
          fileToRead = new File([blob], file.name.replace(/\.heic|\.heif/i, '.jpg'), { type: 'image/jpeg' });
        } catch (e: any) {
          console.warn('HEIC conversion failed:', e);
          alert('HEIC conversion failed. Please convert your photo to JPG first (screenshot it or use Preview → Export as JPEG).');
          setAnalysisLoading(false);
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;
        setCapturedUri(dataUri);
        runGradingAnalysis(dataUri);
      };
      reader.onerror = () => {
        alert('Failed to read file.');
        setAnalysisLoading(false);
      };
      reader.readAsDataURL(fileToRead);
    } catch (err: any) {
      console.error('File selection error:', err);
      alert('An error occurred while processing the file: ' + err.message);
      setAnalysisLoading(false);
    }
  };

  // ─── Render Analysis Result ───
  const renderAnalysisResult = () => {
    if (analysisLoading && !analysisText) {
      return (
        <View style={[styles.analysisBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.analysisLoadingText, { color: theme.textMuted }]}>
            Analyzing card condition...
          </Text>
          <Text style={[styles.analysisSubtext, { color: theme.textDim }]}>
            Vision AI is evaluating centering, corners, edges, and surface
          </Text>
        </View>
      );
    }

    if (analysisError === 'NO_ENGINE') {
      return (
        <View style={[styles.analysisBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.noEngineEmoji}>◈</Text>
          <Text style={[styles.noEngineTitle, { color: theme.textPrimary }]}>
            AI Engine Required
          </Text>
          <Text style={[styles.noEngineDesc, { color: theme.textMuted }]}>
            To analyze card condition, connect an AI engine in the Oracle tab. Supported engines with vision:
          </Text>
          <View style={styles.engineList}>
            <Text style={[styles.engineItem, { color: theme.accent }]}>◆ Anthropic (Claude) — Best accuracy</Text>
            <Text style={[styles.engineItem, { color: theme.textSecondary }]}>◆ Groq — Free, fast vision</Text>
            <Text style={[styles.engineItem, { color: theme.textSecondary }]}>◆ Ollama (llava) — Fully local</Text>
          </View>
        </View>
      );
    }

    if (analysisError) {
      return (
        <View style={[styles.analysisBox, { backgroundColor: theme.surface, borderColor: '#f87171' }]}>
          <Text style={[styles.analysisErrorText, { color: '#f87171' }]}>
            ⚠ {analysisError}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { borderColor: theme.border }]}
            onPress={() => capturedUri && runGradingAnalysis(capturedUri)}
          >
            <Text style={[styles.retryBtnText, { color: theme.accent }]}>RETRY ANALYSIS</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (analysisText) {
      // Parse structured fields from the AI response
      const getField = (label: string): string => {
        const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, 's');
        const match = analysisText.match(regex);
        return match ? match[1].trim() : '';
      };

      let grade = getField('PREDICTED GRADE') || '—';
      const confidence = getField('CONFIDENCE') || '—';
      let centering = getField('CENTERING') || '—';
      let corners = getField('CORNERS') || '—';
      let edges = getField('EDGES') || '—';
      let surface = getField('SURFACE') || '—';
      const summary = getField('SUMMARY') || '';

      // ─── Post-processing: Local models over-grade by 1-2 points. Apply correction. ───
      const applyPenalty = (field: string, penalty: number = 1.0): string => {
        const scoreMatch = field.match(/^(\d+(?:\.\d+)?)\s*\/\s*10/);
        if (!scoreMatch) return field;
        const original = parseFloat(scoreMatch[1]);
        const corrected = Math.max(1.0, Math.min(10.0, original - penalty));
        return field.replace(scoreMatch[0], `${corrected.toFixed(1)}/10`);
      };

      centering = applyPenalty(centering, 1.0);
      corners = applyPenalty(corners, 1.0);
      edges = applyPenalty(edges, 1.0);
      surface = applyPenalty(surface, 1.0);

      // Recalculate PSA/BGS from corrected sub-grades
      const extractScore = (field: string): number => {
        const m = field.match(/^(\d+(?:\.\d+)?)\s*\/\s*10/);
        return m ? parseFloat(m[1]) : 0;
      };
      const avgScore = (extractScore(centering) + extractScore(corners) + extractScore(edges) + extractScore(surface)) / 4;
      if (avgScore > 0) {
        const correctedPSA = Math.min(10, Math.max(1, Math.floor(avgScore)));
        const correctedBGS = Math.min(10, Math.max(1, Math.round(avgScore * 2) / 2));
        grade = `PSA ${correctedPSA} / BGS ${correctedBGS.toFixed(1)}`;
      }
      const cardId = getField('CARD') || '';
      const gameId = getField('GAME') || '';

      // Color based on confidence
      const confColor = confidence.toLowerCase().includes('high') ? '#22c55e'
        : confidence.toLowerCase().includes('medium') ? '#f59e0b' : '#f87171';

      const isParsed = grade !== '—' || centering !== '—';

      return (
        <View style={[styles.analysisBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header */}
          <Text style={[styles.analysisHeader, { color: theme.accent }]}>◈ GRADING REPORT</Text>

          {/* Card Identification */}
          {cardId ? (
            <View style={{ backgroundColor: theme.accentMuted, borderRadius: 10, padding: 12, marginBottom: Spacing.md, borderWidth: 1, borderColor: theme.borderGlow }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 }}>{cardId}</Text>
              {gameId ? <Text style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'monospace', letterSpacing: 0.5 }}>{gameId}</Text> : null}
              <TouchableOpacity
                style={{ marginTop: 8, backgroundColor: theme.accent + '20', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.accent }}
                onPress={() => openEbaySearch(cardId)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.accent, fontFamily: 'monospace' }}>⚡ SEARCH THIS CARD</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {isParsed ? (
            <>
              {/* Grade + Confidence badges */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                <View style={[styles.gradeBadge, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}>
                  <Text style={{ fontSize: 10, color: theme.textMuted, fontFamily: 'monospace', letterSpacing: 1 }}>PREDICTED</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: theme.accent, fontFamily: 'monospace' }}>{grade}</Text>
                </View>
                <View style={[styles.confidenceBadge, { backgroundColor: confColor + '18', borderColor: confColor + '40' }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: confColor, marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: confColor, fontFamily: 'monospace' }}>
                    {confidence} CONFIDENCE
                  </Text>
                </View>
              </View>

              {/* PSA / BGS Explainer */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.md }}>
                <View style={[styles.tooltipChip, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: theme.accent, fontFamily: 'monospace' }}>PSA</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted }}>Professional Sports Authenticator · 1-10 whole number scale</Text>
                </View>
                <View style={[styles.tooltipChip, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: theme.accent, fontFamily: 'monospace' }}>BGS</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted }}>Beckett Grading · 1-10 with half-points and sub-grades</Text>
                </View>
              </View>

              {/* Attribute cards with score bars */}
              <View style={styles.attributeGrid}>
                {[
                  { label: 'CENTERING', value: centering, icon: '⊞' },
                  { label: 'CORNERS', value: corners, icon: '◤' },
                  { label: 'EDGES', value: edges, icon: '▬' },
                  { label: 'SURFACE', value: surface, icon: '◻' },
                ].map((attr) => {
                  // Parse numerical score from "[score]/10 — description"
                  const scoreMatch = attr.value.match(/^(\d+(?:\.\d+)?)\s*\/\s*10/);
                  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
                  const description = attr.value.replace(/^\d+(?:\.\d+)?\s*\/\s*10\s*[—–-]\s*/, '');
                  const barColor = score !== null
                    ? score >= 9 ? '#22c55e' : score >= 7 ? '#3b82f6' : score >= 5 ? '#f59e0b' : '#f87171'
                    : theme.textMuted;

                  return (
                    <View key={attr.label} style={[styles.attributeCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, marginRight: 6 }}>{attr.icon}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, fontFamily: 'monospace', letterSpacing: 1 }}>
                            {attr.label}
                          </Text>
                        </View>
                        {score !== null && (
                          <Text style={{ fontSize: 16, fontWeight: '900', color: barColor, fontFamily: 'monospace' }}>
                            {score}/10
                          </Text>
                        )}
                      </View>
                      {/* Score bar */}
                      {score !== null && (
                        <View style={{ height: 4, backgroundColor: theme.border, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
                          <View style={{ height: 4, width: `${(score / 10) * 100}%`, backgroundColor: barColor, borderRadius: 2 } as any} />
                        </View>
                      )}
                      <Text style={{ fontSize: 13, color: theme.textPrimary, lineHeight: 18 }}>{description || attr.value}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Summary */}
              {summary ? (
                <View style={[styles.summaryBox, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 4 }}>
                    SUMMARY
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.textPrimary, lineHeight: 20 }}>{summary}</Text>
                </View>
              ) : null}

              {/* UNDSR Slab Preview */}
              {avgScore > 0 && (() => {
                const slabGrade = Math.min(10, Math.max(1, Math.round(avgScore * 2) / 2));
                return (
                  <UNDSRSlab
                    grade={slabGrade}
                    cardName={cardId || identifiedCard?.name || undefined}
                    cardImageUri={capturedUri || undefined}
                    subGrades={[
                      { label: 'Centering', abbr: 'C', score: extractScore(centering) },
                      { label: 'Corners', abbr: 'CO', score: extractScore(corners) },
                      { label: 'Edges', abbr: 'E', score: extractScore(edges) },
                      { label: 'Surface', abbr: 'S', score: extractScore(surface) },
                    ]}
                    theme={theme}
                  />
                );
              })()}

              {/* 🔮 30-day risk forecast for the graded card (free oracle) */}
              <ForecastPanel cardName={cardId || identifiedCard?.name || null} />

              {/* Disclaimer */}
              <Text style={{ fontSize: 10, color: theme.textDim, textAlign: 'center', marginTop: Spacing.sm, fontStyle: 'italic' }}>
                AI estimate only — not a substitute for professional grading
              </Text>

              {/* Voice narration button */}
              {voiceAvailable && (
                <TouchableOpacity
                  style={[styles.retakeBtn, {
                    backgroundColor: isSpeaking ? theme.accent : theme.accentMuted,
                    borderColor: theme.borderGlow,
                    marginTop: Spacing.md,
                    opacity: isSpeaking ? 0.7 : 1,
                  }]}
                  onPress={async () => {
                    if (isSpeaking) return;
                    setIsSpeaking(true);
                    try {
                      const narration = buildGradeNarration({
                        cardName: cardId || undefined,
                        grade,
                        centering,
                        corners,
                        edges,
                        surface,
                        summary: summary || undefined,
                      });
                      await speakText(narration, selectedVoice);
                    } catch (e: any) {
                      console.warn('Voice narration failed:', e.message);
                    }
                    setIsSpeaking(false);
                  }}
                  disabled={isSpeaking}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.retakeBtnText, { color: isSpeaking ? '#fff' : theme.accent }]}>
                    {isSpeaking ? '🔊 SPEAKING...' : '🔊 LISTEN TO REPORT'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Notarize on LitVM button — hidden on iOS (App Store crypto rules: no
                  wallet-signed on-chain writes in the iOS build; desktop/web/Android keep it) */}
              {Platform.OS !== 'ios' && cardId && grade !== '—' && (
                <View style={{ marginTop: Spacing.md }}>
                  {notarizedTx ? (
                    <TouchableOpacity
                      style={[styles.retakeBtn, { backgroundColor: 'rgba(0, 220, 255, 0.1)', borderColor: '#00dcff' }]}
                      onPress={() => {
                        import('@/lib/open-url').then(({ openUrl }) => openUrl(`https://liteforge.explorer.caldera.xyz/tx/${notarizedTx}`).catch(console.error));
                      }}
                    >
                      <Text style={[styles.retakeBtnText, { color: '#00dcff' }]}>
                        ⛓️ VIEW CERTIFICATE ON LITVM
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.retakeBtn, {
                        backgroundColor: isNotarizing ? 'transparent' : 'rgba(0, 220, 255, 0.15)',
                        borderColor: '#00dcff',
                        opacity: isNotarizing ? 0.6 : 1,
                      }]}
                      onPress={async () => {
                        if (!isConnected) {
                          setWcModalVisible(true);
                          return;
                        }
                        try {
                          setIsNotarizing(true);
                          
                          // Encode the payload for the Browser Bridge
                          const payload = {
                            action: 'notarizeGrade',
                            args: [cardId, grade, "ipfs://QmPlaceholderCardHash"]
                          };
                          const jsonStr = JSON.stringify(payload);
                          const utf8Str = encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16)));
                          const b64Payload = btoa(utf8Str);
                          const bridgeUrl = `https://the-undesirables.com/bridge?action=sign&payload=${b64Payload}`;
                          
                          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                             import('@/lib/open-url').then(({ openUrl }) => openUrl(bridgeUrl).catch(console.error));
                             
                             // Listen for the return deep link from _layout.tsx
                             const onSignSuccess = (e: any) => {
                               if (e.detail && e.detail.txHash) {
                                  setNotarizedTx(e.detail.txHash);
                               }
                               setIsNotarizing(false);
                               window.removeEventListener('tcgoracle-sign', onSignSuccess);
                             };
                             window.addEventListener('tcgoracle-sign', onSignSuccess);
                          }
                        } catch (e: any) {
                          console.warn('Notarization failed:', e);
                          alert('Failed to notarize grade: ' + e.message);
                          setIsNotarizing(false);
                        }
                      }}
                      disabled={isNotarizing}
                      activeOpacity={0.7}
                    >
                      {isNotarizing ? (
                        <ActivityIndicator size="small" color="#00dcff" />
                      ) : (
                        <Text style={[styles.retakeBtnText, { color: '#00dcff' }]}>
                          {isConnected ? '⛓️ NOTARIZE GRADE ON-CHAIN' : '🔗 CONNECT WALLET TO NOTARIZE'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          ) : (
            /* Fallback: raw text while streaming or if parsing fails */
            <Text style={[styles.analysisContent, { color: theme.textPrimary }]}>
              {analysisText}
            </Text>
          )}

          {analysisLoading && (
            <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: Spacing.sm }} />
          )}
        </View>
      );
    }

    return null;
  };

  // ─── Tab visibility guard (Tauri WebKit doesn't hide inactive tabs) ───
  // (uses isFocused from line 51)
  if (Platform.OS === 'web' && !isFocused) {
    return <View style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }} />;
  }

  // ─── Permission not granted yet ───
  if (!isWeb && permission && !permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <WallpaperBackground />
      <SoulParticlesLite soul={mountedSoul} intensity="subtle" />
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

          {/* Tip */}
          <View style={[styles.proBadge, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.proText, { color: theme.accent }]}>◆ TIP</Text>
            <Text style={[styles.proDesc, { color: theme.textMuted }]}>
              All card analysis runs locally on your device — zero data leaves your phone
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Web: drag-and-drop + file picker ───
  if (isWeb) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <WallpaperBackground />
      <SoulParticlesLite soul={mountedSoul} intensity="subtle" />
        <StatusBar barStyle={theme.statusBar} />
        <ScrollView style={styles.contentBox} contentContainerStyle={{ paddingBottom: 40 }}>
          <ScreenTitle title="Scan" subtitle="Neural vision pipeline" showGear />

          {capturedUri ? (
            /* ── Preview + Analysis Result ── */
            <View>
              <View style={[styles.previewContainer, { borderColor: theme.border }]}>
                {/* eslint-disable-next-line */}
                <img
                  src={capturedUri}
                  alt="Card scan"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: 12,
                  } as any}
                />
                {/* Corner brackets on preview */}
                <View style={[styles.corner, styles.cornerTL, { borderColor: theme.accent }]} />
                <View style={[styles.corner, styles.cornerTR, { borderColor: theme.accent }]} />
                <View style={[styles.corner, styles.cornerBL, { borderColor: theme.accent }]} />
                <View style={[styles.corner, styles.cornerBR, { borderColor: theme.accent }]} />
              </View>

              {/* Analysis result or loading state */}
              {renderAnalysisResult()}

              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  style={[styles.retakeBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow, flex: 1 }]}
                  onPress={resetCapture}
                >
                  <Text style={[styles.retakeBtnText, { color: theme.accent }]}>RE-SCAN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.retakeBtn, { backgroundColor: theme.accent, borderColor: theme.accent, flex: 1, opacity: identifyLoading ? 0.6 : 1 }]}
                  onPress={handleSaveToVault}
                  disabled={identifyLoading}
                  activeOpacity={0.7}
                >
                  {identifyLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.retakeBtnText, { color: '#fff' }]}>📥 SAVE TO VAULT</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ── Drop zone ── */
            <View>
              <View
                ref={dropZoneRef as any}
                style={[
                  styles.dropZone,
                  { borderColor: isDragging ? theme.accent : theme.border,
                    backgroundColor: isDragging ? theme.accentMuted : 'transparent' },
                ]}
              >
                {/* Corner brackets */}
                <View style={[styles.corner, styles.cornerTL, { borderColor: isDragging ? theme.accent : theme.border }]} />
                <View style={[styles.corner, styles.cornerTR, { borderColor: isDragging ? theme.accent : theme.border }]} />
                <View style={[styles.corner, styles.cornerBL, { borderColor: isDragging ? theme.accent : theme.border }]} />
                <View style={[styles.corner, styles.cornerBR, { borderColor: isDragging ? theme.accent : theme.border }]} />

                <View style={styles.viewfinderCenter}>
                  <Text style={styles.cameraEmoji}>{isDragging ? '◉' : '◎'}</Text>
                  <Text style={[styles.viewfinderText, { color: isDragging ? theme.accent : theme.textSecondary }]}>
                    {isDragging ? 'Drop card image here' : 'Drag & drop a card image'}
                  </Text>
                  <Text style={[styles.viewfinderSubtext, { color: theme.textMuted }]}>
                    JPG, PNG, WebP, HEIC · 10MB max
                  </Text>
                  <TouchableOpacity
                    style={[styles.browseBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
                    onPress={async () => {
                      // Try Tauri's native file dialog first (bypasses WebKit restrictions)
                      const isTauriEnv = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
                      if (isTauriEnv) {
                        try {
                          const { open } = await import('@tauri-apps/plugin-dialog');
                          const { readFile } = await import('@tauri-apps/plugin-fs');
                          const selected = await open({
                            multiple: false,
                            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif'] }]
                          });
                          if (selected) {
                            const filePath = typeof selected === 'string' ? selected : (selected as any).path || selected;
                            const fileBytes = await readFile(filePath as string);
                            // Detect MIME type from extension
                            const ext = (filePath as string).split('.').pop()?.toLowerCase() || '';
                            const mimeMap: Record<string, string> = {
                              jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                              webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
                              bmp: 'image/bmp', gif: 'image/gif'
                            };
                            const mime = mimeMap[ext] || 'image/jpeg';
                            const blob = new Blob([fileBytes], { type: mime });
                            const file = new File([blob], `card.${ext}`, { type: mime });
                            handleFileSelected(file);
                          }
                          return;
                        } catch (e) {
                          console.warn('Tauri dialog failed, falling back to browser:', e);
                        }
                      }
                      // Browser fallback
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.style.display = 'none';
                      document.body.appendChild(input);
                      input.onchange = (ev: any) => {
                        const file = ev.target?.files?.[0];
                        if (file) handleFileSelected(file);
                        try { document.body.removeChild(input); } catch {}
                      };
                      input.addEventListener('cancel', () => {
                        try { document.body.removeChild(input); } catch {}
                      });
                      setTimeout(() => input.click(), 50);
                    }}
                  >
                    <Text style={[styles.browseBtnText, { color: theme.accent }]}>BROWSE FILES</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Feature grid */}
              <View style={styles.featuresGrid}>
                {[
                  { emoji: '◈', title: 'Vision AI', desc: 'Multimodal card analysis' },
                  { emoji: '▷', title: 'Streaming', desc: 'Results appear in real-time' },
                  { emoji: '◎', title: 'PSA · BGS · CGC', desc: 'Multi-scale prediction' },
                  { emoji: '🔗', title: isConnected ? 'Wallet Connected' : 'Connect Wallet', desc: isConnected ? 'Ready for LitVM Testnet' : 'Tap to connect WalletConnect', action: () => { if (!isConnected) setWcModalVisible(true); } },
                ].map((f, i) => (
                  <TouchableOpacity key={i} style={[styles.featureCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={f.action} activeOpacity={f.action ? 0.7 : 1}>
                    <Text style={styles.featureEmoji}>{f.emoji}</Text>
                    <Text style={[styles.featureTitle, { color: theme.textPrimary }]}>{f.title}</Text>
                    <Text style={[styles.featureDesc, { color: theme.textMuted }]}>{f.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
        {Platform.OS !== 'ios' && <WalletConnectModal visible={wcModalVisible} onClose={() => setWcModalVisible(false)} />}
      </SafeAreaView>
    );
  }

  // ─── Camera view (native iOS/Android) ───
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <WallpaperBackground />
      <SoulParticlesLite soul={mountedSoul} intensity="subtle" />
      <StatusBar barStyle="light-content" />

      {capturedUri ? (
        <ScrollView style={styles.resultBox} contentContainerStyle={{ paddingBottom: 40 }}>
          <ScreenTitle title="Scan" subtitle="Analysis complete" />

          {/* Analysis result */}
          {renderAnalysisResult()}

          <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl }}>
            <TouchableOpacity
              style={[styles.retakeBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow, flex: 1 }]}
              onPress={resetCapture}
            >
              <Text style={[styles.retakeBtnText, { color: theme.accent }]}>RE-SCAN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retakeBtn, { backgroundColor: theme.accent, borderColor: theme.accent, flex: 1, opacity: identifyLoading ? 0.6 : 1 }]}
              onPress={handleSaveToVault}
              disabled={identifyLoading}
              activeOpacity={0.7}
            >
              {identifyLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.retakeBtnText, { color: '#fff' }]}>📥 SAVE TO VAULT</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            {...{ facing: 'back' } as any}
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

  // Content (web)
  contentBox: { flex: 1, padding: Spacing.xl },

  // Viewfinder
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

  // Web drop zone
  dropZone: {
    height: 300,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderStyle: 'dashed' as any,
    marginTop: Spacing.xl,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  browseBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
  },
  browseBtnText: { fontSize: FontSizes.sm, fontWeight: '700' },
  previewContainer: {
    height: 320,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginTop: Spacing.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  retakeBtn: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  retakeBtnText: { fontSize: FontSizes.md, fontWeight: '700' },

  // Analysis result
  analysisBox: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  analysisHeader: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  analysisContent: {
    fontSize: FontSizes.sm,
    lineHeight: 22,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  analysisLoadingText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  analysisSubtext: {
    fontSize: FontSizes.xs,
    textAlign: 'center',
  },
  analysisErrorText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },

  // No engine state
  noEngineEmoji: { fontSize: 40, textAlign: 'center' },
  noEngineTitle: { fontSize: FontSizes.lg, fontWeight: '800', textAlign: 'center' },
  noEngineDesc: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20 },
  engineList: { gap: 6, marginTop: Spacing.sm },
  engineItem: { fontSize: FontSizes.xs, fontWeight: '600' },

  // Retry button
  retryBtn: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  retryBtnText: { fontSize: FontSizes.sm, fontWeight: '700' },

  // Grading report
  gradeBadge: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  attributeGrid: {
    gap: Spacing.sm,
  },
  attributeCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  summaryBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  tooltipChip: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 2,
  },
});
