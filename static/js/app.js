/**
 * RED PATHER - MAIN CONTROLLER
 * Orchestrates Components and Services.
 * Fully Modularized & OOP.
 */

class AppController {
    constructor() {
        // Services
        this.api = window.api;
        this.state = window.appState;

        // Managers (Components)
        this.ui = new UIManager();
        this.settings = new SettingsManager(this.api, this.ui);
        window.settings = this.settings; // Global erişim için
        this.exportMgr = new ExportManager(this.state, this.ui);

        // UI Components
        this.xmlViewer = null;
        this.overlayMgr = null;
        this.listMgr = null;
        this.contextMenu = null; // ✅ YENİ: Context Menu

        // Runtime Data
        this.currentPlatform = "ANDROID";
        this.deletedLocators = new Set();
        this.allElements = [];
        this.isAiEnabled = false;
        this.filterDebounceTimer = null; // ✅ YENİ: Debounce için
        this.logTimer = null; // ✅ YENİ: Memory leak önleme

        // ✅ YENİ: AI caching state
        this.lastSourceHash = null;
        this.lastHeuristicPageName = null;
        this.lastAiPageName = null;

        // ✅ YENİ: Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (this.logTimer) clearInterval(this.logTimer);
            if (this.filterDebounceTimer) clearTimeout(this.filterDebounceTimer);
        });

        this.init();
    }

    init() {
        // DOM Componentlerini Başlat
        if (window.XMLTreeViewer) this.xmlViewer = new XMLTreeViewer('xml-tree-root');
        if (window.OverlayManager) this.overlayMgr = new OverlayManager('overlays', 'screenshot');
        if (window.ElementListManager) this.listMgr = new ElementListManager('elements-list');

        // ✅ YENİ: Context Menu Başlat
        if (window.ContextMenu) this.contextMenu = new ContextMenu();

        // Global fonksiyonları bağla
        this.bindGlobals();

        // State değişikliklerini dinle
        this.state.subscribe('ui.currentHoverIndex', (idx) => this.handleHighlight(idx));
        this.state.subscribe('elements', (elements) => this.renderAll(elements));

        // Keyboard Shortcuts
        this.setupKeyboardShortcuts();

        // AI Durumunu Kontrol Et
        this.checkAiStatus();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modKey = isMac ? e.metaKey : e.ctrlKey;

            // Input veya textarea içindeyse çık
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Cmd/Ctrl + S: Scan
            if (modKey && e.key === 's') {
                e.preventDefault();
                window.scanScreen?.();
                this.ui.showToast("⌨️ Kısayol", "Taranıyor...", "info");
            }

            // Cmd/Ctrl + Shift + R: Refresh
            if (modKey && e.shiftKey && e.key === 'r') {
                e.preventDefault();
                window.scanScreen?.();
                this.ui.showToast("⌨️ Kısayol", "Yenileniyor...", "info");
            }

            // Escape: Close modals
            if (e.key === 'Escape') {
                // Native modalları sadece gizle (DOM'dan kaldırma!)
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
                // Dinamik olarak oluşturulan modalları kaldır, statik olanları gizle
                document.querySelectorAll('[id$="Modal"]:not(#configModal):not(#confirmModal)').forEach(m => {
                    if (m.id === 'aiKeywordsModal') {
                        m.classList.add('hidden');
                    } else {
                        m.remove();
                    }
                });
                this.contextMenu?.hide?.();
            }

            // Cmd/Ctrl + F: Focus element search (eğer varsa)
            if (modKey && e.key === 'f') {
                const searchInput = document.getElementById('elementSearchInput');
                if (searchInput) {
                    e.preventDefault();
                    searchInput.focus();
                }
            }
        });
    }

    async checkAiStatus() {
        try {
            const config = await this.api.getConfig();
            this.isAiEnabled = !!(config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim().length > 0);

            // Custom prompt'u global cache'le (Export Manager için)
            window._cachedCustomPrompt = config.AI_CUSTOM_PROMPT || '';

            // AI Audit Prompts Listesini Senkronize Et
            try {
                const promptList = JSON.parse(config.AI_AUDIT_PROMPTS || '[]');
                this.updateAuditPromptDropdown(promptList);
            } catch (e) {
                console.error("Prompt sync error:", e);
            }

            // UI Güncellemeleri - AI Butonları
            const aiPageBtn = document.querySelector('[onclick="window.aiRecognizePage()"]');
            if (aiPageBtn) {
                aiPageBtn.style.display = this.isAiEnabled ? 'flex' : 'none';
            }

            // AUDIT butonu - AI yoksa gizle
            const aiAuditBtn = document.getElementById('aiAuditBtn');
            if (aiAuditBtn) {
                if (this.isAiEnabled) {
                    aiAuditBtn.classList.remove('hidden');
                } else {
                    aiAuditBtn.classList.add('hidden');
                }
            }

            // Element listesini yenile (AI butonları için)
            if (this.allElements.length > 0) {
                this.state.set('elements', [...this.allElements]);
            }
        } catch (e) {
            this.isAiEnabled = false;
            // Hata durumunda da AUDIT butonunu gizle
            const aiAuditBtn = document.getElementById('aiAuditBtn');
            if (aiAuditBtn) aiAuditBtn.classList.add('hidden');
        }
    }

    // --- Core Actions ---

    async scanScreen() {
        const verify = document.getElementById('autoVerify').checked;
        let prefix = document.getElementById('pagePrefix').value || "page";

        this.ui.setLoading(true, "ANALİZ EDİLİYOR...");
        this.ui.showEmptyState(false);
        this.clearData();

        try {
            // İlk scan'ı yap (screenshot almak için)
            const data = await this.api.scan(this.currentPlatform, verify, prefix);

            // AI Optimizasyonu: Sayfa değişmediyse veya isim zaten belirlenmişse tekrar sorma
            let skipAi = false;

            // 1. Durum: Aynı source hash (kesinlikle aynı ekran)
            if (this.lastSourceHash === data.source_hash && this.lastAiPageName) {
                console.log("🚀 Skipping AI: Source hash is identical");
                skipAi = true;
            }

            // 2. Durum: AI daha önce bir isim bulmuş ve heuristic isim hala aynı (muhtemelen aynı sayfa, ufak değişiklikler var)
            if (!skipAi && this.lastHeuristicPageName === data.page_name && this.lastAiPageName) {
                console.log("🚀 Skipping AI: Heuristic page name matches previous state");
                skipAi = true;
            }

            // AI ile otomatik sayfa adı belirleme
            if (this.isAiEnabled && data.image && !skipAi) {
                try {
                    this.ui.setLoading(true, "AI SAYFA ADI BELİRLİYOR...");
                    const aiRes = await this.api.aiRecognizePage(data.image);
                    const pageName = aiRes.data?.page_name || aiRes.page_name;

                    if (pageName && pageName !== "unknown" && pageName !== "page") {
                        const cleanNewPage = pageName.replace(/_screen$/, '').replace(/_page$/, '');

                        // State'i güncelle
                        this.lastAiPageName = cleanNewPage;
                        this.lastHeuristicPageName = data.page_name;
                        this.lastSourceHash = data.source_hash;

                        document.getElementById('pagePrefix').value = cleanNewPage;
                        data.page_name = cleanNewPage;
                        prefix = cleanNewPage;

                        // Element isimlerini güncelle
                        this._applyPagePrefixToElements(data, cleanNewPage);
                        this.ui.showToast("🤖 AI", `Sayfa: ${cleanNewPage}`, "info");
                    }
                } catch (aiError) {
                    console.warn("AI page recognition skipped:", aiError.message);
                }
            } else if (skipAi && this.lastAiPageName) {
                // Skip edildiyse eski AI ismini kullan
                document.getElementById('pagePrefix').value = this.lastAiPageName;
                data.page_name = this.lastAiPageName;
                prefix = this.lastAiPageName;
                this._applyPagePrefixToElements(data, this.lastAiPageName);
                console.info("💡 Using cached AI page name:", this.lastAiPageName);
            }

            this.handleScanResult(data);
        } catch (error) {
            console.error(error);
            this.ui.showToast("Hata", error.userMessage || error.message || "Tarama başarısız oldu", "error");
            this.ui.resetState();
            this.ui.showEmptyState(true);
        }
    }

    _applyPagePrefixToElements(data, cleanNewPage) {
        if (data.elements && data.elements.length > 0) {
            data.elements = data.elements.map(el => {
                if (el.variable) {
                    let content = el.variable.replace('${selector_', '').replace('}', '');
                    let parts = content.split('_');
                    parts[0] = cleanNewPage;
                    const uniqueParts = [];
                    parts.forEach(p => {
                        if (uniqueParts.length === 0 || p !== uniqueParts[uniqueParts.length - 1]) {
                            uniqueParts.push(p);
                        }
                    });
                    el.variable = `\${selector_${uniqueParts.join('_')}}`;
                }
                return el;
            });
        }
    }
    handleScanResult(data) {
        const img = document.getElementById('screenshot');
        img.src = "data:image/png;base64," + data.image;

        if (data.window_w && this.overlayMgr) {
            this.overlayMgr.setDeviceSize(data.window_w, data.window_h);
        }

        img.onload = () => {
            this.ui.resetState();
            this.ui.showEmptyState(false);
            if (data.page_name) document.getElementById('pagePrefix').value = data.page_name;

            const validElements = data.elements.filter(el => !this.deletedLocators.has(el.locator));
            this.allElements = validElements.map((el, idx) => ({ ...el, index: idx, isDeleted: false }));

            this.state.set('elements', this.allElements);

            // ✅ EKLE: Element varsa kopyalama butonlarını göster
            if (validElements.length > 0) {
                const copyBtn = document.getElementById('copyAllBtn');
                const copyAIBtn = document.getElementById('copyAllAIBtn');
                const translateBtn = document.getElementById('translateAIBtn');
                if (copyBtn) copyBtn.classList.remove('hidden', 'opacity-0', 'scale-95');
                if (copyAIBtn) copyAIBtn.classList.remove('hidden', 'opacity-0', 'scale-95');
                if (translateBtn) translateBtn.classList.remove('hidden', 'opacity-0', 'scale-95');
            }

            if (this.xmlViewer) this.xmlViewer.render(data.raw_source || "");
            this.ui.showToast("Başarılı", `${validElements.length} eleman bulundu`, 'success');

            // ✅ YENİ: Bağlantı durumunu güncelle
            this.updateConnectionStatus(true);
        };
    }

    // ✅ YENİ: Bağlantı durumu göstergesi
    updateConnectionStatus(isConnected) {
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');

        if (dot && text) {
            if (isConnected) {
                dot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse transition-colors';
                text.textContent = 'BAĞLI';
                text.className = 'text-[9px] font-bold text-green-500 uppercase tracking-wider';
            } else {
                dot.className = 'w-2 h-2 rounded-full bg-red-500 transition-colors';
                text.textContent = 'BAĞLANTI YOK';
                text.className = 'text-[9px] font-bold text-red-500 uppercase tracking-wider';
            }
        }
    }

    // ✅ YENİ: Kayıt adım sayacı
    updateStepCounter() {
        const badge = document.getElementById('stepCountBadge');
        const steps = this.state.get('recorder.steps');
        const count = steps ? steps.length : 0;

        if (badge) {
            if (count > 0 && this.state.get('recorder.isRecording')) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    async performTap(x, y, imgW, imgH) {
        this.ui.setLoading(true, "TIKLANIYOR...");
        try {
            const res = await this.api.tap(x, y, imgW, imgH, this.currentPlatform);

            // --- AI HEALING CHECK ---
            if (res.data && res.data.healed) {
                this.handleHealedResponse(res.data);
            }

            if (this.state.get('recorder.isRecording') && res.data && res.data.smart_action) {
                this.state.addStep(res.data.smart_action);
            }
            this.scanScreen();
        } catch (e) {
            this.ui.showToast("Hata", e.userMessage || e.message || "Tıklama başarısız", "error");
            this.ui.resetState();
        }
    }

    async performScroll(direction) {
        this.ui.setLoading(true, "KAYDIRILIYOR...");
        try {
            await this.api.scroll(direction, this.currentPlatform);
            if (this.state.get('recorder.isRecording')) this.state.addStep({ type: 'scroll', direction });
            this.scanScreen();
        } catch (e) {
            this.ui.showToast("Hata", e.userMessage || e.message || "Kaydırma başarısız", "error");
            this.ui.resetState();
        }
    }

    async triggerAction(actionName) {
        this.ui.setLoading(true, `${actionName.toUpperCase()}...`);
        try {
            if (actionName === 'back') await this.api.back();
            if (actionName === 'hideKeyboard') await this.api.hideKeyboard();
            if (this.state.get('recorder.isRecording')) this.state.addStep({ type: actionName });
            this.scanScreen();
        } catch (e) {
            this.ui.showToast("Hata", e.userMessage || e.message || `${actionName} işlemi başarısız`, "error");
            this.ui.resetState();
        }
    }

    async aiRecognizePage() {
        const screenshot = document.getElementById('screenshot').src.split(',')[1];
        if (!screenshot) return this.ui.showToast("Info", "Önce bir ekran tarayın", "info");

        this.ui.setLoading(true, "AI SAYFAYI TANIYOR...");
        try {
            const res = await this.api.aiRecognizePage(screenshot);
            // ✅ FIX: API returns {data: {page_name: "..."}} not {page_name: "..."}
            const pageName = res.data?.page_name || res.page_name;

            if (pageName && pageName !== "unknown") {
                document.getElementById('pagePrefix').value = pageName;
                this.ui.showToast("AI Başarılı", `Sayfa: ${pageName}`, 'success');
            } else {
                this.ui.showToast("AI Bilgi", "Sayfa net olarak tanınamadı", "info");
            }
        } catch (e) {
            console.error("AI Recognize Page Error:", e);
            this.ui.showToast("AI Hatası", e.userMessage || "Sayfa tanıma başarısız", "error");
        } finally {
            this.ui.resetState();
        }
    }

    async aiVisualAudit() {
        const screenshot = document.getElementById('screenshot').src.split(',')[1];
        if (!screenshot) return this.ui.showToast("Info", "Önce bir ekran tarayın", "info");

        this.ui.setLoading(true, "AI GÖRSEL DENETİM YAPIYOR...");
        try {
            // Prompt logic
            const custom = document.getElementById('audit-custom-prompt')?.value || '';
            const selected = document.getElementById('audit-prompt-select')?.value || '';
            const finalPrompt = custom.trim() ? custom : selected;

            const res = await this.api.visualAudit(screenshot, finalPrompt);
            // ✅ FIX: API returns {data: {report: {...}}} not {report: {...}}
            const report = res.data?.report || res.report;

            if (report) {
                this.renderAuditReport(report);
                this.openAuditPanel();
                this.ui.showToast("AI Başarılı", "Görsel denetim tamamlandı", 'success');
            } else {
                this.ui.showToast("AI Uyarı", "Rapor oluşturulamadı", "warning");
            }
        } catch (e) {
            console.error("AI Visual Audit Error:", e);
            this.ui.showToast("AI Hatası", e.userMessage || "Görsel denetim başarısız", "error");
        } finally {
            this.ui.resetState();
        }
    }

    openAuditPanel() {
        const panel = document.getElementById('audit-panel');
        if (panel) panel.classList.remove('translate-x-full');
    }

    closeAuditPanel() {
        const panel = document.getElementById('audit-panel');
        if (panel) panel.classList.add('translate-x-full');
    }

    renderAuditReport(report) {
        // ... (existing renderAuditReport code)
        const container = document.getElementById('audit-content');
        if (!container) return;

        let html = `
            <div class="bg-black/40 p-3 rounded-lg border border-[#27272a] mb-2">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] text-gray-500 font-bold uppercase">Genel Skor</span>
                    <span class="text-lg font-bold ${report.overall_score > 80 ? 'text-green-500' : 'text-yellow-500'}">${report.overall_score}/100</span>
                </div>
                <p class="text-[10px] text-gray-400 leading-tight">${report.summary}</p>
            </div>
        `;

        report.findings.forEach(finding => {
            const severityColor = finding.severity === 'high' ? 'red' : (finding.severity === 'medium' ? 'yellow' : 'blue');
            const typeEmoji = { 'UI': '🎨', 'UX': '🧠', 'Design': '📐', 'Accessibility': '♿' }[finding.type] || '🔍';

            html += `
                <div class="bg-[#1c1c1f] border-l-4 border-${severityColor}-600 p-3 rounded-r-lg shadow-lg">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-bold text-white uppercase flex items-center gap-1">
                            ${typeEmoji} ${finding.type}
                        </span>
                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-${severityColor}-900 text-${severityColor}-300 font-bold uppercase">
                            ${finding.severity}
                        </span>
                    </div>
                    <h4 class="text-xs font-bold text-white mb-1">${finding.title}</h4>
                    <p class="text-[10px] text-gray-400 leading-normal mb-2">${finding.description}</p>
                    <div class="bg-black/30 p-2 rounded text-[10px] text-green-400 border border-green-900/30">
                        <span class="font-bold">💡 Öneri:</span> ${finding.recommendation}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // --- LOG INSPECTOR ---

    toggleLogPanel() {
        const panel = document.getElementById('log-panel');
        const isOpen = !panel.classList.contains('translate-y-full');

        if (isOpen) {
            panel.classList.add('translate-y-full');
            if (this.logTimer) clearInterval(this.logTimer);
        } else {
            panel.classList.remove('translate-y-full');
            this.startLogMirroring();
        }
    }

    startLogMirroring() {
        if (this.logTimer) clearInterval(this.logTimer);
        this.fetchLogs();
        this.logTimer = setInterval(() => this.fetchLogs(), 3000);
    }

    async fetchLogs() {
        try {
            const type = document.getElementById('log-type-select')?.value || '';
            const res = await this.api.getLogs(type);
            // API'dan gelen veriyi kontrol et
            const logs = res?.data || res || [];
            if (Array.isArray(logs) && logs.length > 0) {
                this.renderLogs(logs);
            } else {
                // İlk açılışta boşsa bilgi mesajı göster
                const container = document.getElementById('log-content');
                if (container && container.children.length <= 1) {
                    container.innerHTML = '<div class="text-gray-500 italic text-[10px]">Log bulunamadı. Cihazın bağlı ve uygulamanın açık olduğundan emin olun.</div>';
                }
            }
        } catch (e) {
            console.error("Log fetch error:", e);
        }
    }

    renderLogs(logs) {
        const container = document.getElementById('log-content');
        if (!container || logs.length === 0) return;

        logs.forEach(log => {
            const msg = typeof log === 'string' ? log : (log.message || JSON.stringify(log));
            const div = document.createElement('div');

            // Renklendirme mantığı
            let color = 'text-gray-400';
            if (msg.includes('ERROR') || msg.includes('fail')) color = 'text-red-400';
            else if (msg.includes('WARN')) color = 'text-yellow-400';
            else if (msg.includes('HTTP')) color = 'text-blue-400';
            else if (msg.includes('COMMAND')) color = 'text-green-400';

            div.className = `${color} border-b border-white/5 py-0.5`;
            div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            container.appendChild(div);

            // Maksimum 500 satır tut
            if (container.children.length > 500) container.removeChild(container.firstChild);
        });

        // Auto-scroll
        container.scrollTop = container.scrollHeight;
    }

    clearLogs() {
        const container = document.getElementById('log-content');
        if (container) container.innerHTML = '<div class="text-gray-600 italic font-mono">Loglar temizlendi.</div>';
    }

    async startAiXpathSuggest(element, index) {
        const item = this.allElements.find(el => el.index === index);
        if (!item) return;

        this.ui.setLoading(true, "AI XPATH ÖNERİYOR...");
        try {
            const res = await this.api.aiSuggestXpath(item);
            // ✅ FIX: API returns {data: {xpath: "..."}} not {xpath: "..."}
            const suggestedXpath = res.data?.xpath || res.xpath;

            if (suggestedXpath) {
                this.ui.showToast("AI Önerisi Hazır", "Yeni XPath yüklendi", 'success');
                this.ui.showConfirmModal(`AI XPath Önerisi:\n\n${suggestedXpath}\n\nBu locator'ı kullanmak istiyor musunuz?`, () => {
                    item.locator = suggestedXpath;
                    this.state.set('elements', [...this.allElements]);
                    this.ui.showToast("Güncellendi", "XPath AI tarafından güncellendi", "success");
                });
            } else {
                this.ui.showToast("AI Hatası", "XPath önerisi boş döndü", "warning");
            }
        } catch (e) {
            console.error("AI XPath Suggest Error:", e);
            this.ui.showToast("AI Hatası", e.userMessage || "XPath önerisi başarısız", "error");
        } finally {
            this.ui.resetState();
        }
    }

    // --- ✅ YENİ: Context Menu Handlers (Send Keys & Assertions) ---
    // Bu kısım senin yüklediğin dosyada eksikti!

    handleSendKeys(element) {
        // ui-manager'a eklediğimiz showPromptModal'ı çağırıyoruz
        this.ui.showPromptModal(`Metin Gönder: ${element.variable}`, "", async (text) => {
            if (!text) return;

            this.ui.setLoading(true, "METİN GÖNDERİLİYOR...");
            try {
                // api.service'e eklediğimiz sendKeys'i çağırıyoruz (locator, text)
                await this.api.sendKeys(element.locator, text);

                if (this.state.get('recorder.isRecording')) {
                    this.state.addStep({
                        type: 'send_keys',
                        locator: element.locator,
                        text: text
                    });
                }

                this.ui.showToast("Başarılı", "Metin başarıyla gönderildi");
                this.scanScreen();
            } catch (e) {
                this.ui.showToast("Hata", "Metin gönderme başarısız", "error");
                this.ui.resetState();
            }
        });
    }

    async handleAssertion(type, element) {
        if (!this.state.get('recorder.isRecording')) {
            this.ui.showToast("Bilgi", "Doğrulama eklemek için önce Kaydı başlatın", "info");
            return;
        }

        if (type === 'visibility') {
            this.state.addStep({
                type: 'assert_visible',
                locator: element.locator
            });
            this.ui.showToast("Doğrulama Eklendi", "Görünürlük Kontrolü");
        }
        else if (type === 'text') {
            this.ui.setLoading(true, "METİN ALINIYOR...");
            try {
                // api.service'e eklediğimiz getElementText'i çağırıyoruz
                const res = await this.api.getElementText(element.locator);
                const text = res.text;

                this.state.addStep({
                    type: 'assert_text',
                    locator: element.locator,
                    expected: text
                });
                this.ui.showToast("Doğrulama Eklendi", `Metin Kontrolü: "${text}"`);
            } catch (e) {
                this.ui.showToast("Hata", "Eleman metni okunamadı", "error");
            } finally {
                this.ui.resetState();
            }
        }
    }

    // --- Helpers ---

    clearData() {
        this.allElements = [];
        this.state.set('ui.currentHoverIndex', -1);

        const copyBtn = document.getElementById('copyAllBtn');
        const copyAIBtn = document.getElementById('copyAllAIBtn');
        const translateBtn = document.getElementById('translateAIBtn');
        if (copyBtn) copyBtn.classList.add('hidden', 'opacity-0', 'scale-95');
        if (copyAIBtn) copyAIBtn.classList.add('hidden', 'opacity-0', 'scale-95');
        if (translateBtn) translateBtn.classList.add('hidden', 'opacity-0', 'scale-95');

        if (this.listMgr) this.listMgr.render([]);
        if (this.overlayMgr) this.overlayMgr.render([]);
        if (this.xmlViewer && document.getElementById('xml-tree-root')) {
            document.getElementById('xml-tree-root').innerHTML = '';
        }
    }


    renderAll(elements) {
        if (this.listMgr) this.listMgr.render(elements);
        if (this.overlayMgr) this.overlayMgr.render(elements);
    }

    updateAuditPromptDropdown(prompts) {
        const select = document.getElementById('audit-prompt-select');
        if (!select) return;

        // Varsayılanları tanımla
        const defaults = [
            { text: "🇹🇷 Türkçe (Varsayılan)", val: "Yanıtı Türkçe ver." },
            { text: "🇺🇸 English", val: "Give response in English." }
        ];

        // Temizle ve varsayılanları koy
        select.innerHTML = defaults.map(d => `<option value="${d.val}">${d.text}</option>`).join('');

        // Kullanıcı promptlarını ekle
        prompts.forEach(p => {
            if (!p || !p.trim()) return;
            const opt = document.createElement('option');
            opt.value = p;
            opt.innerText = p.length > 50 ? p.substring(0, 50) + '...' : p;
            select.appendChild(opt);
        });
    }

    handleHighlight(index) {
        this.state.set('ui.currentHoverIndex', index);
    }

    // HTML tarafının erişmesi için global fonksiyonlar
    bindGlobals() {
        // Store original scan function for config-profiles hook to find
        window._appScanScreen = () => this.scanScreen();
        window.scanScreen = window._appScanScreen;
        window.scanPage = window.scanScreen; // Alias for backward compatibility

        window.performTap = (x, y, w, h) => this.performTap(x, y, w, h);
        window.performScroll = (dir) => this.performScroll(dir);
        window.triggerBack = () => this.triggerAction('back');
        window.triggerHideKeyboard = () => this.triggerAction('hideKeyboard');

        window.toggleNavMode = (el) => {
            this.ui.toggleNavMode(el.checked);
            this.clearData();
            this.state.set('ui.currentHoverIndex', -1);
        };
        window.toggleVerifyUI = (el) => this.ui.toggleVerifyMode(el.checked);
        window.setPlatform = (platform) => {
            this.currentPlatform = platform.toUpperCase();
            window.appState?.setPlatform(this.currentPlatform);
            this.ui.togglePlatform(this.currentPlatform);
            window.debug?.log(`🌐 Platform switched to: ${this.currentPlatform}`);
        };
        window.togglePlatform = () => {
            const next = this.currentPlatform === "ANDROID" ? "IOS" : "ANDROID";
            window.setPlatform(next);
        };
        window.toggleSourceView = (mode) => {
            this.ui.toggleSourceView(mode);
        };

        window.openConfig = () => this.settings.openModal();
        window.closeConfig = () => this.settings.closeModal();
        window.saveConfig = async () => {
            await this.settings.saveConfig();
            await this.checkAiStatus();
        };
        window.toggleRecordMode = () => this.exportMgr.toggleRecordMode();
        window.aiRecognizePage = () => this.aiRecognizePage();
        window.aiVisualAudit = () => this.aiVisualAudit();
        window.closeAuditPanel = () => this.closeAuditPanel();
        window.toggleLogPanel = () => this.toggleLogPanel();
        window.clearLogs = () => this.clearLogs();
        window.exportMgr = this.exportMgr;

        // Element Search/Filter (✅ DEBOUNCED for performance)
        window.filterElements = (query) => {
            // Debounce: Wait 150ms after typing stops
            if (this.filterDebounceTimer) clearTimeout(this.filterDebounceTimer);

            this.filterDebounceTimer = setTimeout(() => {
                const searchQuery = query.toLowerCase().trim();
                const clearBtn = document.getElementById('clearSearchBtn');
                if (clearBtn) clearBtn.classList.toggle('hidden', !searchQuery);

                const items = document.querySelectorAll('#elements-list > div');
                let visibleCount = 0;

                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const match = !searchQuery || text.includes(searchQuery);
                    item.style.display = match ? '' : 'none';
                    if (match) visibleCount++;
                });

                // Count güncelle
                const countEl = document.getElementById('element-count');
                if (countEl && searchQuery) {
                    countEl.textContent = `${visibleCount}/${this.allElements.length}`;
                }
            }, 150); // 150ms debounce
        };

        // Copy with Feedback
        window.copyWithFeedback = async (text, label = 'Copied') => {
            try {
                await navigator.clipboard.writeText(text);
                this.ui.showToast("📋 " + label, text.substring(0, 50) + (text.length > 50 ? '...' : ''), "success");
                return true;
            } catch (e) {
                this.ui.showToast("Error", "Copy failed", "error");
                return false;
            }
        };

        // JIRA INTEGRATION
        window.testJiraConnection = async () => {
            this.ui.showToast("Testing...", "Checking Jira connection", "info");
            try {
                // Modal'daki değerleri al
                const config = {
                    base_url: document.getElementById('conf_jira_url')?.value || '',
                    email: document.getElementById('conf_jira_email')?.value || '',
                    api_token: document.getElementById('conf_jira_token')?.value || '',
                    project_key: document.getElementById('conf_jira_project')?.value || ''
                };

                // Boş alan kontrolü - token boşsa kayıtlı config'i kullanmayı dene
                if (!config.api_token) {
                    try {
                        const savedConfig = await this.api.getConfig();
                        if (savedConfig?.data?.JIRA_TOKEN) {
                            config.api_token = savedConfig.data.JIRA_TOKEN;
                        }
                    } catch (e) { }
                }

                if (!config.base_url || !config.email || !config.api_token || !config.project_key) {
                    this.ui.showToast("Missing Info", "Please fill all Jira fields", "error");
                    return;
                }

                window.debug?.log("Jira Config:", { ...config, api_token: "***" });

                await this.api.configureJira(config);
                const res = await this.api.testJiraConnection();

                window.debug?.log("Jira Test Response:", res);

                if (res?.connected) {
                    this.ui.showToast("Connected!", `Logged in as ${res.user}`, "success");
                } else {
                    const errMsg = res?.error?.detail || res?.error?.message || res?.message || "Connection failed";
                    this.ui.showToast("Failed", errMsg, "error");
                }
            } catch (e) {
                console.error("Jira test error:", e);
                this.ui.showToast("Error", e.userMessage || e.message || "Connection test failed", "error");
            }
        };

        window.createJiraIssue = async (elementInfo = null) => {
            const screenshot = document.getElementById('screenshot')?.src;

            // 1. Summary sor
            const summary = prompt("Bug Özeti:", elementInfo ? `${elementInfo.locator} ile ilgili sorun` : "Uygulamada hata bulundu");
            if (!summary) return;

            this.ui.showToast("AI Analiz Ediyor...", "Hata açıklaması oluşturuluyor", "info");

            // Config ve Session'dan cihaz/uygulama bilgilerini al
            let deviceInfo = "";
            let platformVersion = "";
            try {
                const config = await this.api.getConfig();

                // Session'dan platform sürümünü al
                try {
                    const sessions = await this.api.getSessions();
                    if (sessions?.length > 0) {
                        platformVersion = sessions[0]?.capabilities?.platformVersion || '';
                    }
                } catch (e) { }

                if (this.currentPlatform === "ANDROID") {
                    deviceInfo = `
**Cihaz Bilgileri**
- Platform: Android ${platformVersion || ''}
- Cihaz: ${config?.ANDROID_DEVICE || 'Bilinmiyor'}
- Paket Adı: ${config?.ANDROID_PKG || 'Bilinmiyor'}`;
                } else {
                    deviceInfo = `
**Cihaz Bilgileri**
- Platform: iOS ${platformVersion || ''}
- Cihaz: ${config?.IOS_DEVICE || 'Bilinmiyor'}
- Bundle ID: ${config?.IOS_BUNDLE || 'Bilinmiyor'}`;
                }
            } catch (e) {
                deviceInfo = `\n**Platform**: ${this.currentPlatform}`;
            }

            // 2. AI ile description oluştur
            let aiDescription = "";
            try {
                const aiRes = await this.api.generateBugDescription(screenshot, elementInfo, this.currentPlatform);
                if (aiRes?.description) {
                    aiDescription = aiRes.description;
                }
            } catch (e) {
                console.warn("AI description failed, using fallback", e);
            }

            // 3. Fallback veya AI description + Cihaz bilgileri
            const pageName = document.getElementById('pagePrefix')?.value || 'Bilinmiyor';
            const timestamp = new Date().toLocaleString('tr-TR');

            const fallbackDesc = `**Hata Raporu - ${pageName}**

${deviceInfo}

**Sayfa**: ${pageName}
${elementInfo ? `**Element**: ${elementInfo.locator}` : ''}
**Zaman**: ${timestamp}

**Yeniden Üretme Adımları**:
1. Uygulamayı aç
2. ${pageName} sayfasına git
3. [Adımları tanımla]

**Beklenen Sonuç**: [Ne olması gerekiyor]
**Gerçekleşen Sonuç**: [Ne oluyor]

---
_Red Pather ile bulundu_`;

            // AI description varsa cihaz bilgilerini ekle
            const description = aiDescription
                ? `${aiDescription}\n\n---\n${deviceInfo}\n\n_Red Pather ile bulundu - ${timestamp}_`
                : fallbackDesc;

            // 4. Modal ile düzenleme imkanı sun
            this.ui.showJiraBugModal(summary, description, screenshot, async (finalSummary, finalDesc) => {
                this.ui.showToast("Creating...", "Opening Jira issue", "info");
                try {
                    const res = await this.api.createJiraIssue(finalSummary, finalDesc, screenshot);
                    if (res?.issue_key) {
                        this.ui.showToast("Created!", `${res.issue_key}`, "success");
                        window.open(res.issue_url, '_blank');
                    } else {
                        this.ui.showToast("Failed", res?.error?.message || res?.message || "Could not create issue", "error");
                    }
                } catch (e) {
                    this.ui.showToast("Error", e.userMessage || e.message || "Failed to create issue", "error");
                }
            });
        };

        // NAV MODE: Screenshot üzerinde herhangi bir yere tıklama
        window.handleScreenshotClick = (e) => {
            const isNavMode = document.body.classList.contains('nav-mode');
            if (!isNavMode && !e.shiftKey) return; // NAV mode veya Shift basılı değilse çık

            const img = e.target;
            const rect = img.getBoundingClientRect();

            // Tıklanan koordinatı hesapla (görüntü üzerindeki pozisyon)
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Görüntü boyutu ile orantıla
            const scaleX = img.naturalWidth / rect.width;
            const scaleY = img.naturalHeight / rect.height;

            const realX = Math.round(clickX * scaleX);
            const realY = Math.round(clickY * scaleY);

            window.debug?.log(`📍 Screenshot click: (${realX}, ${realY})`);

            if (window.performTap) {
                window.performTap(realX, realY, img.naturalWidth, img.naturalHeight);
            }
        };

        window.removeElement = (e, index) => {
            e.stopPropagation();
            const el = this.allElements.find(i => i.index === index);
            if (el) {
                el.isDeleted = true;
                if (el.locator) this.deletedLocators.add(el.locator);

                // KRİTİK: Referansı yenileyerek state'i tetikle
                this.state.set('elements', [...this.allElements]);

                this.ui.showToast("Silindi", "Element listeden kaldırıldı", "info");
            }
        };

        window.highlightElement = (index, scroll = false) => {
            this.state.set('ui.currentHoverIndex', index);
            if (scroll && this.listMgr) {
                // Render işleminin bitmesi için mikro bir gecikme ekliyoruz
                setTimeout(() => {
                    this.listMgr.scrollToIndex(index);
                }, 50);
            }
        };

        window.clearSelection = () => {
            this.state.set('ui.currentHoverIndex', -1);
            const svg = document.getElementById('connector-path');
            if (svg) svg.style.display = 'none';
        };

        window.startEdit = (element, index, field) => {
            const item = this.allElements.find(el => el.index === index);
            if (!item) return;
            const currentVal = item[field];
            const input = document.createElement('input');
            input.type = 'text'; input.value = currentVal; input.className = 'edit-input';
            element.innerHTML = ''; element.appendChild(input); input.focus(); element.removeAttribute('onclick');
            const finish = (save) => {
                if (save) {
                    item[field] = input.value;
                    element.innerText = input.value;
                    this.ui.showToast("Updated", "Success", 'success');
                } else {
                    element.innerText = currentVal;
                }
                element.ondblclick = () => window.startEdit(element, index, field);
            };
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); this.ui.showConfirmModal(input.value, () => finish(true), () => { finish(false); input.focus(); }); }
                if (e.key === 'Escape') finish(false); e.stopPropagation();
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        };

        window.copyAllVariables = () => {
            const active = this.allElements.filter(e => !e.isDeleted);
            if (active.length === 0) return this.ui.showToast("Info", "No elements", "info");
            let output = "*** Variables ***\n";
            active.forEach(item => {
                output += `\${${item.variable.replace(/[${}]/g, '')}}\t${item.locator}\n`;
            });
            navigator.clipboard.writeText(output).then(() => this.ui.showToast("Copied", "All variables copied"));
        };

        // AI ile değişken isimlerini çevir ve optimize et
        window.translateNamesWithAI = async () => {
            const active = this.allElements.filter(e => !e.isDeleted);
            if (active.length === 0) return this.ui.showToast("Info", "No elements", "info");

            this.ui.setLoading(true, "AI İSİMLERİ ÇEVİRİYOR...");
            try {
                // Variable isimlerini topla
                const names = active.map(el => el.variable.replace(/[${}]/g, ''));

                const result = await this.api.translateVariableNames(names);

                if (result?.translations) {
                    const translations = result.translations;
                    let updatedCount = 0;

                    // Her elementi güncelle
                    active.forEach(el => {
                        const oldName = el.variable.replace(/[${}]/g, '');
                        const newName = translations[oldName];
                        if (newName && newName !== oldName) {
                            el.variable = `\${${newName}}`;
                            updatedCount++;
                        }
                    });

                    // State'i güncelle ve listeyi yeniden render et
                    this.state.set('elements', [...this.allElements]);
                    this.listMgr?.render(this.allElements.filter(e => !e.isDeleted));

                    this.ui.showToast("✨ AI Çevirisi Tamamlandı", `${updatedCount} isim güncellendi`, "success");
                } else {
                    this.ui.showToast("AI Uyarı", "Çeviri yapılamadı", "warning");
                }
            } catch (e) {
                console.error("AI translate error:", e);
                this.ui.showToast("AI Hatası", e.userMessage || "İsim çevirisi başarısız", "error");
            } finally {
                this.ui.resetState();
            }
        };

        window.copyAllWithAI = async () => {
            const active = this.allElements.filter(e => !e.isDeleted);
            if (active.length === 0) return this.ui.showToast("Info", "No elements", "info");

            // UI Elements
            const btn = document.getElementById('copyAllAIBtn');
            const spinner = document.getElementById('aiLoadingSpinner');
            const btnText = btn?.querySelector('span');
            const btnIcon = btn?.querySelector('svg:not(#aiLoadingSpinner)');

            // Loading state
            const setLoading = (loading) => {
                if (spinner) spinner.classList.toggle('hidden', !loading);
                if (btnIcon) btnIcon.classList.toggle('hidden', loading);
                if (btnText) btnText.textContent = loading ? 'Generating...' : 'AI Keywords';
                if (btn) btn.disabled = loading;
            };

            setLoading(true);
            this.ui.showToast("🤖 AI Working", "Analyzing elements and generating keywords...", "info");

            try {
                // Element verilerini hazırla
                const elements = active.map(el => ({
                    variable: el.variable,
                    locator: el.locator,
                    class_name: el.class_name || '',
                    text: el.text || ''
                }));

                // Screenshot al (opsiyonel ama AI için faydalı)
                const screenshot = window.appState?.get('screenshot.base64') || '';

                const response = await fetch('/api/ai/generate-keywords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        elements,
                        screenshot
                    })
                });

                const result = await response.json();

                if (result.status === 'success' && result.data?.full_output) {
                    const textContent = result.data.full_output;

                    // Count generated items
                    const varCount = (textContent.match(/\$\{selector/g) || []).length;
                    const kwCount = (textContent.match(/^[A-Z][a-z]+ /gm) || []).length;

                    // Show modal with content
                    window.showAIKeywordsModal(textContent, varCount, kwCount);
                    this.ui.showToast("✨ AI Keywords Ready!", "Review and copy from modal", "success");
                } else {
                    throw new Error(result.error || 'AI generation failed');
                }
            } catch (error) {
                console.error('AI keyword generation error:', error);
                this.ui.showToast("❌ Error", error.message, "error");
            } finally {
                setLoading(false);
            }
        };

        // AI Keywords Modal Functions
        window.showAIKeywordsModal = (content, varCount, kwCount) => {
            const modal = document.getElementById('aiKeywordsModal');
            const textarea = document.getElementById('aiKeywordsContent');
            const varCountEl = document.getElementById('aiVarCount');
            const kwCountEl = document.getElementById('aiKwCount');

            if (modal && textarea) {
                textarea.value = content;
                if (varCountEl) varCountEl.textContent = varCount || 0;
                if (kwCountEl) kwCountEl.textContent = kwCount || 0;
                modal.classList.remove('hidden');
                textarea.focus();
            }
        };

        window.closeAIKeywordsModal = () => {
            const modal = document.getElementById('aiKeywordsModal');
            if (modal) modal.classList.add('hidden');
        };

        window.copyAIKeywordsFromModal = () => {
            const textarea = document.getElementById('aiKeywordsContent');
            if (!textarea) return;

            const text = textarea.value;

            // Select all and copy
            textarea.select();
            textarea.setSelectionRange(0, 99999); // For mobile

            try {
                // Try execCommand first (works in most contexts)
                document.execCommand('copy');
                this.ui.showToast("✅ Copied!", "Keywords copied to clipboard", "success");
                window.closeAIKeywordsModal();
            } catch (e) {
                // Fallback to clipboard API
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text)
                        .then(() => {
                            this.ui.showToast("✅ Copied!", "Keywords copied to clipboard", "success");
                            window.closeAIKeywordsModal();
                        })
                        .catch(() => {
                            this.ui.showToast("⚠️ Manual Copy", "Please use Ctrl+C to copy", "warning");
                        });
                } else {
                    this.ui.showToast("⚠️ Manual Copy", "Please use Ctrl+C to copy", "warning");
                }
            }
        };



        window.findElementByBounds = (x, y, w, h) => {
            // App State'e erişim (Global state)
            if (!window.appState) return -1;

            const elements = window.appState.getActiveElements();
            const tolerance = 20; // Piksel toleransı (Bazen XML ile Screenshot arasında ufak farklar olur)

            let bestMatchIndex = -1;
            let minDiff = Number.MAX_VALUE;

            elements.forEach(el => {
                // Koordinat farklarını topla (Manhattan Distance benzeri)
                const diff = Math.abs(el.coords.x - x) +
                    Math.abs(el.coords.y - y) +
                    Math.abs(el.coords.w - w) +
                    Math.abs(el.coords.h - h);

                // Eğer fark tolerans sınırları içindeyse ve şimdiye kadarki en iyi eşleşmeyse
                if (diff < tolerance && diff < minDiff) {
                    minDiff = diff;
                    bestMatchIndex = el.index;
                }
            });

            return bestMatchIndex;
        };

        // Input Modal - Metin Gönderme
        window.showInputModal = (locator, elementText) => {
            const existingModal = document.getElementById('inputModal');
            if (existingModal) existingModal.remove();

            const modalHTML = `
            <div id="inputModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] open">
                <div class="modal-container bg-[#18181b] border border-[#27272a] rounded-2xl p-6 w-96 shadow-2xl">
                    <div class="flex items-center gap-3 mb-4">
                        <span class="text-2xl">⌨️</span>
                        <div>
                            <h3 class="text-white font-bold">Send Text to Input</h3>
                            <p class="text-gray-500 text-xs">${elementText || 'Input Field'}</p>
                        </div>
                    </div>
                    <input type="text" id="inputModalText" placeholder="Enter text to send..."
                        class="w-full bg-[#09090b] text-white text-sm p-3 rounded border border-[#3f3f46] focus:border-red-500 outline-none mb-4"
                        autofocus>
                    <div class="flex gap-3 justify-end">
                        <button onclick="window.closeInputModal()" class="text-gray-400 hover:text-white text-xs font-bold px-4 py-2">Cancel</button>
                        <button onclick="window.submitInputModal('${locator.replace(/'/g, "\\'")}')" class="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-5 py-2 rounded">Send</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            const input = document.getElementById('inputModalText');
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') window.submitInputModal(locator);
                if (e.key === 'Escape') window.closeInputModal();
            });
        };

        window.closeInputModal = () => {
            const modal = document.getElementById('inputModal');
            if (modal) modal.remove();
        };

        window.submitInputModal = async (locator) => {
            const input = document.getElementById('inputModalText');
            if (!input || !input.value.trim()) return;

            const text = input.value;
            window.closeInputModal();

            this.ui.showToast("Sending...", text, "info");

            try {
                const res = await this.api.sendKeys(locator, text);

                // --- AI HEALING CHECK ---
                if (res.data && res.data.healed) {
                    this.handleHealedResponse(res.data);
                }

                // Recorder'a kaydet
                if (this.state.get('recorder.isRecording')) {
                    const finalLoc = (res.data && res.data.healed) ? res.data.new_locator : locator;
                    this.state.addStep({ type: 'send_keys', locator: finalLoc, text });
                }

                const method = res.data?.method || 'unknown';
                this.ui.showToast("Sent", `Text sent: ${text} (${method})`, "success");

                // Başarılıysa ekranı otomatik yeniliyoruz (2 saniyelik bekleme ile)
                setTimeout(() => this.scanScreen(), 2000);
            } catch (error) {
                console.error("Send Keys Error:", error);
                this.ui.showToast("Error", error.userMessage || error.message || "Request Failed", "error");
            }
        };
    }

    handleHealedResponse(data) {
        window.debug?.log("🩹 AI Healed result received:", data);

        // UI Modal göster
        this.ui.showHealingModal(data, (newLocator) => {
            // EĞER KULLANICI ONAYLARSA:
            // 1. AllElements listesinde bul ve güncelle
            const item = this.allElements.find(el => el.locator === data.old_locator);
            if (item) {
                item.locator = newLocator;
                this.state.set('elements', [...this.allElements]);
                this.ui.showToast("Updated", "Locator updated in element list", "success");
            }

            // 2. Eğer recorder açıksa, son adımı (az önce eklenen) güncellemek yerine 
            // bundan sonraki adımlarda bu yeni locator kullanılacak.
            // Zaten biz submitInputModal'da finalLoc kullandık.
        });
    }
}

window.app = new AppController();