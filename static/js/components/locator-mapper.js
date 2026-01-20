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
        panel.className = 'fixed top-0 right-0 w-[520px] h-full glass border-l border-white/5 transform translate-x-full transition-transform duration-500 z-[100] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)]';

        panel.innerHTML = `
            <!-- Header -->
            <div class="p-5 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-emerald-600 flex items-center justify-center shadow-lg relative group">
                        <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-[13px] font-black text-white uppercase tracking-wider">Locator Mapper</h3>
                        <p class="text-[10px] text-zinc-500 font-medium">Cross-Platform Matching Engine</p>
                    </div>
                </div>
                <button onclick="window.closeLocatorMapper()" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-90">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <!-- Settings Bar - Refined -->
            <div class="px-5 py-4 border-b border-white/5 bg-white/[0.02] space-y-4">
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="text-[9px] font-black text-zinc-500 uppercase block mb-1.5 tracking-widest">Kaynak Platform</label>
                        <select id="mapper-source-platform" class="w-full bg-black/40 text-[11px] text-zinc-300 border border-white/5 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/50 transition-all">
                            <option value="ANDROID" selected>🤖 Android</option>
                            <option value="IOS">🍎 iOS</option>
                        </select>
                    </div>
                    <div class="flex items-end pb-2">
                        <div class="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                            <svg class="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                            </svg>
                        </div>
                    </div>
                    <div class="flex-1">
                        <label class="text-[9px] font-black text-zinc-500 uppercase block mb-1.5 tracking-widest">Hedef Platform</label>
                        <select id="mapper-target-platform" class="w-full bg-black/40 text-[11px] text-zinc-300 border border-white/5 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/50 transition-all">
                            <option value="ANDROID">🤖 Android</option>
                            <option value="IOS" selected>🍎 iOS</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="text-[9px] font-black text-zinc-500 uppercase block mb-1.5 tracking-widest">Girdi Formatı</label>
                        <select id="mapper-input-format" class="w-full bg-black/40 text-[11px] text-zinc-300 border border-white/5 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/50 transition-all">
                            <option value="rf_variables" selected>Robot Framework Variables</option>
                            <option value="json">JSON Container</option>
                            <option value="keyvalue">Key = Value Pair</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="text-[9px] font-black text-zinc-500 uppercase block mb-1.5 tracking-widest">Çıktı Formatı</label>
                        <select id="mapper-output-format" class="w-full bg-black/40 text-[11px] text-zinc-300 border border-white/5 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500/50 transition-all">
                            <option value="rf_variables" selected>Robot Framework Variables</option>
                            <option value="json">JSON Container</option>
                            <option value="keyvalue">Key = Value Pair</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Main Workspace -->
            <div class="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-black/20 to-transparent">
                <!-- Input Section -->
                <div class="p-5 flex-1 flex flex-col min-h-0">
                    <div class="flex items-center justify-between mb-3">
                        <label class="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Giriş Kaynakları</label>
                        <button onclick="window.locatorMapper.pasteFromClipboard()" class="text-[10px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1.5 transition-colors">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                            Panodan Yapıştır
                        </button>
                    </div>
                    <div class="flex-1 relative group">
                        <textarea id="mapper-input" 
                            class="w-full h-full bg-black/40 border border-white/5 rounded-2xl p-4 text-[11px] font-mono text-emerald-400/90 resize-none focus:outline-none focus:border-violet-500/40 focus:ring-4 focus:ring-violet-500/5 transition-all scrollbar-custom"
                            placeholder="*** Variables ***
\${selector_login_email_inp}    id=com.app:id/email_field
..." spellcheck="false"></textarea>
                    </div>
                </div>

                <!-- Action Central -->
                <div class="px-5 py-2">
                    <button id="mapper-run-btn" onclick="window.runLocatorMapping()" 
                        class="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-emerald-600 hover:brightness-110 text-white text-xs font-black uppercase tracking-widest shadow-[0_10px_30px_-10px_rgba(139,92,246,0.5)] transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50">
                        <div id="mapper-run-icon">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.503 1.51a2 2 0 01-3.116 1.107l-1.66-1.106a2 2 0 00-2.455.228l-1.51 1.51a2 2 0 01-3.414-1.414V5a2 2 0 012-2h2.243a2 2 0 011.832 1.243L11.586 7a2 2 0 011.414.586L15 9.586a2 2 0 01.586 1.414V11a2 2 0 00.586 1.414l1.586 1.586a2 2 0 001.414.586h.586a2 2 0 012 2v2.243a2 2 0 01-1.745 1.986l-1.51.503a2 2 0 00-1.414 1.96v2.387a2 2 0 00.547 1.022l1.66 1.66a2 2 0 01-2.828 2.828l-1.66-1.66a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.503 1.51a2 2 0 01-3.116 1.107l-1.66-1.106a2 2 0 00-2.455.228l-1.51 1.51a2 2 0 01-3.414-1.414V5a2 2 0 012-2h2.243a2 2 0 011.832 1.243L11.586 7a2 2 0 011.414.586L15 9.586a2 2 0 01.586 1.414V11a2 2 0 00.586 1.414l1.586 1.586a2 2 0 001.414.586h.586a2 2 0 012 2v2.243a2 2 0 01-1.745 1.986l-1.51.503a2 2 0 00-1.414 1.96v2.387z" />
                            </svg>
                        </div>
                        <svg id="mapper-loading-icon" class="w-5 h-5 animate-spin hidden" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span id="mapper-btn-text">Dönüştürmeyi Başlat</span>
                    </button>
                </div>

                <!-- Output Section -->
                <div class="p-5 flex-1 flex flex-col min-h-0 border-t border-white/5 bg-black/10">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <label class="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Dönüştürülen Locator'lar</label>
                            <span id="mapper-stats" class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hidden"></span>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.locatorMapper.copyOutput()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all tooltip-btn" data-tooltip="Kopyala">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                            </button>
                            <button onclick="window.locatorMapper.downloadOutput()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all tooltip-btn" data-tooltip="İndir">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="flex-1 relative">
                        <textarea id="mapper-output" 
                            class="w-full h-full bg-black/60 border border-white/5 rounded-2xl p-4 text-[11px] font-mono text-cyan-400 resize-none focus:outline-none focus:border-emerald-500/30 transition-all scrollbar-custom outline-none"
                            placeholder="Sonuçlar burada listelenecek..." spellcheck="false" readonly></textarea>
                    </div>
                </div>
            </div>

            <!-- Footer Meta -->
            <div class="px-5 py-4 border-t border-white/5 bg-black/40">
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <p class="text-[10px] text-zinc-500 font-medium tracking-tight">
                        AI Motoru aktif. Locator eşleştirme için cihaz ekranını referans alır.
                    </p>
                </div>
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
        document.getElementById('mapper-output').value = '';

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
