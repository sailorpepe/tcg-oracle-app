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
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import ScreenTitle from '@/components/ScreenTitle';
import { ChatMessage, AVAILABLE_ENGINES, EngineId } from '@/lib/inference/engine';
import { createCloudEngine, saveEngineKey, getEngineKey, saveActiveEngine, getActiveEngine, verifyKey } from '@/lib/inference/cloud-engine';
import { buildSystemPrompt } from '@/lib/inference/context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WallpaperBackground from '@/components/WallpaperBackground';
import { useIsFocused } from '@react-navigation/native';
import { SoulProfile, getSoul } from '@/lib/soul';
import SoulDropZone from '@/components/SoulDropZone';
import SoulParticlesLite from '@/components/SoulParticlesLite';
import { speakAny, hasXAIKey, XAIVoice, XAI_VOICES } from '@/lib/xai-voice';

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

  // Soul state
  const [mountedSoul, setMountedSoul] = useState<SoulProfile | null>(null);

  // Voice state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
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

  // Load persisted soul + check voice availability
  useEffect(() => {
    getSoul().then((soul) => {
      if (soul) setMountedSoul(soul);
    });
    hasXAIKey().then(() => {}); // Warm up key check
    AsyncStorage.getItem('@tcg_oracle_voice_enabled').then(v => setVoiceEnabled(v === 'true'));
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
      const systemPrompt = await buildSystemPrompt(mountedSoul);
      const chatHistory: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages
          .slice(-10)
          .filter(m => !m.content.startsWith('⚠'))  // Don't feed error messages to the AI
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content },
      ];

      const engine = createCloudEngine(activeEngineId);
      let accumulated = '';

      await engine.generateStream(chatHistory, (token) => {
        accumulated += token;
        setStreamingContent(accumulated);
      });

      const assistantMsg: DisplayMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: accumulated || 'No response generated.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Auto-narrate if voice is enabled
      if (voiceEnabled && accumulated) {
        const voice = getVoiceForSoul(mountedSoul);
        setSpeakingId(assistantMsg.id);
        speakAny(accumulated, voice, mountedSoul)
          .then(player => { activeVoiceRef.current = player; })
          .catch(() => {})
          .finally(() => setSpeakingId(null));
      }

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
  useEffect(() => {
    if (messages.length > 0 || streamingContent) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, streamingContent]);

  // ─── Renders ───────────────────────────────

  const renderMessage = ({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    const isSpeaking = speakingId === item.id;
    return (
      <View style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.oracleBubble,
        {
          backgroundColor: isUser ? theme.accentMuted : theme.surface,
          borderColor: isUser ? theme.borderGlow : theme.border,
        }
      ]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.messageRole, { color: isUser ? theme.accent : theme.textMuted }]}>
            {isUser ? 'YOU' : 'ORACLE'}
          </Text>
          {!isUser && (
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
          )}
        </View>
        <Text style={[styles.messageText, { color: theme.textPrimary }]}>{item.content}</Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isGenerating) return null;
    return (
      <View style={[styles.messageBubble, styles.oracleBubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.messageRole, { color: theme.textMuted }]}>ORACLE</Text>
        <View style={styles.streamingRow}>
          <Text style={[styles.messageText, { color: theme.textPrimary }]}>
            {streamingContent || ''}
          </Text>
          <Animated.Text style={[styles.cursor, { color: theme.accent, opacity: cursorOpacity }]}>▌</Animated.Text>
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
                    {isLocal ? '◈' : engine.id === 'groq' ? '⚡' : engine.id === 'anthropic' ? '◆' : '⬡'}
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
                onSoulMounted={(soul) => setMountedSoul(soul)}
                onSoulUnmounted={() => setMountedSoul(null)}
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

        {/* Status Bar — tap to change engine */}
        <View style={[styles.statusBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          <TouchableOpacity onPress={() => setViewState('engines')}>
            <Text style={[styles.statusText, { color: theme.textDim }]}>
              {engineChecking
                ? '◆ Detecting engine...'
                : engineReady
                  ? `◆ ${activeEngine?.name || 'Engine'} · ${activeEngineId === 'local' ? 'On-Device · 0 data sent' : activeEngineId === 'ollama' ? 'Local Server · 0 data sent' : 'Cloud'}${mountedSoul ? ` · ${mountedSoul.name}` : ''} · tap to change`
                  : '◆ No engine · tap to configure'}
            </Text>
          </TouchableOpacity>
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
  chatList: { paddingBottom: 8 },
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
});
