# Compatibility

## Root Solutions

| Solution | Support |
|---|---|
| Magisk (with Zygisk) | Full |
| Magisk (without Zygisk) | Full (LSPosed features disabled) |
| KernelSU | Full |
| APatch | Full |

Detection and feature gating are automatic. No manual variant selection needed.

## Android Versions

| Version | Support |
|---|---|
| Android 14 | Full |
| Android 13 | Full |
| Android 12 | Full |
| Android 11 | Supported (some boot props may differ) |
| Android 10 and below | Not tested |

Module installation targets the standard Magisk/KSU/APatch structure. No Android API-level dependencies.

## Keybox Sources

Specter's built-in keybox catalog fetches from community-curated sources. You can also install keyboxes manually from any source that provides a valid `keybox.xml`.

## Conflict Registry

The following modules are detected and handled by Specter's conflict system:

**Aggressive** (renamed to `.bak`):
- TSupport
- Yurikey
- IntegrityBox
- Tricky Store (Addon and TSupport variants)

**Passive** (deferred toggle, coexists):
- NoHello
- TreatWheel
- Sensitive Props

Detection is file-based. If a module doesn't match the registry, no conflict action is taken.

## WebUI Browsers

Any modern browser works. The WebUI is a single-page app served by the root manager's WebUI server (often on `http://localhost:8080` or `http://localhost:1314`). Tested with Chrome, Firefox, Edge, and Kiwi Browser.