# TCG Oracle

Cross-platform market intelligence and AI-powered card grading for Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, and Lorcana trading cards.

Built with React Native (Expo) + Tauri. Runs on macOS, Windows, Linux, iOS, Android, and Web. Zero telemetry — all data stays on your device.

<p align="center">
  <img src="docs/index-tab.png" width="250" alt="Index — cross-system card search" />
  &nbsp;&nbsp;
  <img src="docs/oracle-tab.png" width="250" alt="Oracle — AI chat with market context" />
  &nbsp;&nbsp;
  <img src="docs/settings-tab.png" width="250" alt="Settings — themes, engines, legal" />
</p>

## Features

### 🔍 Index
Real-time card search across five TCG ecosystems with live eBay market comps. Filter by game, browse high-velocity movers, and dive into individual card details with the CL Value algorithm — the same pricing methodology used by card shops.

### 🛒 eBay Market Comps
Built-in eBay integration pulls live listings, separates graded from raw, trims outliers, and calculates fair market value — no API keys or setup required. Power users can optionally connect their own eBay developer keys for dedicated access.

### 📸 Scan
AI-powered card grading on web and mobile. Drag-and-drop a card image (JPG, PNG, HEIC) or use your phone's camera for instant condition analysis — centering, corners, edges, surface — with predicted PSA/BGS grades. Powered by your BYOK AI engine (Anthropic, Groq, or Ollama).

### 💎 Oracle
AI chat grounded in your Vault portfolio. Ask about card values, meta shifts, grading ROI, or investment timing. Supports Ollama (local), Groq (free tier), and Anthropic (Claude).

### 🏦 Vault
Personal card watchlist stored entirely on-device. Track your collection's estimated value. The Oracle reads your Vault to give personalized market advice.

### ⚙️ Settings
Five visual themes (Midnight, Ember, Frost, Undesirables, Light). Custom wallpaper with animated border effects. Engine configuration, eBay integration, and legal links.

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

### Desktop (Tauri)

```bash
# Build for macOS
npm run build
cd src-tauri && cargo tauri build

# The DMG/installer will be in src-tauri/target/release/bundle/
```

Pre-built installers are available on the [Releases](https://github.com/sailorpepe/tcg-oracle-app/releases) page.

## AI Engines

TCG Oracle uses a **Bring Your Own Key** model for AI features (Oracle chat and card grading).

| Engine | Type | Setup |
|--------|------|-------|
| **Ollama** | Local (free) | Install [Ollama](https://ollama.com), pull a model, point the app at `http://localhost:11434` |
| **Groq** | Cloud (free tier) | Get a key at [console.groq.com](https://console.groq.com) |
| **Anthropic** | Cloud (paid) | Get a key at [console.anthropic.com](https://console.anthropic.com) |

Keys are stored in AsyncStorage on-device (web: localStorage). They never leave your device.

## Data Sources

All market data comes from free, public APIs:

- **Pokémon TCG API** — pokemontcg.io
- **Scryfall** — Magic: The Gathering
- **YGOProDeck** — Yu-Gi-Oh!
- **One Piece TCG API** — Community maintained
- **Lorcana** — Community API
- **eBay Browse API** — Live market comps (built-in, no setup needed)

## Security

This app was hardened following a professional security audit. Key protections:

- **SSRF Protection** — Ollama endpoint URLs validated against metadata endpoints, private IPs, and non-HTTP schemes
- **Prompt Injection Defense** — Card data sanitized with control character stripping, HTML removal, and length caps before system prompt injection
- **ReDoS Prevention** — Input truncated before regex evaluation
- **Stream Buffer Cap** — 500KB limit on SSE/Ollama streams prevents OOM from malicious endpoints
- **Rate Limiting** — 2-second cooldown between messages with 2000-character cap
- **eBay Key Encryption** — Optional BYOK credentials encrypted with AES-GCM and a user-set PIN
- **Error Isolation** — Error messages filtered from AI context to prevent confusion loops
- **Vault Size Cap** — 500-card limit prevents startup crash from unbounded storage growth
- **Zero Telemetry** — No analytics, no tracking, no phone-home. Period.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo SDK 54) |
| Desktop | Tauri 2 (Rust) |
| Router | Expo Router (file-based) |
| Language | TypeScript |
| Storage | AsyncStorage (on-device) |
| AI | Ollama / Groq / Anthropic (BYOK) |
| Market Data | eBay Browse API (server proxy + cache) |
| Styling | React Native StyleSheet |

## Project Structure

```
tcg-oracle-app/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx        # Card search + market overview + eBay comps
│   │   ├── oracle.tsx       # AI chat interface
│   │   ├── grade.tsx        # Card grading (camera + drag-drop)
│   │   ├── vault.tsx        # Card watchlist
│   │   └── settings.tsx     # Configuration
│   ├── api/
│   │   └── ebay+api.ts     # Server-side eBay proxy (cached)
│   └── _layout.tsx          # Root layout
├── lib/
│   ├── api.ts               # TCG API integrations (5 games)
│   ├── vault.ts             # On-device storage
│   ├── crypto-utils.ts      # AES-GCM encryption for BYOK keys
│   ├── ebay-worker.ts       # eBay fetch + CL Value algorithm
│   ├── wallpaper.ts         # Wallpaper + border effects
│   ├── inference/
│   │   ├── cloud-engine.ts  # AI engine abstraction
│   │   ├── card-grader.ts   # Vision-based card grading
│   │   ├── context.ts       # System prompt builder
│   │   └── engine.ts        # Engine registry
│   └── ThemeContext.tsx      # Theme provider
├── components/
│   ├── ScreenTitle.tsx      # Shared header component
│   └── WallpaperBackground.tsx
├── constants/
│   └── Themes.ts            # 5 visual themes
├── src-tauri/               # Tauri desktop wrapper
└── docs/                    # Screenshots
```

## License

[Business Source License 1.1](LICENSE) (BUSL-1.1)

**Licensor:** The Undesirables LLC  
**Change Date:** 2030-04-27  
**Change License:** Apache License, Version 2.0

Non-commercial personal use is permitted. See the [LICENSE](LICENSE) file for full terms.

## Links

- **Website**: [the-undesirables.com](https://the-undesirables.com)
- **MCP Server**: [undesirables-mcp-server](https://github.com/sailorpepe/undesirables-mcp-server)
- **PyPI**: [undesirables-mcp-server](https://pypi.org/project/undesirables-mcp-server/)
- **X**: [@undesirable_ai](https://x.com/undesirable_ai)
