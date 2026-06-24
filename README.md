# Specter

<p align="center">
  <img src="./screenshots/home.png" width="19%" alt="Home">
  <img src="./screenshots/tools.png" width="19%" alt="Tools">
  <img src="./screenshots/target.png" width="19%" alt="App Targeting">
  <img src="./screenshots/control.png" width="19%" alt="Control">
  <img src="./screenshots/settings.png" width="19%" alt="Settings">
</p>

[![latest release](https://img.shields.io/github/v/release/dpejoh/specter?label=Release&logo=github)](https://github.com/dpejoh/specter/releases/latest)
[![CI](https://github.com/dpejoh/specter/actions/workflows/build-test.yml/badge.svg)](https://github.com/dpejoh/specter/actions/workflows/build-test.yml)

Getting strong integrity, TEESimulator management, detection solve. Clean, focused, no bloat.

[Download](https://github.com/dpejoh/specter/releases/latest)

## Background

Specter is a complete rewrite of what I originally built as Yurikey.

## Support

- Telegram: [Channel](https://t.me/dpejoh) · [Group](https://t.me/dpejoh0)
- Ko-fi: [ko-fi.com/dpejoh](https://ko-fi.com/dpejoh)
- BTC: bc1qfy4vfstns4aqhvck66x0r53n3hfkkzhwkt7zpw
- ETC: 0x895762C0Fd2BeF54EE3cD478Fc03212aeA673a68

## Quick start

1. Install [Tricky Store](https://github.com/5ec1cff/TrickyStore/releases/latest) or a fork
2. Install any PIF fork
3. Install Specter via Magisk / KernelSU / APatch
4. Reboot. First-boot runs backup, target, security patch, keybox.
5. Open the WebUI

## Features

- **Keybox**: multi-source catalog, custom keybox, Google revocation, backup/restore
- **Auto Target**: inotify + polling for new apps
- **App Targeting**: per-app states, TEE-aware suffixes, blacklist
- **Security Patch**: live fetch with offline fallback
- **TEE & Boot Hash**: TEE status/tier, vbmeta digest, boot hash
- **ROM Fingerprint**: cleans custom ROM props and prefixes
- **ADB Disabler**: dev options, USB debugging, OEM unlock
- **PIF**: auto-detect variant, fetch fingerprint, block spoof engines
- **GMS Kill**: force-stops DroidGuard/GMS, clears Play Store
- **Module Configs**: HMA-OSS/HMA/HMAL, Zygisk Next
- **Detection Cleanup**: removes detector logs, temp dirs, caches
- **Widevine L1**: attestation keys via KmInstallKeybox
- **Conflict Resolution**: 7 modules — aggressive disabled, passive coexists
- **Scheduler**: periodic keybox info, auto-target, autopif
- **First-Boot**: backup originals, run full pipeline once

## Requirements

- Root access (Magisk / KernelSU / APatch)
- Tricky Store or fork
- Play Integrity Fix or fork (recommended)

## Build

```bash
git clone https://github.com/dpejoh/specter
cd specter
npm install
npm run build
```

Output: `Specter-v{version}.zip`

### Testing

```bash
bash tests/run.sh          # Shell tests. 6 files, 97 assertions.
npm test                   # TS tests. 10 files, 92 tests (vitest + happy-dom).
npx tsc --noEmit           # TypeScript strict check
```

### CI

- TypeScript strict, ShellCheck (warning), shell tests, TS tests
- Module structure verification
- No hardcoded `/data/adb/modules/Specter` paths in lib/ or features/
- No `su -c` in feature scripts

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

## Translations

The WebUI is translated into Arabic, Spanish, Russian, and Chinese (all AI-generated — human review welcome).

To contribute translations:
- **Preferred**: Join the [Crowdin project](https://crowdin.com/project/specter) — web UI, no git needed
- **Alternative**: Edit the JSON files in `src/webroot/lang/` and submit a PR

Each `*.json` file is validated against `source/string.json` in CI (`npm test`). New keys without translations fall back to English.

## Thanks

- [chiteroman](https://github.com/chiteroman/PlayIntegrityFix), [KOWX712](https://github.com/KOWX712/PlayIntegrityFix) and [osm0sis](https://github.com/osm0sis/PlayIntegrityFork). PIF and forks.
- [5ec1cff](https://github.com/5ec1cff/TrickyStore), [JingMatrix](https://github.com/JingMatrix/TEESimulator), [Enginex0](https://github.com/Enginex0/TEESimulator-RS). Tricky Store and forks.
- [KOWX712](https://github.com/KOWX712/Tricky-Addon-Update-Target-List), [Enginex0](https://github.com/Enginex0/tricky-addon-enhanced). Tricky Store Addon.
- [vvb2060](https://github.com/vvb2060/KeyAttestation). KeyAttestation.
- [eltavine](https://github.com/eltavine/Duck-Detector-Refactoring). Duck Detector.
- [Citra-Standalone](https://github.com/Citra-Standalone/TSupport-Advance). TSupport-Advance.

## License

GNU GPL v3.0
