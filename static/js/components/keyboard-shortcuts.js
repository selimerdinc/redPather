/**
 * Keyboard Shortcuts Manager
 * Shows help modal with all available shortcuts
 */

class KeyboardShortcuts {
    constructor() {
        this.shortcuts = [
            { key: '⌘/Ctrl + S', action: 'Ekranı Tara', category: 'Genel' },
            { key: '⌘/Ctrl + Shift + R', action: 'Yenile', category: 'Genel' },
            { key: '⌘/Ctrl + F', action: 'Element Ara', category: 'Genel' },
            { key: 'ESC', action: 'Modalları Kapat', category: 'Genel' },
            { key: '?', action: 'Kısayolları Göster', category: 'Genel' },
            { key: '↑ / ↓', action: 'Element Seç', category: 'Navigasyon' },
            { key: 'Enter', action: 'Element Detayı', category: 'Navigasyon' },
            { key: '⌘/Ctrl + C', action: 'Locator Kopyala', category: 'İşlem' },
            { key: 'Delete/Backspace', action: 'Element Sil', category: 'İşlem' },
        ];

        this.init();
    }

    init() {
        document.addEventListener('keydown', (e) => {
            // ? tuşu - help modal
            if (e.key === '?' && !this.isInputFocused()) {
                e.preventDefault();
                this.showHelpModal();
            }

            // Arrow keys for element navigation
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !this.isInputFocused()) {
                e.preventDefault();
                this.navigateElements(e.key === 'ArrowUp' ? -1 : 1);
            }
        });

        window.debug?.log('⌨️ Keyboard Shortcuts initialized (Press ? for help)');
    }

    isInputFocused() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    navigateElements(direction) {
        const elements = window.appState?.get('elements') || [];
        if (elements.length === 0) return;

        let currentIndex = window.appState?.get('ui.currentHoverIndex') ?? -1;
        let newIndex = currentIndex + direction;

        // Wrap around
        if (newIndex < 0) newIndex = elements.length - 1;
        if (newIndex >= elements.length) newIndex = 0;

        // Skip deleted elements
        while (elements[newIndex]?.isDeleted && newIndex !== currentIndex) {
            newIndex += direction;
            if (newIndex < 0) newIndex = elements.length - 1;
            if (newIndex >= elements.length) newIndex = 0;
        }

        window.highlightElement?.(newIndex, true);
    }

    showHelpModal() {
        // Remove existing
        document.getElementById('shortcutsModal')?.remove();

        const categories = [...new Set(this.shortcuts.map(s => s.category))];

        const modal = document.createElement('div');
        modal.id = 'shortcutsModal';
        modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-[480px] max-h-[80vh] overflow-hidden">
                <div class="bg-gradient-to-r from-red-500/20 to-transparent p-6 border-b border-zinc-700/50">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                                <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                        d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path>
                                </svg>
                            </div>
                            <div>
                                <h2 class="text-lg font-bold text-white">Klavye Kısayolları</h2>
                                <p class="text-xs text-zinc-400">Hızlı erişim tuşları</p>
                            </div>
                        </div>
                        <button onclick="this.closest('#shortcutsModal').remove()" 
                            class="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
                            <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
                    ${categories.map(cat => `
                        <div>
                            <h3 class="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">${cat}</h3>
                            <div class="space-y-2">
                                ${this.shortcuts.filter(s => s.category === cat).map(s => `
                                    <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                                        <span class="text-sm text-zinc-300">${s.action}</span>
                                        <kbd class="px-2.5 py-1 rounded bg-zinc-700 border border-zinc-600 text-xs font-mono text-zinc-300 shadow-sm">
                                            ${s.key}
                                        </kbd>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="p-4 bg-zinc-800/50 border-t border-zinc-700/50">
                    <p class="text-xs text-center text-zinc-500">
                        <kbd class="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 font-mono">ESC</kbd> 
                        veya dışarıya tıklayarak kapatın
                    </p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Auto-close on ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // Add custom shortcut
    addShortcut(key, action, category = 'Özel') {
        this.shortcuts.push({ key, action, category });
    }
}

// Create singleton
const keyboardShortcuts = new KeyboardShortcuts();
window.keyboardShortcuts = keyboardShortcuts;
