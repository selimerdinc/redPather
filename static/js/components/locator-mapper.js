/**
 * Locator Mapper - Cross-Platform Locator Mapping UI Component
 * Android locator'larını iOS'a (veya tersi) dönüştürür
 */

class LocatorMapper {
    constructor() {
        this.isOpen = false;
        this.isProcessing = false;
        this.lastResult = null;
        this.init();
    }

    init() {
        // Panel oluştur
        this.createPanel();
        // Global binding
        window.openLocatorMapper = () => this.open();
        window.closeLocatorMapper = () => this.close();
        window.runLocatorMapping = () => this.runMapping();
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'locator-mapper-panel';
        panel.className = 'fixed top-0 right-0 w-[500px] h-full bg-[#0a0a0b]/98 backdrop-blur-xl border-l border-[#27272a] transform translate-x-full transition-transform duration-300 z-[100] flex flex-col shadow-2xl';

        panel.innerHTML = `
            <!-- Header -->
            <div class="p-4 border-b border-[#27272a] flex items-center justify-between bg-gradient-to-r from-violet-900/20 to-fuchsia-900/20">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-sm font-bold text-white">Cross-Platform Mapper</h3>
                        <p class="text-[10px] text-gray-400">Android ↔ iOS Locator Dönüştürücü</p>
                    </div>
                </div>
                <button onclick="window.closeLocatorMapper()" class="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <!-- Settings Bar -->
            <div class="px-4 py-3 border-b border-[#27272a] bg-zinc-900/50 space-y-3">
                <div class="flex gap-2">
                    <div class="flex-1">
                        <label class="text-[9px] font-bold text-gray-500 uppercase block mb-1">Kaynak Platform</label>
                        <select id="mapper-source-platform" class="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-violet-500">
                            <option value="ANDROID" selected>🤖 Android</option>
                            <option value="IOS">🍎 iOS</option>
                        </select>
                    </div>
                    <div class="flex items-end pb-1.5">
                        <svg class="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <label class="text-[9px] font-bold text-gray-500 uppercase block mb-1">Hedef Platform</label>
                        <select id="mapper-target-platform" class="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-violet-500">
                            <option value="ANDROID">🤖 Android</option>
                            <option value="IOS" selected>🍎 iOS</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-2">
                    <div class="flex-1">
                        <label class="text-[9px] font-bold text-gray-500 uppercase block mb-1">Input Format</label>
                        <select id="mapper-input-format" class="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-violet-500">
                            <option value="rf_variables" selected>Robot Framework Variables</option>
                            <option value="json">JSON</option>
                            <option value="keyvalue">Key=Value</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="text-[9px] font-bold text-gray-500 uppercase block mb-1">Output Format</label>
                        <select id="mapper-output-format" class="w-full bg-zinc-800 text-xs text-white border border-zinc-700 rounded px-2 py-1.5 focus:outline-none focus:border-violet-500">
                            <option value="rf_variables" selected>Robot Framework Variables</option>
                            <option value="json">JSON</option>
                            <option value="keyvalue">Key=Value</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Input Area -->
            <div class="flex-1 flex flex-col overflow-hidden">
                <div class="p-4 flex-1 flex flex-col min-h-0">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-[10px] font-bold text-gray-400 uppercase">Kaynak Locator'lar</label>
                        <button onclick="window.locatorMapper.pasteFromClipboard()" class="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                            Yapıştır
                        </button>
                    </div>
                    <textarea id="mapper-input" 
                        class="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-green-400 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                        placeholder="*** Variables ***
\${selector_login_email_inp}    id=com.app:id/email_field
\${selector_login_password_inp}    id=com.app:id/password_field
\${selector_login_submit_btn}    xpath=//android.widget.Button[@text='Giriş']"
                        spellcheck="false"></textarea>
                </div>

                <!-- Map Button -->
                <div class="px-4 pb-2">
                    <button id="mapper-run-btn" onclick="window.runLocatorMapping()" 
                        class="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold shadow-lg shadow-purple-900/40 hover:shadow-purple-600/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg id="mapper-run-icon" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                        </svg>
                        <svg id="mapper-loading-icon" class="w-5 h-5 animate-spin hidden" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span id="mapper-btn-text">Dönüştür</span>
                    </button>
                </div>

                <!-- Output Area -->
                <div class="p-4 flex-1 flex flex-col min-h-0 border-t border-[#27272a]">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <label class="text-[10px] font-bold text-gray-400 uppercase">Sonuç</label>
                            <span id="mapper-stats" class="text-[9px] text-gray-500 hidden"></span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.locatorMapper.copyOutput()" class="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                </svg>
                                Kopyala
                            </button>
                            <button onclick="window.locatorMapper.downloadOutput()" class="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                </svg>
                                İndir
                            </button>
                        </div>
                    </div>
                    <textarea id="mapper-output" 
                        class="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-cyan-400 resize-none focus:outline-none focus:border-green-500/50"
                        placeholder="Dönüştürülmüş locator'lar burada görünecek..."
                        spellcheck="false" readonly></textarea>
                </div>
            </div>

            <!-- Footer with Tips -->
            <div class="px-4 py-3 border-t border-[#27272a] bg-zinc-900/50">
                <p class="text-[10px] text-gray-500">
                    💡 <strong>Tip:</strong> Hedef platform cihazının bağlı ve ilgili ekranın açık olduğundan emin olun.
                </p>
            </div>
        `;

        document.body.appendChild(panel);
        this.panel = panel;
    }

    open() {
        if (this.panel) {
            this.panel.classList.remove('translate-x-full');
            this.isOpen = true;
        }
    }

    close() {
        if (this.panel) {
            this.panel.classList.add('translate-x-full');
            this.isOpen = false;
        }
    }

    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            document.getElementById('mapper-input').value = text;
            window.appState?.ui?.showToast?.('📋 Yapıştırıldı', 'Panodan alındı', 'success');
        } catch (e) {
            console.error('Clipboard read failed:', e);
        }
    }

    async runMapping() {
        if (this.isProcessing) return;

        const input = document.getElementById('mapper-input').value.trim();
        if (!input) {
            window.appState?.ui?.showToast?.('Uyarı', 'Lütfen locator girin', 'warning');
            return;
        }

        const sourcePlatform = document.getElementById('mapper-source-platform').value;
        const targetPlatform = document.getElementById('mapper-target-platform').value;
        const inputFormat = document.getElementById('mapper-input-format').value;
        const outputFormat = document.getElementById('mapper-output-format').value;

        if (sourcePlatform === targetPlatform) {
            window.appState?.ui?.showToast?.('Uyarı', 'Kaynak ve hedef platform aynı olamaz', 'warning');
            return;
        }

        this.setLoading(true);

        try {
            const result = await window.api.mapLocators(
                input,
                inputFormat,
                sourcePlatform,
                targetPlatform,
                outputFormat
            );

            this.lastResult = result;

            // Show output
            document.getElementById('mapper-output').value = result.output || '';

            // Show stats
            const stats = result.stats || {};
            const statsEl = document.getElementById('mapper-stats');
            if (statsEl) {
                statsEl.textContent = `${stats.matched}/${stats.total} eşleşti (avg: ${stats.avg_confidence}%)`;
                statsEl.classList.remove('hidden');
            }

            window.appState?.ui?.showToast?.('✅ Başarılı', `${stats.matched}/${stats.total} locator dönüştürüldü`, 'success');

        } catch (e) {
            console.error('Mapping error:', e);
            window.appState?.ui?.showToast?.('Hata', e.userMessage || e.message || 'Dönüştürme başarısız', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        this.isProcessing = loading;
        const btn = document.getElementById('mapper-run-btn');
        const runIcon = document.getElementById('mapper-run-icon');
        const loadingIcon = document.getElementById('mapper-loading-icon');
        const btnText = document.getElementById('mapper-btn-text');

        if (btn) btn.disabled = loading;
        if (runIcon) runIcon.classList.toggle('hidden', loading);
        if (loadingIcon) loadingIcon.classList.toggle('hidden', !loading);
        if (btnText) btnText.textContent = loading ? 'Dönüştürülüyor...' : 'Dönüştür';
    }

    async copyOutput() {
        const output = document.getElementById('mapper-output').value;
        if (!output) {
            window.appState?.ui?.showToast?.('Uyarı', 'Kopyalanacak sonuç yok', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(output);
            window.appState?.ui?.showToast?.('📋 Kopyalandı', 'Panoya kopyalandı', 'success');
        } catch (e) {
            console.error('Copy failed:', e);
        }
    }

    downloadOutput() {
        const output = document.getElementById('mapper-output').value;
        if (!output) {
            window.appState?.ui?.showToast?.('Uyarı', 'İndirilecek sonuç yok', 'warning');
            return;
        }

        const outputFormat = document.getElementById('mapper-output-format').value;
        let filename = 'locators';
        let extension = '.txt';

        if (outputFormat === 'rf_variables') {
            extension = '.robot';
        } else if (outputFormat === 'json') {
            extension = '.json';
        }

        const targetPlatform = document.getElementById('mapper-target-platform').value.toLowerCase();
        filename = `${targetPlatform}_locators${extension}`;

        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        window.appState?.ui?.showToast?.('📥 İndirildi', filename, 'success');
    }
}

// Initialize
const locatorMapper = new LocatorMapper();
window.locatorMapper = locatorMapper;
