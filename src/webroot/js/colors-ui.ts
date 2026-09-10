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
      const sys = t('theme_preset_monet', 'System');
      const dyn = t('colors_dynamic_name', 'Dynamic');
      summaryEl.textContent = `${sys} (${dyn})`;
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
  let selectedPreset = getCurrentPreset();

  openSubPage({
    id: 'colors',
    title: t('settings_colors_title', 'Colors'),
    description: t('settings_color_desc', 'Accent palette & Monet dynamic theme'),
    groups: [
      {
        items: [
          {
            type: 'custom',
            render: (host: HTMLElement) => {
              const isMonet = selectedPreset === 'monet';

              host.innerHTML = `
                <div class="colors-page-container">
                  <!-- M3 Components Showcase Preview -->
                  <div class="colors-preview-showcase" id="colors-live-preview" aria-hidden="true">
                    <!-- Row 1: M3 Action Pill + Switch + Icon Buttons -->
                    <div class="showcase-row showcase-row--spread">
                      <div class="showcase-pill-btn">
                        <span>Action</span>
                      </div>
                      <div class="showcase-switch">
                        <div class="showcase-switch-thumb"></div>
                      </div>
                      <div class="showcase-icon-group">
                        <div class="showcase-icon-btn showcase-icon-btn--tonal">
                          <md-icon>palette</md-icon>
                        </div>
                        <div class="showcase-icon-btn showcase-icon-btn--primary">
                          <md-icon>check</md-icon>
                        </div>
                      </div>
                    </div>

                    <!-- Row 2: Material You Chips -->
                    <div class="showcase-row">
                      <div class="showcase-chip showcase-chip--active">
                        <md-icon>done</md-icon>
                        <span>Selected</span>
                      </div>
                      <div class="showcase-chip">
                        <span>Container</span>
                      </div>
                      <div class="showcase-chip">
                        <span>Surface</span>
                      </div>
                    </div>

                    <!-- Row 3: M3 Expressive Progress (Wavy Active + Static Active + Circular Progress with Cut) -->
                    <div class="showcase-row showcase-row--progress">
                      <div class="showcase-linear-wrap">
                        <!-- Top: Wavy Linear Progress -->
                        <svg class="showcase-expressive-bar" viewBox="0 0 260 16">
                          <!-- Wavy Filled Active Segment -->
                          <path class="showcase-wave-active" d="M 4 8 Q 13 2, 22 8 T 40 8 T 58 8 T 76 8 T 94 8" fill="none" stroke-width="4" stroke-linecap="round" />
                          <!-- Straight Empty Track Segment with reduced gap -->
                          <path class="showcase-straight-track" d="M 100 8 L 254 8" fill="none" stroke-width="4" stroke-linecap="round" />
                          <!-- M3 Stop Dot without spacing -->
                          <circle class="showcase-stop-dot" cx="254" cy="8" r="2.5" />
                        </svg>

                        <!-- Bottom: Static Linear Progress -->
                        <svg class="showcase-expressive-bar" viewBox="0 0 260 16">
                          <!-- Static Filled Active Segment -->
                          <path class="showcase-wave-active" d="M 4 8 L 68 8" fill="none" stroke-width="4" stroke-linecap="round" />
                          <!-- Straight Empty Track Segment -->
                          <path class="showcase-straight-track" d="M 74 8 L 254 8" fill="none" stroke-width="4" stroke-linecap="round" />
                          <!-- M3 Stop Dot without spacing -->
                          <circle class="showcase-stop-dot" cx="254" cy="8" r="2.5" />
                        </svg>
                      </div>

                      <!-- M3 Expressive Circular Progress Indicator (Wavy Active + Cut Track) -->
                      <div class="showcase-circular-wrap">
                        <svg class="showcase-circular-svg" viewBox="0 0 40 40">
                          <!-- Track with Cut/Gaps -->
                          <path class="showcase-circle-track" d="M 29.19 29.19 A 13 13 0 1 1 16.64 7.44" fill="none" stroke-width="4" stroke-linecap="round" />
                          <!-- Wavy Active Arc with Cut/Gaps -->
                          <path class="showcase-circle-active" d="M 22.26 7.20 L 22.81 6.84 L 23.38 6.53 L 23.96 6.31 L 24.53 6.19 L 25.09 6.18 L 25.60 6.30 L 26.07 6.55 L 26.47 6.92 L 26.81 7.39 L 27.08 7.94 L 27.28 8.55 L 27.43 9.19 L 27.53 9.83 L 27.62 10.45 L 27.70 11.02 L 27.81 11.52 L 27.96 11.96 L 28.16 12.32 L 28.44 12.60 L 28.80 12.83 L 29.24 13.00 L 29.75 13.14 L 30.33 13.28 L 30.94 13.42 L 31.57 13.59 L 32.19 13.80 L 32.77 14.07 L 33.28 14.40 L 33.69 14.80 L 33.99 15.24 L 34.17 15.74 L 34.21 16.27 L 34.12 16.83 L 33.92 17.39 L 33.63 17.95 L 33.26 18.48 L 32.85 18.99 L 32.42 19.47 L 32.02 19.91 L 31.66 20.33 L 31.38 20.73 L 31.19 21.12 L 31.10 21.51 L 31.11 21.92 L 31.22 22.35 L 31.40 22.82 L 31.65 23.32 L 31.93 23.87 L 32.22 24.45" fill="none" stroke-width="4" stroke-linecap="round" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <!-- Basic Colors Swatches Grid -->
                  <div class="colors-grid ${isMonet ? 'colors-grid--monet-active' : ''}" id="basic-colors-grid">
                    ${BASIC_COLORS.map(c => `
                      <button class="colors-swatch-btn ${(!isMonet && selectedPreset === c.id) ? 'colors-swatch--selected' : ''}" data-preset="${c.id}" aria-label="${t(c.nameKey, c.defaultName)}" title="${t(c.nameKey, c.defaultName)}" type="button">
                        <div class="colors-swatch-outer">
                          <span class="colors-swatch-circle" style="background-color: ${c.hex};"></span>
                        </div>
                        <span class="colors-swatch-label">${t(c.nameKey, c.defaultName)}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              `;

              const updateActiveStates = () => {
                const isCurrentMonet = selectedPreset === 'monet';
                const monetSw = host.closest('.subpage-body')?.querySelector('#colors-monet-toggle') as MdSwitch | null
                  || document.getElementById('colors-monet-toggle') as MdSwitch | null;
                if (monetSw && monetSw.selected !== isCurrentMonet) {
                  monetSw.selected = isCurrentMonet;
                }

                host.querySelectorAll('.colors-swatch-btn').forEach(btn => {
                  const p = btn.getAttribute('data-preset');
                  btn.classList.toggle('colors-swatch--selected', !isCurrentMonet && selectedPreset === p);
                });

                const grid = host.querySelector('#basic-colors-grid');
                if (grid) {
                  grid.classList.toggle('colors-grid--monet-active', isCurrentMonet);
                }

                updateColorsSummary();
              };

              // Swatch click handlers
              host.querySelectorAll('.colors-swatch-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                  const p = btn.getAttribute('data-preset');
                  if (p) {
                    selectedPreset = p;
                    await cfgSet('theme_fixed_preset', p);
                    await cfgSet('theme_monet_switch', '0');
                    const monetSw = host.closest('.subpage-body')?.querySelector('#colors-monet-toggle') as MdSwitch | null
                      || document.getElementById('colors-monet-toggle') as MdSwitch | null;
                    if (monetSw) monetSw.selected = false;
                    applyPreset(p);
                    updateActiveStates();
                  }
                });
              });

              // Expose updater for the switch onChange callback
              (host as any).__updateColorsUI = updateActiveStates;
            }
          }
        ]
      },
      {
        title: t('colors_dynamic_name', 'System (Dynamic)'),
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
                applyPreset('monet');
              } else {
                const fixed = (await cfgGet('theme_fixed_preset', 'blue')) || 'blue';
                selectedPreset = fixed;
                applyPreset(fixed);
              }
              const hostCustom = document.querySelector('.colors-page-container')?.parentElement as any;
              if (hostCustom && hostCustom.__updateColorsUI) {
                hostCustom.__updateColorsUI();
              } else {
                updateColorsSummary();
              }
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
