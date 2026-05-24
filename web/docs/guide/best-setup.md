# Best Setup

## General

Required regardless of your root solution.

Install these modules in order, then reboot:

| # | Module | Options | Note |
|---|---|---|---|
| 1 | Zygisk implementation | ZygiskNext, ReZygisk | ZygiskNext is more stable |
| 2 | Keystore spoofer | Tricky Store, TEESimulator, TEESimulator-RS | TEESimulator-RS is the most active |
| 3 | Play Integrity fix | PlayIntegrityFork, PIF Inject | PIF Inject is the most active |
| 4 | Props, Vbmeta, Keybox.. | Specter | |
| 5 | App hiding | HMA-OSS Zygisk | Required for HMA-OSS, preferred over LSPosed |

Pick one option per category. Installing multiples will cause conflicts.

**You don't need these, skip them:**

- Any vbmeta fixer module
- Any keybox manager (IntegrityBox, Yurikey, etc.)
- Any props fixing module
- Tricky Store Addon or its forks

Specter handles all of the above, and does it better. It also detects conflicting modules and lists them in its description, remove whatever it flags.

**A few things worth keeping in mind:**

Keep your setup minimal. The more modules you pile on, especially with install/remove cycles and mixed setups, the more fingerprints you leave and the harder things get to debug. Dirty setups don't get clean results.

Avoid custom ROMs if hiding root is a priority. Many apps block unlocked bootloaders outright, and modules that claim to spoof stock ROMs tend to create more problems than they solve. Run CROM through Duck Detector if you want to see how bad the detection surface gets.

Before installing any module, read its README on GitHub. A lot of "this module doesn't work" reports come down to one unchecked toggle that the README would've caught in five minutes.

## Root Solution Specifics

### Magisk

- Add apps you want to hide root from to the Denylist
- Don't enable Zygisk in settings if you're using ZygiskNext or ReZygisk
- Stick to the official release, most forks are abandoned and don't offer meaningful improvements

### KernelSU

- If you have SUSFS, install BRENE, it makes a real difference

### APatch

- Use KPM modules where available
- Install the SELinux Hook and NoHello KPM modules

## Getting Strong Integrity

After installing Specter you'll likely land on Basic integrity only. To push it to Strong:

1. Confirm your keybox is active. A soft-banned keybox caps you at Device integrity no matter what else you do.
2. Open the PIF WebUI, hit Fetch, pick any device or go Random, then press Autopif.
3. Check integrity in the Play Store developer options. If it's still not Strong, fetch again. Most people get it within 2 or 3 attempts.


## Setting Up HMA-OSS

**Auto (recommended):**

Use the HMA-OSS config option on the second page of the Specter WebUI. Alternatively, download a config from the web and import it via the Restore Config button.

**Manual:**

1. Enable all apps you want to hide root from, and all apps doing the hiding
2. Create a new template, set it to blacklist mode, name it whatever
3. Add HMA-OSS, Termux, and any detector apps to the invisible list
4. Add all the apps you want passing to the applied list
5. If some apps still fail, enable all presets and apply templates to them individually
