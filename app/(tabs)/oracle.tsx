import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
  TextInput,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import ScreenTitle from '@/components/ScreenTitle';
import { ChatMessage, AVAILABLE_ENGINES, EngineId } from '@/lib/inference/engine';
import { createCloudEngine, saveEngineKey, getEngineKey, saveActiveEngine, getActiveEngine, verifyKey } from '@/lib/inference/cloud-engine';
import { buildSystemPrompt, SessionMeta } from '@/lib/inference/context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WallpaperBackground from '@/components/WallpaperBackground';
import { useIsFocused } from '@react-navigation/native';
import { SoulProfile, getSoul } from '@/lib/soul';
import SoulDropZone from '@/components/SoulDropZone';
import SoulParticlesLite from '@/components/SoulParticlesLite';
import { speakAny, hasXAIKey, XAIVoice, XAI_VOICES, SentenceStreamTTS } from '@/lib/xai-voice';
import { saveSession, loadSession, archiveSession, clearSession } from '@/lib/chat-memory';
import { getAllTracked } from '@/lib/oracle-memory';
import { fetchLitVMPrices } from '@/lib/api';
import { getPredictionStats, gradePredictions, logPrediction } from '@/lib/prediction-ledger';
import { updateSoul as updateAmbientSoul } from '@/lib/ambient-engine';
import SoulAvatar from '@/components/SoulAvatar';

type ViewState = 'chat' | 'engines' | 'connect';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const SUGGESTED_PROMPTS = [
  'Analyze my Vault portfolio',
  'What should I grade next?',
  'Which TCG has the best ROI?',
  'Compare Pokémon vs Magic investing',
];

export default function OracleScreen() {
  const { theme } = useTheme();

  // View state — always starts on chat, never a wall
  const [viewState, setViewState] = useState<ViewState>('chat');

  // Engine state
  const [activeEngineId, setActiveEngineId] = useState<EngineId>('ollama');
  const [engineReady, setEngineReady] = useState(false);
  const [engineChecking, setEngineChecking] = useState(true);
  const [connectingEngine, setConnectingEngine] = useState<EngineId | null>(null);
  const [connectKey, setConnectKey] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connectVerifying, setConnectVerifying] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // Session tracking — ephemeral, lives in memory only
  const sessionStartRef = useRef(Date.now());
  const messageCountRef = useRef(0);

  // Soul state
  const [mountedSoul, setMountedSoul] = useState<SoulProfile | null>(null);

  // Voice state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Memory state
  const [trackedCards, setTrackedCards] = useState<{ query: string; lastPrice: number; dataPoints: number }[]>([]);
  const [predictionAccuracy, setPredictionAccuracy] = useState<{ accuracy: number; total: number; graded: number } | null>(null);
  const [memoryLoaded, setMemoryLoaded] = useState(false);

  // Ollama model selection
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string | null>(null);
  const [ollamaModelLoading, setOllamaModelLoading] = useState(false);
  const activeVoiceRef = useRef<{ stop: () => void } | null>(null);

  /**
   * OCEAN → xAI Voice Mapping
   * Maps Big Five personality scores to the best-fitting xAI voice.
   */
  function getVoiceForSoul(soul: SoulProfile | null): XAIVoice {
    if (!soul) return 'eve'; // Default Oracle voice
    // High extraversion + low neuroticism → bold Leo
    if (soul.extraversion > 70 && soul.neuroticism < 50) return 'leo';
    // Low agreeableness → commanding Rex (the contrarian)
    if (soul.agreeableness < 30) return 'rex';
    // High agreeableness + high openness → warm Ara
    if (soul.agreeableness > 60 && soul.openness > 60) return 'ara';
    // High conscientiousness → steady Sal (the stoic)
    if (soul.conscientiousness > 70) return 'sal';
    // High neuroticism → expressive Eve
    if (soul.neuroticism > 70) return 'eve';
    // Default fallback
    return 'eve';
  }

  // Load persisted soul + check voice availability + load chat memory
  useEffect(() => {
    getSoul().then((soul) => {
      if (soul) setMountedSoul(soul);
    });
    hasXAIKey().then(() => {}); // Warm up key check
    AsyncStorage.getItem('@tcg_oracle_voice_enabled').then(v => setVoiceEnabled(v === 'true'));
    AsyncStorage.getItem('@tcg_oracle_ollama_model').then(m => { if (m) setSelectedOllamaModel(m); });

    // Phase 1: Load previous chat session
    loadSession().then(saved => {
      if (saved.length > 0) {
        setMessages(saved as DisplayMessage[]);
      }
      setMemoryLoaded(true);
    });

    // Phase 2: Load tracked cards for watchlist
    getAllTracked().then(tracked => {
      setTrackedCards(tracked.slice(0, 8)); // Show top 8
    });

    // Phase 3: Grade pending predictions + load stats
    gradePredictions().then(() => {
      getPredictionStats().then(stats => {
        if (stats.total > 0) {
          setPredictionAccuracy({
            accuracy: stats.accuracy,
            total: stats.total,
            graded: stats.correct + stats.incorrect,
          });
        }
      });
    });

    // Archive session on unmount
    return () => {
      // Use a ref-safe snapshot to archive
    };
  }, []);

  // Blinking cursor animation
  useEffect(() => {
    if (!isGenerating) return;
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [isGenerating]);

  // ─── Auto-detect engine on mount ──────────
  // Priority: 1) Saved engine if ready, 2) Ollama on localhost, 3) Not ready (inline hint)
  useEffect(() => {
    (async () => {
      setEngineChecking(true);

      // Check if disclaimer has been accepted
      const accepted = await AsyncStorage.getItem('@tcg_oracle_disclaimer_accepted');
      if (!accepted) setShowDisclaimer(true);

      // 1. Check if user has a saved engine that still works
      const stored = await getActiveEngine();
      if (stored && stored !== 'local') {
        const engine = createCloudEngine(stored);
        const ready = await engine.isReady();
        if (ready) {
          setActiveEngineId(stored);
          setEngineReady(true);
          setEngineChecking(false);
          return;
        }
      }

      // 2. Auto-detect Ollama on localhost (desktop users likely have it running)
      try {
        const ollamaResp = await fetch('http://localhost:11434/api/tags', {
          signal: AbortSignal.timeout(2000),
        });
        if (ollamaResp.ok) {
          // Ollama is running! Save it and go
          await saveEngineKey('ollama', 'http://localhost:11434');
          await saveActiveEngine('ollama');
          setActiveEngineId('ollama');
          setEngineReady(true);
          setEngineChecking(false);
          return;
        }
      } catch {
        // Ollama not running — that's fine, continue
      }

      // 3. No engine found — still show chat (with inline hint)
      setEngineReady(false);
      setEngineChecking(false);
    })();
  }, []);

  // ─── Prediction Auto-Detection ────────────────
  // Scans AI responses for price prediction patterns and auto-logs to ledger
  const detectAndLogPredictions = (response: string, userQuery: string) => {
    try {
      // Extract card name from user query or response
      const cardMatch = response.match(/(?:CARD:|for\s+)([A-Z][\w\s\-']+(?:#\d+)?)/i);
      const cardName = cardMatch?.[1]?.trim() || userQuery.slice(0, 60);

      // Pattern: "will rise/increase/go up" or "will drop/decrease/fall"
      const bullish = /\b(?:will\s+(?:rise|increase|go\s+up|appreciate|climb)|bullish\s+on|upside\s+potential|expect(?:ing)?\s+(?:growth|gains))\b/i;
      const bearish = /\b(?:will\s+(?:drop|decrease|fall|decline|go\s+down)|bearish\s+on|downside\s+risk|expect(?:ing)?\s+(?:a\s+)?(?:drop|decline|correction))\b/i;
      const stable = /\b(?:hold\s+steady|remain\s+stable|stay\s+(?:flat|around)|sideways|plateau)\b/i;

      // Pattern: explicit price target "$X" (future predicted price)
      const priceTarget = response.match(/(?:target|expect|predict|reach|worth|hit)\s*(?:around|about|of)?\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i);

      // Pattern: current price "$X" (what the card is trading at NOW)
      const currentPrice = response.match(/(?:currently|trading\s+at|priced\s+at|valued\s+at|worth\s+about|around|sits\s+at|going\s+for)\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i);

      // Pattern: timeframe extraction (e.g., "in 6 months", "within 30 days", "over the next year")
      const timeMatch = response.match(/(?:in|within|over\s+the\s+next|next)\s+(\d+)\s*(day|week|month|year)s?\b/i);
      let timeframeDays = 30; // default
      if (timeMatch) {
        const num = parseInt(timeMatch[1], 10);
        const unit = timeMatch[2].toLowerCase();
        if (unit === 'day') timeframeDays = num;
        else if (unit === 'week') timeframeDays = num * 7;
        else if (unit === 'month') timeframeDays = num * 30;
        else if (unit === 'year') timeframeDays = num * 365;
      }

      let direction: 'up' | 'down' | 'stable' | null = null;
      if (bullish.test(response)) direction = 'up';
      else if (bearish.test(response)) direction = 'down';
      else if (stable.test(response)) direction = 'stable';

      if (direction) {
        const target = priceTarget ? parseFloat(priceTarget[1].replace(/,/g, '')) : undefined;
        const current = currentPrice ? parseFloat(currentPrice[1].replace(/,/g, '')) : 0;
        logPrediction({
          cardName,
          direction,
          priceAtPrediction: current,
          targetPrice: target,
          timeframeDays,
          reasoning: `Auto-detected from Oracle response. User asked: "${userQuery.slice(0, 80)}"`,
        });
      }
    } catch { /* Silent — never break chat for prediction logging */ }
  };

  // ─── Send Message ──────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const raw = (text || inputText).trim();
    if (!raw || isGenerating) return;

    // Security: rate limit (2s cooldown)
    if (Date.now() - lastSentAt < 2000) return;
    setLastSentAt(Date.now());

    // Security: message length cap
    const content = Array.from(raw).slice(0, 2000).join(''); // Unicode-safe truncation

    // If no engine, show the engines view instead
    if (!engineReady) {
      setViewState('engines');
      return;
    }

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsGenerating(true);
    setStreamingContent('');

    try {
      messageCountRef.current += 1;
      const sessionMeta: SessionMeta = {
        startedAt: sessionStartRef.current,
        messageCount: messageCountRef.current,
      };
      const systemPrompt = await buildSystemPrompt(mountedSoul, sessionMeta);
      // Inject LitVM on-chain context if card is tracked
      let augmentedContent = content;
      try {
        const litvmData = await fetchLitVMPrices();
        const matchedCard = litvmData.find(p => content.toLowerCase().includes(p.name.toLowerCase().split(' ').slice(0, 2).join(' ')));
        if (matchedCard) {
          augmentedContent += `\n\n[SYSTEM ORACLE DATA: The LitVM LiteForge on-chain oracle verifies Market Price at $${matchedCard.marketPrice.toFixed(2)} and Low Price at $${matchedCard.lowPrice.toFixed(2)}. This is immutable blockchain data. Incorporate this naturally as a Web3-verified price comparison.]`;
        }
      } catch { /* Silent fail, never block chat */ }

      const chatHistory: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages
          .slice(-10)
          .filter(m => !m.content.startsWith('⚠'))  // Don't feed error messages to the AI
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: augmentedContent },
      ];

      const engine = createCloudEngine(activeEngineId);
      let accumulated = '';

      // ── Sentence-Level TTS Pipeline ──
      // Instead of waiting for the full response, stream audio sentence-by-sentence.
      // First sentence plays within ~2s instead of waiting 8-15s for full response.
      let streamTTS: SentenceStreamTTS | null = null;
      if (voiceEnabled) {
        const voice = getVoiceForSoul(mountedSoul);
        const useXAI = await hasXAIKey();
        streamTTS = new SentenceStreamTTS(voice, mountedSoul, useXAI);
        activeVoiceRef.current = streamTTS;
      }

      await engine.generateStream(chatHistory, (token) => {
        accumulated += token;
        setStreamingContent(accumulated);
        // Feed each token to the sentence detector
        streamTTS?.feed(token);
      });

      // Flush any remaining buffered text to TTS
      streamTTS?.flush();

      const assistantMsg: DisplayMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: accumulated || 'No response generated.',
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const updated = [...prev, assistantMsg];
        // Phase 1: Auto-save session after each message
        saveSession(updated);
        archiveSession(updated);
        return updated;
      });

      // Set speaking indicator (streaming TTS is already playing by now)
      if (voiceEnabled && accumulated) {
        setSpeakingId(assistantMsg.id);
        // Clear speaking indicator when TTS queue drains
        // (a simple timeout since the queue will finish naturally)
        const checkDone = setInterval(() => {
          if (!streamTTS || (streamTTS as any).stopped || (!(streamTTS as any).playing && (streamTTS as any).queue.length === 0)) {
            clearInterval(checkDone);
            setSpeakingId(null);
            activeVoiceRef.current = null;
          }
        }, 500);
      }

      // Phase 5: Auto-detect predictions in AI responses
      detectAndLogPredictions(accumulated, content);

    } catch (error: any) {
      const errorMsg: DisplayMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠ ${error?.message || 'Inference failed. Check your engine configuration.'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setIsGenerating(false);
    setStreamingContent('');
  }, [inputText, messages, activeEngineId, isGenerating, engineReady, mountedSoul]);

  // ─── Connect Engine ──────────────────────────
  const handleConnect = async () => {
    if (!connectingEngine || !connectKey.trim()) return;
    setConnectVerifying(true);
    setConnectError('');

    const result = await verifyKey(connectingEngine, connectKey.trim());

    if (result.valid) {
      await saveEngineKey(connectingEngine, connectKey.trim());
      await saveActiveEngine(connectingEngine);
      setActiveEngineId(connectingEngine);

      // If Ollama, fetch available models and let user pick
      if (connectingEngine === 'ollama') {
        setOllamaModelLoading(true);
        try {
          const tagsResp = await fetch(`${connectKey.trim()}/api/tags`, { signal: AbortSignal.timeout(3000) });
          if (tagsResp.ok) {
            const tagsData = await tagsResp.json();
            const models: string[] = (tagsData.models || []).map((m: any) => m.name);
            if (models.length > 0) {
              setOllamaModels(models);
              // Load previously saved model preference
              const savedModel = await AsyncStorage.getItem('@tcg_oracle_ollama_model');
              setSelectedOllamaModel(savedModel && models.includes(savedModel) ? savedModel : models[0]);
              setOllamaModelLoading(false);
              setEngineReady(true);
              setConnectVerifying(false);
              return; // Stay on connect view to show model picker
            }
          }
        } catch {} 
        setOllamaModelLoading(false);
      }

      setEngineReady(true);
      setViewState('chat');
      setConnectKey('');
      setConnectingEngine(null);
    } else {
      setConnectError(result.error || 'Verification failed');
    }
    setConnectVerifying(false);
  };

  const handleSelectEngine = async (id: EngineId) => {
    if (id === 'local') {
      if (Platform.OS === 'web') {
        // On web, suggest Ollama instead
        setConnectingEngine('ollama');
        setConnectKey('http://localhost:11434');
        setConnectError('');
        setViewState('connect');
        return;
      }
      setActiveEngineId('local');
      await saveActiveEngine('local');
      setEngineReady(true);
      setViewState('chat');
    } else {
      setConnectingEngine(id);
      setConnectKey(id === 'ollama' ? 'http://localhost:11434' : '');
      setConnectError('');
      setViewState('connect');
    }
  };

  // ─── Scroll to bottom ──────────────────────
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (messages.length > 0 || streamingContent) {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: !streamingContent });
      }, 300); // Throttled to prevent layout jank
    }
  }, [messages, streamingContent]);

  // ─── Renders ───────────────────────────────

  const renderMessage = ({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    const isSpeaking = speakingId === item.id;

    if (isUser) {
      return (
        <View style={[
          styles.messageBubble,
          styles.userBubble,
          { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }
        ]}>
          <Text style={[styles.messageRole, { color: theme.accent }]}>YOU</Text>
          <Text style={[styles.messageText, { color: theme.textPrimary }]}>{item.content}</Text>
        </View>
      );
    }

    // Oracle message — avatar + bubble
    return (
      <View style={styles.oracleRow}>
        <View style={styles.avatarColumn}>
          <SoulAvatar soul={mountedSoul} size={30} />
        </View>
        <View style={[
          styles.messageBubble,
          styles.oracleBubble,
          { backgroundColor: theme.surface, borderColor: theme.border, flex: 1 }
        ]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.messageRole, { color: theme.textMuted }]}>
              {mountedSoul ? mountedSoul.name.toUpperCase() : 'ORACLE'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (isSpeaking && activeVoiceRef.current) {
                  activeVoiceRef.current.stop();
                  activeVoiceRef.current = null;
                  setSpeakingId(null);
                } else {
                  const voice = getVoiceForSoul(mountedSoul);
                  setSpeakingId(item.id);
                  speakAny(item.content, voice, mountedSoul)
                    .then(player => { activeVoiceRef.current = player; })
                    .catch(() => {})
                    .finally(() => setSpeakingId(null));
                }
              }}
              activeOpacity={0.6}
              style={{ padding: 4 }}
            >
              <Text style={{ fontSize: 14, color: isSpeaking ? theme.accent : theme.textMuted }}>
                {isSpeaking ? '⏹' : '🔊'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.messageText, { color: theme.textPrimary }]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isGenerating) return null;
    return (
      <View style={styles.oracleRow}>
        <View style={styles.avatarColumn}>
          <SoulAvatar soul={mountedSoul} size={30} />
        </View>
        <View style={[styles.messageBubble, styles.oracleBubble, { backgroundColor: theme.surface, borderColor: theme.border, flex: 1 }]}>
          <Text style={[styles.messageRole, { color: theme.textMuted }]}>
            {mountedSoul ? mountedSoul.name.toUpperCase() : 'ORACLE'}
          </Text>
          <View style={styles.streamingRow}>
            <Text style={[styles.messageText, { color: theme.textPrimary }]}>
              {streamingContent || ''}
            </Text>
            <Animated.Text style={[styles.cursor, { color: theme.accent, opacity: cursorOpacity }]}>▌</Animated.Text>
          </View>
        </View>
      </View>
    );
  };

  const activeEngine = AVAILABLE_ENGINES.find(e => e.id === activeEngineId);

  // ─── Tab visibility guard (Tauri WebKit doesn't hide inactive tabs) ───
  const isFocused = useIsFocused();
  if (Platform.OS === 'web' && !isFocused) {
    return <View style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }} />;
  }

  // ─── Engines View (overlay, not a wall) ────
  if (viewState === 'engines') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <WallpaperBackground />
        <StatusBar barStyle={theme.statusBar} />
        <ScrollView style={styles.enginesContainer} contentContainerStyle={styles.enginesContent}>
          <TouchableOpacity onPress={() => setViewState('chat')} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: theme.accent }]}>← BACK TO CHAT</Text>
          </TouchableOpacity>

          <ScreenTitle title="Engines" subtitle="Choose your AI provider" />

          {AVAILABLE_ENGINES.map(engine => {
            const isLocal = engine.id === 'local';
            const isActive = engine.id === activeEngineId && engineReady;
            const disabled = isLocal && Platform.OS === 'web';
            return (
              <TouchableOpacity
                key={engine.id}
                style={[
                  styles.engineCard,
                  { backgroundColor: theme.surface, borderColor: isActive ? theme.accent : theme.border },
                  disabled && { opacity: 0.4 },
                ]}
                activeOpacity={disabled ? 1 : 0.7}
                onPress={() => !disabled && handleSelectEngine(engine.id)}
              >
                <View style={styles.engineCardContent}>
                  <Text style={[styles.engineIcon, { color: isActive ? theme.accent : theme.textMuted }]}>
                    {engine.id === 'groq' ? '⚡' : engine.id === 'xai' ? '✦' : engine.id === 'openai' ? '◉' : engine.id === 'anthropic' ? '◆' : engine.id === 'ollama' ? '⬡' : '◈'}
                  </Text>
                  <View style={styles.engineInfo}>
                    <View style={styles.engineNameRow}>
                      <Text style={[styles.engineName, { color: theme.textPrimary }]}>{engine.name}</Text>
                      {isActive && (
                        <View style={[styles.activeBadge, { backgroundColor: theme.accentMuted }]}>
                          <Text style={[styles.activeBadgeText, { color: theme.accent }]}>ACTIVE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.engineDesc, { color: theme.textMuted }]}>{engine.description}</Text>
                  </View>
                  <Text style={[styles.engineArrow, { color: theme.textMuted }]}>→</Text>
                </View>
                {engine.id === 'groq' && (
                  <View style={[styles.freeBadge, { backgroundColor: theme.accentMuted }]}>
                    <Text style={[styles.freeBadgeText, { color: theme.accent }]}>FREE TIER</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Connect View ─────────────────────────
  if (viewState === 'connect' && connectingEngine) {
    const engineConfig = AVAILABLE_ENGINES.find(e => e.id === connectingEngine)!;
    const isOllama = connectingEngine === 'ollama';
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <WallpaperBackground />
        <StatusBar barStyle={theme.statusBar} />
        <ScrollView style={styles.enginesContainer} contentContainerStyle={styles.enginesContent}>
          <TouchableOpacity onPress={() => setViewState('engines')} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: theme.accent }]}>← BACK</Text>
          </TouchableOpacity>

          <ScreenTitle
            title={engineConfig.name}
            subtitle={isOllama ? 'Connect to your local server' : 'Enter your API key'}
          />

          <View style={styles.connectForm}>
            <TextInput
              style={[styles.keyInput, { color: theme.textPrimary, backgroundColor: theme.surface, borderColor: theme.border }]}
              placeholder={engineConfig.keyPlaceholder || 'Enter key...'}
              placeholderTextColor={theme.textDim}
              value={connectKey}
              onChangeText={setConnectKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!isOllama}
            />

            {engineConfig.keyHint && (
              <Text style={[styles.keyHint, { color: theme.textMuted }]}>{engineConfig.keyHint}</Text>
            )}

            {/* Step-by-step instructions */}
            {engineConfig.setupSteps && engineConfig.setupSteps.length > 0 && (
              <View style={[styles.stepsContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.stepsTitle, { color: theme.textMuted }]}>
                  {isOllama ? 'HOW TO SET UP' : 'HOW TO GET YOUR KEY'}
                </Text>
                {engineConfig.setupSteps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={[styles.stepNumber, { color: theme.accent }]}>{i + 1}</Text>
                    <Text style={[styles.stepText, { color: theme.textSecondary }]}>{step}</Text>
                  </View>
                ))}
              </View>
            )}

            {connectError ? (
              <Text style={[styles.connectErrorText, { color: '#ff4444' }]}>{connectError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.verifyBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
              onPress={handleConnect}
              disabled={connectVerifying || !connectKey.trim()}
              activeOpacity={0.7}
            >
              {connectVerifying ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Text style={[styles.verifyBtnText, { color: theme.accent }]}>
                  {isOllama ? 'TEST CONNECTION' : 'VERIFY & SAVE'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={[styles.securityNote, { borderColor: theme.border }]}>
              <Text style={[styles.securityIcon]}>⬡</Text>
              <Text style={[styles.securityText, { color: theme.textMuted }]}>
                {isOllama
                  ? 'Connection stays on your local network. No data leaves your WiFi.'
                  : 'Key stored in device secure storage. Never transmitted to our servers.'}
              </Text>
            </View>

            {/* Ollama model picker — shown after successful connection */}
            {isOllama && ollamaModels.length > 0 && (
              <View style={[styles.stepsContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.stepsTitle, { color: theme.textMuted }]}>INSTALLED MODELS</Text>
                <Text style={[styles.keyHint, { color: theme.textDim, marginBottom: Spacing.sm }]}>
                  Tap to select which model the Oracle uses
                </Text>
                {ollamaModels.map((model) => {
                  const isSelected = model === selectedOllamaModel;
                  return (
                    <TouchableOpacity
                      key={model}
                      style={[
                        styles.modelCard,
                        {
                          backgroundColor: isSelected ? theme.accentMuted : 'transparent',
                          borderColor: isSelected ? theme.accent : theme.border,
                        },
                      ]}
                      onPress={async () => {
                        setSelectedOllamaModel(model);
                        await AsyncStorage.setItem('@tcg_oracle_ollama_model', model);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.modelName, { color: isSelected ? theme.accent : theme.textPrimary }]}>
                        {isSelected ? '◆ ' : '○ '}{model}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.verifyBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow, marginTop: Spacing.md }]}
                  onPress={() => setViewState('chat')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.verifyBtnText, { color: theme.accent }]}>START CHATTING →</Text>
                </TouchableOpacity>
              </View>
            )}

            {isOllama && ollamaModelLoading && (
              <View style={{ alignItems: 'center', padding: Spacing.lg }}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={[styles.keyHint, { color: theme.textMuted, marginTop: Spacing.sm }]}>
                  Detecting installed models...
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Chat View (ALWAYS the default) ────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <WallpaperBackground />
      <SoulParticlesLite
        soul={mountedSoul}
        intensity={messages.length === 0 ? 'vivid' : 'subtle'}
      />
      <StatusBar barStyle={theme.statusBar} />

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatList}
          ListFooterComponent={renderFooter}
          ListHeaderComponent={
            <View style={styles.chatHeader}>
              <ScreenTitle title="Oracle" subtitle={mountedSoul ? `Soul: ${mountedSoul.name}` : 'AI-powered card analysis'} />

              {/* Soul Drop Zone — always visible in header */}
              <SoulDropZone
                soul={mountedSoul}
                onSoulMounted={(soul) => { setMountedSoul(soul); updateAmbientSoul(soul); }}
                onSoulUnmounted={() => { setMountedSoul(null); updateAmbientSoul(null); }}
              />

              {/* Empty state — always in chat, never a wall */}
              {messages.length === 0 && !isGenerating && (
                <View style={styles.emptyState}>
                  {engineChecking ? (
                    <>
                      <ActivityIndicator size="large" color={theme.accent} />
                      <Text style={[styles.emptySubtitle, { color: theme.textMuted, marginTop: Spacing.md }]}>
                        Detecting AI engine...
                      </Text>
                    </>
                  ) : engineReady ? (
                    <>
                      <Text style={[styles.emptyIcon]}>◈</Text>
                      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>ORACLE READY</Text>
                      <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                        Connected to {activeEngine?.name || 'AI engine'}. Ask anything about TCG markets.
                      </Text>

                      {/* Phase 3: Prediction accuracy badge */}
                      {predictionAccuracy && predictionAccuracy.graded > 0 && (
                        <View style={[styles.predictionBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                          <Text style={[styles.predictionBadgeText, { color: theme.accent }]}>
                            🎯 Oracle Accuracy: {predictionAccuracy.accuracy}% ({predictionAccuracy.graded} graded)
                          </Text>
                        </View>
                      )}

                      <View style={styles.suggestedPrompts}>
                        {SUGGESTED_PROMPTS.map((prompt, i) => (
                          <TouchableOpacity
                            key={i}
                            style={[styles.promptPill, { backgroundColor: theme.surface, borderColor: theme.border }]}
                            onPress={() => sendMessage(prompt)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.promptText, { color: theme.textSecondary }]}>{prompt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Phase 2: Tracked cards watchlist */}
                      {trackedCards.length > 0 && (
                        <View style={styles.watchlistSection}>
                          <Text style={[styles.watchlistTitle, { color: theme.textMuted }]}>ORACLE MEMORY — TRACKED CARDS</Text>
                          {trackedCards.map((card, i) => (
                            <TouchableOpacity
                              key={i}
                              style={[styles.watchlistCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                              onPress={() => sendMessage(`What's the market outlook for ${card.query}?`)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.watchlistName, { color: theme.textPrimary }]} numberOfLines={1}>
                                  {card.query}
                                </Text>
                                <Text style={[styles.watchlistMeta, { color: theme.textDim }]}>
                                  {card.dataPoints} data points
                                </Text>
                              </View>
                              <Text style={[styles.watchlistPrice, { color: theme.accent }]}>
                                ${card.lastPrice.toFixed(2)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={[styles.emptyIcon]}>◈</Text>
                      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>CONNECT AN ENGINE</Text>
                      <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                        {Platform.OS === 'web'
                          ? 'Install Ollama on this computer for instant AI chat, or connect a cloud provider.'
                          : 'Download the AI model to chat on-device, or connect a cloud provider.'}
                      </Text>

                      {/* Quick action buttons — not a wall, just helpful shortcuts */}
                      <View style={styles.quickActions}>
                        <TouchableOpacity
                          style={[styles.quickActionBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
                          onPress={() => Linking.openURL('https://ollama.com')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.quickActionText, { color: theme.accent }]}>⬡ GET OLLAMA (FREE)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.quickActionBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          onPress={() => setViewState('engines')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.quickActionText, { color: theme.textSecondary }]}>◈ CHOOSE PROVIDER</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          }
        />

        {/* Input Bar — always visible */}
        <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.chatInput, { color: theme.textPrimary }]}
            placeholder={engineReady ? 'Ask Oracle...' : 'Connect an engine to start...'}
            placeholderTextColor={theme.textDim}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => sendMessage()}
            editable={!isGenerating}
            multiline={false}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: theme.accentMuted }]}
            onPress={() => sendMessage()}
            disabled={isGenerating || !inputText.trim()}
            activeOpacity={0.7}
          >
            <Text style={[styles.sendBtnText, { color: theme.accent }]}>▷</Text>
          </TouchableOpacity>
        </View>

        {/* Status Bar — tap to change engine, clear chat */}
        <View style={[styles.statusBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={() => setViewState('engines')} style={{ flex: 1 }}>
              <Text style={[styles.statusText, { color: theme.textDim }]}>
                {engineChecking
                  ? '◆ Detecting engine...'
                  : engineReady
                    ? `◆ ${activeEngine?.name || 'Engine'} · ${activeEngineId === 'local' ? 'On-Device · 0 data sent' : activeEngineId === 'ollama' ? `${selectedOllamaModel || 'Local'} · 0 data sent` : 'Cloud'}${mountedSoul ? ` · ${mountedSoul.name}` : ''}`
                    : '◆ No engine · tap to configure'}
              </Text>
            </TouchableOpacity>
            {messages.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  // Web doesn't support Alert.alert — use window.confirm fallback
                  if (Platform.OS === 'web') {
                    if (window.confirm(`Clear chat? (${messages.length} messages will be archived)`)) {
                      archiveSession(messages).then(() => clearSession()).then(() => {
                        setMessages([]);
                        sessionStartRef.current = Date.now();
                        messageCountRef.current = 0;
                      });
                    }
                  } else {
                    Alert.alert(
                      'Clear Chat',
                      `Archive and clear ${messages.length} messages?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clear', style: 'destructive', onPress: async () => {
                            await archiveSession(messages);
                            await clearSession();
                            setMessages([]);
                            sessionStartRef.current = Date.now();
                            messageCountRef.current = 0;
                          }
                        },
                      ]
                    );
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 4,
                  gap: 4,
                  borderRadius: 6,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                }}
                activeOpacity={0.6}
              >
                <Text style={{ fontSize: 12, color: theme.textDim }}>🗑</Text>
                <Text style={{ fontSize: 9, color: theme.textDim, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' as const }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* One-time disclaimer modal */}
      {showDisclaimer && (
        <View style={[styles.disclaimerOverlay]}>
          <View style={[styles.disclaimerModal, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.disclaimerIcon]}>◈</Text>
            <Text style={[styles.disclaimerTitle, { color: theme.textPrimary }]}>BEFORE YOU BEGIN</Text>

            <Text style={[styles.disclaimerBody, { color: theme.textSecondary }]}>
              Oracle is an AI-powered assistant for educational and entertainment purposes only. It does not provide financial, investment, or legal advice.
            </Text>

            <Text style={[styles.disclaimerBody, { color: theme.textSecondary }]}>
              Card valuations and market analysis are estimates based on AI model training data and may not reflect current market prices. Always verify with official sources before making purchasing decisions.
            </Text>

            <Text style={[styles.disclaimerBody, { color: theme.textSecondary }]}>
              Your conversations are processed on-device or via your chosen provider. We do not store, transmit, or analyze your chat data.
            </Text>

            <TouchableOpacity
              style={[styles.disclaimerBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
              onPress={async () => {
                await AsyncStorage.setItem('@tcg_oracle_disclaimer_accepted', 'true');
                setShowDisclaimer(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.disclaimerBtnText, { color: theme.accent }]}>I UNDERSTAND</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chatContainer: { flex: 1 },

  // Chat
  chatList: { paddingBottom: 80 },
  chatHeader: { paddingBottom: 8 },

  // Messages
  messageBubble: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxWidth: '88%',
  },
  userBubble: { alignSelf: 'flex-end' },
  oracleBubble: { alignSelf: 'flex-start' },
  oracleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: Spacing.sm,
    marginVertical: Spacing.xs,
    maxWidth: '92%',
    gap: 8,
  },
  avatarColumn: {
    paddingTop: 8,
  },
  messageRole: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  messageText: {
    fontSize: FontSizes.md,
    lineHeight: 22,
  },
  streamingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  cursor: { fontSize: FontSizes.md, marginLeft: 1 },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  chatInput: {
    flex: 1,
    fontSize: FontSizes.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: { fontSize: 18, fontWeight: '800' },

  // Status
  statusBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  statusText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  emptyIcon: { fontSize: 48, opacity: 0.3, marginBottom: Spacing.md },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  emptySubtitle: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  suggestedPrompts: {
    marginTop: Spacing.xxl,
    gap: Spacing.sm,
    width: '100%',
  },
  promptPill: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  promptText: { fontSize: FontSizes.sm, textAlign: 'center' },

  // Quick actions (inline, not a wall)
  quickActions: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
    width: '100%',
  },
  quickActionBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickActionText: {
    fontSize: FontSizes.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Engines view
  enginesContainer: { flex: 1 },
  enginesContent: { padding: Spacing.xl, paddingBottom: 40 },
  engineCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  engineCardContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  engineIcon: { fontSize: 24 },
  engineInfo: { flex: 1 },
  engineNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  engineName: { fontSize: FontSizes.md, fontWeight: '800' },
  engineDesc: { fontSize: FontSizes.xs, marginTop: 2 },
  engineArrow: { fontSize: FontSizes.lg },
  activeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.sm,
  },
  activeBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  freeBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottomLeftRadius: BorderRadius.md,
  },
  freeBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  // Connect view
  backBtn: { marginBottom: Spacing.lg },
  backBtnText: { fontSize: FontSizes.md, fontWeight: '700' },
  connectForm: { marginTop: Spacing.lg, gap: Spacing.md },
  keyInput: {
    fontSize: FontSizes.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  keyHint: { fontSize: FontSizes.xs, marginTop: -4 },
  connectErrorText: { fontSize: FontSizes.sm },
  verifyBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  verifyBtnText: { fontSize: FontSizes.sm, fontWeight: '800', letterSpacing: 1 },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    marginTop: Spacing.lg,
  },
  securityIcon: { fontSize: 16, opacity: 0.4 },
  securityText: { fontSize: FontSizes.xs, flex: 1, lineHeight: 16 },

  // Setup steps
  stepsContainer: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  stepsTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  stepNumber: {
    fontSize: FontSizes.md,
    fontWeight: '900',
    width: 20,
    textAlign: 'center',
  },
  stepText: {
    fontSize: FontSizes.sm,
    flex: 1,
    lineHeight: 20,
  },

  // Disclaimer modal
  disclaimerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    zIndex: 100,
  },
  disclaimerModal: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xxl,
    maxWidth: 400,
    width: '100%',
  },
  disclaimerIcon: { fontSize: 36, opacity: 0.3, textAlign: 'center', marginBottom: Spacing.md },
  disclaimerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  disclaimerBody: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  disclaimerBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  disclaimerBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Phase 2: Watchlist
  watchlistSection: {
    marginTop: Spacing.lg,
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  watchlistTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  watchlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  watchlistName: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  watchlistMeta: {
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  watchlistPrice: {
    fontSize: FontSizes.md,
    fontWeight: '800',
    marginLeft: Spacing.sm,
  },

  // Phase 3: Prediction Badge
  predictionBadge: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  predictionBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Ollama model picker
  modelCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  modelName: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
