# Getting Started

## Prerequisites

1. Root via Magisk, KernelSU, or APatch
2. [Tricky Store](https://github.com/5ec1cff/TrickyStore/releases/latest) or one of its forks ([TEESimulator](https://github.com/JingMatrix/TEESimulator/releases/latest), [TEESimulator-RS](https://github.com/Enginex0/TEESimulator-RS/releases/latest)) installed
3. A PIF fork (recommended): [Play Integrity Fix](https://github.com/KOWX712/PlayIntegrityFix/releases/latest) or [Play Integrity Fork](https://github.com/osm0sis/PlayIntegrityFork/releases/latest)

## Install

1. Download `Specter-v1.x.x.zip` from the [releases page](https://github.com/dpejoh/specter/releases/latest)
2. Flash in Magisk / KernelSU / APatch
3. The installer shows a volume-key menu for optional setup (keybox setup, set target.txt, conflict resolution)
4. Reboot

## Build from Source

```bash
git clone https://github.com/dpejoh/specter
cd specter
npm ci
npm run build
```

Output: `module.zip`

For the companion attestation APK:

```bash
cd apk
./build.sh    # requires Android SDK
```

Then `npm run build` to bundle it.
