# TCG Oracle

Cross-platform market intelligence for Pokémon, Magic: The Gathering, Yu-Gi-Oh!, and One Piece trading cards.

Built with React Native (Expo). Runs on iOS, Android, and Web. Zero telemetry — all data stays on your device.

<p align="center">
  <img src="docs/index-tab.png" width="250" alt="Index — cross-system card search" />
  &nbsp;&nbsp;
  <img src="docs/oracle-tab.png" width="250" alt="Oracle — AI chat with market context" />
  &nbsp;&nbsp;
  <img src="docs/settings-tab.png" width="250" alt="Settings — themes, engines, legal" />
</p>

## Features

### 🔍 Index
Real-time card search across all four TCG ecosystems. Filter by game, browse high-velocity movers, and dive into individual card details with market pricing.

### 💎 Oracle
AI-powered chat grounded in your Vault portfolio. Ask about card values, meta shifts, grading ROI, or investment timing. Bring your own key — supports Ollama (local), Groq, and Anthropic.

### 📸 Scan
Camera-based card identification and condition grading. Point your phone at a card for instant recognition. *(Native builds only)*

### 🏦 Vault
Personal card watchlist stored entirely on-device. Track your collection's estimated value over time. The Oracle reads your Vault to give personalized market advice.

### ⚙️ Settings
Five visual themes (Midnight, Ember, Frost, Undesirables, Light). Engine configuration, data source info, legal links, and version details.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sailorpepe/tcg-oracle-app.git
cd tcg-oracle-app
npm install

# Run on web
npx expo start --web

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android
```

## AI Engines

TCG Oracle uses a **Bring Your Own Key** model. No API keys are bundled or required by default.

| Engine | Type | Setup |
|--------|------|-------|
| **Ollama** | Local (free) | Install [Ollama](https://ollama.com), pull `qwen3:8b`, point the app at `http://localhost:11434` |
| **Groq** | Cloud (free tier) | Get a key at [console.groq.com](https://console.groq.com) |
| **Anthropic** | Cloud (paid) | Get a key at [console.anthropic.com](https://console.anthropic.com) |

Keys are stored in AsyncStorage on-device (web: localStorage). They never leave your device.

## Data Sources

All market data comes from free, public APIs:

- **Pokémon TCG API** — pokemontcg.io
- **Scryfall** — Magic: The Gathering
- **YGOProDeck** — Yu-Gi-Oh!
- **One Piece TCG API** — Community maintained

No API keys required for card data. No rate limits enforced by the app (upstream limits apply).

## Security

This app was hardened following a professional security audit (Gemini Deep Think). Key protections:

- **SSRF Protection** — Ollama endpoint URLs validated against metadata endpoints, private IPs, and non-HTTP schemes
- **Prompt Injection Defense** — Card data sanitized with control character stripping, HTML removal, and length caps before system prompt injection
- **ReDoS Prevention** — Input truncated before regex evaluation
- **Stream Buffer Cap** — 500KB limit on SSE/Ollama streams prevents OOM from malicious endpoints
- **Rate Limiting** — 2-second cooldown between messages with 2000-character cap
- **Error Isolation** — Error messages filtered from AI context to prevent confusion loops
- **Vault Size Cap** — 500-card limit prevents startup crash from unbounded storage growth
- **Zero Telemetry** — No analytics, no tracking, no phone-home. Period.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo SDK 53) |
| Router | Expo Router (file-based) |
| Language | TypeScript |
| Storage | AsyncStorage (on-device) |
| AI | Ollama / Groq / Anthropic (BYOK) |
| Styling | React Native StyleSheet |

## Project Structure

```
tcg-oracle-app/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx        # Card search + market overview
│   │   ├── oracle.tsx       # AI chat interface
│   │   ├── grade.tsx        # Camera grading (native)
│   │   ├── vault.tsx        # Card watchlist
│   │   └── settings.tsx     # Configuration
│   └── _layout.tsx          # Root layout
├── lib/
│   ├── api.ts               # TCG API integrations
│   ├── vault.ts             # On-device storage
│   ├── inference/
│   │   ├── cloud-engine.ts  # AI engine abstraction
│   │   ├── context.ts       # System prompt builder
│   │   └── engine.ts        # Engine registry
│   └── ThemeContext.tsx      # Theme provider
├── constants/
│   └── Themes.ts            # 5 visual themes
└── docs/                    # Screenshots
```

## License

MIT

## Links

- **Website**: [the-undesirables.com](https://the-undesirables.com)
- **MCP Server**: [undesirables-mcp-server](https://github.com/sailorpepe/undesirables-mcp-server)
- **PyPI**: [undesirables-mcp-server](https://pypi.org/project/undesirables-mcp-server/)
- **X**: [@undesirable_ai](https://x.com/undesirable_ai)
