import { showToast } from './toast.js';
import { getTranslation } from './i18n.js';

let terminalEl: HTMLElement | null = null;

export function initTerminal() {
  terminalEl = document.querySelector('.output-terminal-content');
  const clearBtn = document.getElementById('clear-terminal');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (terminalEl) terminalEl.innerHTML = '';
    });
  }
  const copyBtn = document.getElementById('copy-terminal');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (terminalEl) {
        const text = terminalEl.innerText;
        navigator.clipboard.writeText(text).then(() => {
          showToast(getTranslation('terminal_copied') || 'Copied!', { icon: 'check_circle', type: 'success' as any, autoCloseDelay: 2000 });
        }).catch((err) => {
          console.error('Failed to copy terminal content:', err);
          showToast(getTranslation('terminal_copy_failed') || 'Failed to copy', { icon: 'error', type: 'error' as any, autoCloseDelay: 2000 });
        });
      }
    });
  }
}

export function appendToOutput(content: string, error = false) {
  if (!terminalEl) return;
  if (content.trim() === '') {
    terminalEl.appendChild(document.createElement('br'));
  } else {
    const p = document.createElement('p');
    p.textContent = content;
    if (error) p.classList.add('output-line--error');
    terminalEl.appendChild(p);
  }
  terminalEl.scrollTop = terminalEl.scrollHeight;
}
