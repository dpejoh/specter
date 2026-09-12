import { getTranslation } from './i18n.js';
import { cfgGet, cfgSet } from './cfg.js';
import { applyPreset, getCurrentPreset, PRESETS } from './theme.js';
import { openSubPage } from './subpage.js';

const t = (key: string, fallback: string): string => getTranslation(key) || fallback;

const BASIC_COLORS: { id: string; nameKey: string; defaultName: string; hex: string }[] = [
  { id: 'blue',   nameKey: 'theme_preset_blue',   defaultName: 'Blue',   hex: '#1157CE' },
  { id: 'cyan',   nameKey: 'theme_preset_cyan',   defaultName: 'Cyan',   hex: '#00687C' },
  { id: 'green',  nameKey: 'theme_preset_green',  defaultName: 'Green',  hex: '#006C35' },
  { id: 'yellow', nameKey: 'theme_preset_yellow', defaultName: 'Yellow', hex: '#8F4E06' },
  { id: 'orange', nameKey: 'theme_preset_orange', defaultName: 'Orange', hex: '#9A4600' },
  { id: 'red',    nameKey: 'theme_preset_red',    defaultName: 'Red',    hex: '#B3251E' },
  { id: 'pink',   nameKey: 'theme_preset_pink',   defaultName: 'Pink',   hex: '#B60D6E' },
  { id: 'purple', nameKey: 'theme_preset_purple', defaultName: 'Purple', hex: '#7438D2' },
  { id: 'grey',   nameKey: 'theme_preset_grey',   defaultName: 'Grey',   hex: '#5E5E5E' },
];

export function updateColorsSummary() {
  const summaryEl = document.getElementById('color-theme-summary');
  const dotEl = document.getElementById('settings-color-dot');
  const current = getCurrentPreset();

  if (summaryEl) {
    if (current === 'monet') {
      summaryEl.textContent = t('colors_dynamic_name', 'System (Dynamic)');
    } else {
      const found = BASIC_COLORS.find(c => c.id === current);
      summaryEl.textContent = found ? t(found.nameKey, found.defaultName) : current;
    }
  }

  if (dotEl) {
    if (current === 'monet') {
      dotEl.style.background = 'linear-gradient(135deg, #1157CE 25%, #8F4E06 50%, #B3251E 75%, #7438D2 100%)';
    } else {
      dotEl.style.background = PRESETS[current] || 'var(--md-sys-color-primary)';
    }
  }
}

export async function openColorsDialog() {
  let selectedPreset = getCurrentPreset() || 'monet';

  let updateActiveStates = () => {};

  openSubPage({
    id: 'colors',
    title: t('settings_colors_title', 'Colors'),
    description: t('settings_color_desc', 'Accent palette & Monet dynamic theme'),
    groups: [
      // 1. Phone Mockup Preview (Google M3 Illustration with Specter Control Page)
      {
        items: [
          {
            type: 'custom',
            render: (host: HTMLElement) => {
              host.innerHTML = `
                <div class="colors-preview-showcase" id="colors-live-preview" aria-hidden="true">
                  <div class="phone-frame-wrapper">
                    <!-- Hardware side buttons (Pixel style: power on top, volume below) -->
                    <div class="phone-hw-btn phone-hw-btn--pwr" aria-hidden="true"></div>
                    <div class="phone-hw-btn phone-hw-btn--vol" aria-hidden="true"></div>

                    <!-- Phone Chassis (Cut cleanly at bottom) -->
                    <div class="phone-mockup">
                      <div class="phone-screen-viewport">
                        <div class="phone-screen-inner">
                          <!-- Status Bar (Equal spacing left and right, generous breathing room) -->
                          <div class="phone-status-bar">
                            <span class="phone-status-time">09:30</span>
                            <div class="phone-status-icons">
                              <svg class="phone-status-svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M2 22h20V2z"/>
                              </svg>
                              <svg class="phone-status-svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                                <path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4z"/>
                              </svg>
                              <svg class="phone-status-svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                                <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/>
                              </svg>
                            </div>
                          </div>

                          <!-- Section 1: Boot Behavior -->
                          <h2 class="list-title">${t('control_boot_title', 'Boot Behavior')}</h2>
                          <div class="list-container">
                            <!-- 1. Boot Spoofing -->
                            <div class="list-item list-item--toggle list-item--primary">
                              <div class="li-icon"><md-icon aria-hidden="true">lock</md-icon></div>
                              <div class="list-item-content">
                                <div class="toggle-text">${t('control_toggle_prop_handler', 'Boot Spoofing')}</div>
                                <span class="supporting-text">${t('preview_toggle_boot_desc', 'Spoof bootloader & state')}</span>
                              </div>
                              <div class="li-toggle-action">
                                <svg class="li-config-chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2L6.5 7L1.5 12"/></svg>
                                <div class="li-config-divider" aria-hidden="true"></div>
                                <md-switch icons selected aria-label="${t('control_toggle_prop_handler', 'Boot Spoofing')}"></md-switch>
                              </div>
                            </div>

                            <!-- 2. ROM Cleaner -->
                            <div class="list-item list-item--toggle list-item--secondary">
                              <div class="li-icon"><md-icon aria-hidden="true">fingerprint</md-icon></div>
                              <div class="list-item-content">
                                <div class="toggle-text">${t('control_toggle_rom_fingerprint', 'ROM Cleaner')}</div>
                                <span class="supporting-text">${t('preview_toggle_rom_desc', 'Strip custom ROM traces')}</span>
                              </div>
                              <div class="li-toggle-action">
                                <svg class="li-config-chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2L6.5 7L1.5 12"/></svg>
                                <div class="li-config-divider" aria-hidden="true"></div>
                                <md-switch icons selected aria-label="${t('control_toggle_rom_fingerprint', 'ROM Cleaner')}"></md-switch>
                              </div>
                            </div>

                            <!-- 3. ADB Lock -->
                            <div class="list-item list-item--toggle list-item--tertiary">
                              <div class="li-icon"><md-icon aria-hidden="true">usb_off</md-icon></div>
                              <div class="list-item-content">
                                <div class="toggle-text">${t('control_toggle_adb_disabler', 'ADB Lock')}</div>
                                <span class="supporting-text">${t('preview_toggle_adb_desc', 'Lock down ADB & debugging')}</span>
                              </div>
                              <div class="li-toggle-action">
                                <svg class="li-config-chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2L6.5 7L1.5 12"/></svg>
                                <div class="li-config-divider" aria-hidden="true"></div>
                                <md-switch icons aria-label="${t('control_toggle_adb_disabler', 'ADB Lock')}"></md-switch>
                              </div>
                            </div>
                          </div>

                          <!-- Section 2: Background Jobs -->
                          <h2 class="list-title">${t('control_background_title', 'Background Jobs')}</h2>
                          <div class="list-container">
                            <!-- 4. Auto-Targeting -->
                            <div class="list-item list-item--toggle list-item--primary">
                              <div class="li-icon"><md-icon aria-hidden="true">my_location</md-icon></div>
                              <div class="list-item-content">
                                <div class="toggle-text">${t('control_toggle_auto_target', 'Auto-Targeting')}</div>
                                <span class="supporting-text">${t('preview_toggle_auto_target_desc', 'Auto-target new applications')}</span>
                              </div>
                              <div class="li-toggle-action">
                                <svg class="li-config-chevron" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 2L6.5 7L1.5 12"/></svg>
                                <div class="li-config-divider" aria-hidden="true"></div>
                                <md-switch icons selected aria-label="${t('control_toggle_auto_target', 'Auto-Targeting')}"></md-switch>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `;

              // Interactive phone preview items (toggle switches on click)
              host.querySelectorAll('.phone-mockup .list-item').forEach(item => {
                item.addEventListener('click', (e) => {
                  const sw = item.querySelector('md-switch') as MdSwitch | null;
                  if (sw && e.target !== sw && !sw.contains(e.target as Node)) {
                    sw.selected = !sw.selected;
                  }
                });
              });
            }
          }
        ]
      },
      // 2. System (Dynamic) Toggle at the top of color options
      {
        items: [
          {
            type: 'switch',
            id: 'colors-monet-toggle',
            key: 'theme_monet_switch',
            icon: 'palette',
            title: t('colors_dynamic_name', 'System (Dynamic)'),
            description: t('colors_dynamic_desc', 'Theme extracted from your wallpaper'),
            defaultVal: selectedPreset === 'monet' ? '1' : '0',
            onChange: async (checked: boolean) => {
              if (checked) {
                selectedPreset = 'monet';
                await cfgSet('theme_monet_switch', '1');
                applyPreset('monet');
              } else {
                const fixed = (await cfgGet('theme_fixed_preset', 'blue')) || 'blue';
                selectedPreset = fixed;
                await cfgSet('theme_monet_switch', '0');
                applyPreset(fixed);
              }
              updateActiveStates();
            }
          }
        ]
      },
      // 3. Basic / Custom Colors Swatches Grid (grayed out when System Dynamic is on)
      {
        title: t('colors_basic_tab', 'Basic colors'),
        items: [
          {
            type: 'custom',
            render: (host: HTMLElement) => {
              const isMonet = selectedPreset === 'monet';

              host.innerHTML = `
                <div class="colors-grid ${isMonet ? 'colors-grid--disabled' : ''}" id="basic-colors-grid">
                  ${BASIC_COLORS.map(c => `
                    <button class="colors-swatch-btn ${(!isMonet && selectedPreset === c.id) ? 'colors-swatch--selected' : ''}" 
                            data-preset="${c.id}" 
                            aria-label="${t(c.nameKey, c.defaultName)}" 
                            title="${t(c.nameKey, c.defaultName)}" 
                            type="button"
                            ${isMonet ? 'disabled' : ''}>
                      <div class="colors-swatch-outer">
                        <span class="colors-swatch-circle" style="background-color: ${c.hex};"></span>
                      </div>
                      <span class="colors-swatch-label">${t(c.nameKey, c.defaultName)}</span>
                    </button>
                  `).join('')}
                </div>
              `;

              updateActiveStates = () => {
                const isCurrentMonet = selectedPreset === 'monet';
                const overlay = host.closest('.subpage-overlay') || document.querySelector('.subpage-overlay--open');
                const monetSw = overlay?.querySelector('#colors-monet-toggle') as MdSwitch | null;
                if (monetSw && monetSw.selected !== isCurrentMonet) {
                  monetSw.selected = isCurrentMonet;
                }

                const grid = host.querySelector('#basic-colors-grid');
                if (grid) {
                  grid.classList.toggle('colors-grid--disabled', isCurrentMonet);
                  grid.querySelectorAll<HTMLButtonElement>('.colors-swatch-btn').forEach(btn => {
                    const p = btn.getAttribute('data-preset');
                    btn.disabled = isCurrentMonet;
                    btn.classList.toggle('colors-swatch--selected', !isCurrentMonet && selectedPreset === p);
                  });
                }

                updateColorsSummary();
              };

              // Swatch click handlers
              host.querySelectorAll('.colors-swatch-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                  if (selectedPreset === 'monet') return;
                  const p = btn.getAttribute('data-preset');
                  if (p) {
                    selectedPreset = p;
                    await cfgSet('theme_fixed_preset', p);
                    await cfgSet('theme_monet_switch', '0');
                    applyPreset(p);
                    updateActiveStates();
                  }
                });
              });

              updateActiveStates();
            }
          }
        ]
      }
    ],
    infoCard: {
      icon: 'palette',
      text: t('colors_info_desc', 'Dynamic colors extract accent tones from your wallpaper on Android 12+. Basic colors apply a uniform Material Design 3 palette.')
    }
  });
}

export function wireColorsUI() {
  const row = document.getElementById('color-theme-row');
  if (row) {
    row.addEventListener('click', () => {
      openColorsDialog().catch(console.error);
    });
  }

  document.addEventListener('languageChanged', () => {
    updateColorsSummary();
  });

  updateColorsSummary();
}
