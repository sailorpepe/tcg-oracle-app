## What's New

### ⛓️ Merkle Price Oracle & On-Chain Verification
Integrated the LitVM LiteForge testnet directly into the app. Every single day, pricing data for over 276,000 actively priced cards is cryptographically hashed into a single Merkle Root and pushed to our smart contract.
- Added a beautiful **Verify On-Chain** button to the Index dashboard.
- Clicking the button routes directly to the LitVM explorer to verify the contract (`0x96B124f50156589274ADF8F674509374752170Cd`).
- Fully transparent, trustless verification of all market telemetry.

### 🔒 Desktop Security & Sandboxing
Hardened the local application security for BYOK (Bring Your Own Key) capabilities:
- Enforced strict **macOS Hardened Runtime** compilation.
- Upgraded the **Content Security Policy (CSP)** to explicitly block unauthorized connections.
- Guaranteed zero-telemetry architecture. Your data, your cards, your models—always private.

### 🛠️ Installer Improvements
- Handled Apple Notarization for the `aarch64.dmg` correctly, ensuring zero warnings on installation.
- Added a full CI/CD pipeline for Linux, meaning `.deb` installers are now attached natively!

---

**Platforms:** macOS (DMG), Linux (DEB)
