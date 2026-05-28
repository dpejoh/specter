# Specter

<p align="center">
  <img src="./screenshots/home.png" width="19%" alt="Home">
  <img src="./screenshots/tools.png" width="19%" alt="Tools">
  <img src="./screenshots/target.png" width="19%" alt="App Targeting">
  <img src="./screenshots/control.png" width="19%" alt="Control">
  <img src="./screenshots/settings.png" width="19%" alt="Settings">
</p>

[![latest release](https://img.shields.io/github/v/release/dpejoh/specter?label=Release&logo=github)](https://github.com/dpejoh/specter/releases/latest)

Keybox management, security spoofing, and detection avoidance: clean, focused, no bloat.

The module is clean by design: that's what makes it the right choice, not bloat and gimmicks like others. With a clean webUI that gives you the best experience.

[Download](https://github.com/dpejoh/specter/releases/latest)

## Background

Specter is a complete rewrite of what I originally built as Yurikey. After the rewrite was turned down by Yuri, I went my own way.

## Support

If Specter helps you out, consider supporting the project:

- Ko-fi: [ko-fi.com/dpejoh](https://ko-fi.com/dpejoh)
- PayPal: dpejoh@atomicmail.io
- BTC: bc1qfy4vfstns4aqhvck66x0r53n3hfkkzhwkt7zpw
- ETC: 0x895762C0Fd2BeF54EE3cD478Fc03212aeA673a68

## Quick start

1. Install any PIF fork such as [Play Integrity Fix](https://github.com/KOWX712/PlayIntegrityFix/releases/latest) or [Play Integrity Fork](https://github.com/osm0sis/PlayIntegrityFork/releases/latest)
2. Install [Tricky Store](https://github.com/5ec1cff/TrickyStore/releases/latest) or any fork such as [TEESimulator](https://github.com/JingMatrix/TEESimulator) or [TEESimulator-RS](https://github.com/Enginex0/TEESimulator-RS)
3. Install Specter via Magisk / KernelSU / APatch
4. Open the WebUI and configure as you like

## Features

- **Keybox**: multi-source catalog, custom keybox (file/URL/path), Google revocation checking, private keybox support, backup and restore
- **Tools**: target.txt, App Targeting (per-app states + blacklist), security patch with live fetch from source.android.com, TEESimulator support, GMS kill, PIF fix, HMA-OSS / Zygisk Next configs, detection cleanup, Widevine L1
- **Control**: per-feature toggles (boot hardening, boot state props, bootloader spoofer block, ROM spoof blocking, LSPosed clean, recovery hide, action pipeline steps), automatic conflict resolution (aggressive: TSupport-Advance/Yurikey/Integrity Box disabled; passive: TreatWheel/NoHello/Sensitive Props coexist)
- **Settings**: theme (dark/light/auto + 9 color presets + Monet), language, dev mode with terminal, project contributors

## Requirements

- Root access (Magisk / KernelSU / APatch)
- Tricky Store
- Play Integrity Fix or any fork (recommended)

## Build from source

```bash
git clone https://github.com/dpejoh/specter
cd specter
npm install
npm run build
```

Output: `module.zip`

## Legal

```
FOR EDUCATIONAL PURPOSES ONLY.
THE DEVELOPER DOES NOT CONDONE ILLEGAL ACTIVITIES INCLUDING BYPASSING DRM, VIOLATING TERMS OF SERVICE, OR COMMITTING FRAUD.
USERS ARE SOLELY RESPONSIBLE FOR COMPLYING WITH APPLICABLE LAWS.
```

## Warning

```
SPECTER IS PROGRAMMED NOT TO CAUSE PROBLEMS, BUT AN UNLOCKED PHONE ALWAYS COMES WITH RISKS.
NOTHING IS 100% GUARANTEED. USE AT YOUR OWN RISK.
YOUR WARRANTY MAY BE VOIDED, APPS MAY BREAK, AND ACCOUNT BANS ARE POSSIBLE.
ALWAYS MAINTAIN BACKUPS OF IMPORTANT DATA.
```

## Thanks

- [chiteroman](https://github.com/chiteroman/PlayIntegrityFix), [KOWX712](https://github.com/KOWX712/PlayIntegrityFix) and [osm0sis](https://github.com/osm0sis/PlayIntegrityFork) — pif.ts and its forks
- [vvb2060](https://github.com/vvb2060/KeyAttestation) — KeyAttestation
- [5ec1cff](https://github.com/5ec1cff/TrickyStore), [JingMatrix](https://github.com/JingMatrix/TEESimulator) and [Enginex0](https://github.com/Enginex0/TEESimulator-RS) — Tricky Store and its forks
- [KOWX712](https://github.com/KOWX712/Tricky-Addon-Update-Target-List) — Tricky Store Addon
- [Citra-Standalone](https://github.com/Citra-Standalone/TSupport-Advance) — TSupport-Advance

## License

GNU GPL v3.0
