/**
 * AI Controller - Handles all AI-related functionality
 * Extracted from app.js for better modularity
 */

class AIController {
    constructor(api, ui) {
        this.api = api;
        this.ui = ui;
        this.isEnabled = false;
    }

    /**
     * Check if AI is enabled and update UI accordingly
     */
    async checkStatus() {
        try {
            const config = await this.api.getConfig();
            this.isEnabled = !!(config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim().length > 0);

            // Cache custom prompt globally
            window._cachedCustomPrompt = config.AI_CUSTOM_PROMPT || '';

            // Sync AI Audit Prompts
            try {
                const promptList = JSON.parse(config.AI_AUDIT_PROMPTS || '[]');
                this.updateAuditPromptDropdown(promptList);
            } catch (e) {
                console.error("Prompt sync error:", e);
            }

            // Update AI buttons visibility
            this._updateButtonVisibility();

            return this.isEnabled;
        } catch (e) {
            this.isEnabled = false;
            this._updateButtonVisibility();
            return false;
        }
    }

    _updateButtonVisibility() {
        const aiPageBtn = document.querySelector('[onclick="window.aiRecognizePage()"]');
        if (aiPageBtn) {
            aiPageBtn.style.display = this.isEnabled ? 'flex' : 'none';
        }

        const aiAuditBtn = document.getElementById('aiAuditBtn');
        if (aiAuditBtn) {
            aiAuditBtn.classList.toggle('hidden', !this.isEnabled);
        }
    }

    /**
     * AI Page Recognition
     */
    async recognizePage() {
        const screenshot = document.getElementById('screenshot').src.split(',')[1];
        if (!screenshot) {
            this.ui.showToast("Info", "Önce bir ekran tarayın", "info");
            return null;
        }

        this.ui.setLoading(true, "AI SAYFAYI TANIYOR...");
        try {
            const res = await this.api.aiRecognizePage(screenshot);
            const pageName = res.data?.page_name || res.page_name;

            if (pageName && pageName !== "unknown") {
                document.getElementById('pagePrefix').value = pageName;
                this.ui.showToast("AI Başarılı", `Sayfa: ${pageName}`, 'success');
                return pageName;
            } else {
                this.ui.showToast("AI Bilgi", "Sayfa net olarak tanınamadı", "info");
                return null;
            }
        } catch (e) {
            console.error("AI Recognize Page Error:", e);
            this.ui.showToast("AI Hatası", e.userMessage || "Sayfa tanıma başarısız", "error");
            return null;
        } finally {
            this.ui.resetState();
        }
    }

    /**
     * AI Visual Audit
     */
    async visualAudit() {
        const screenshot = document.getElementById('screenshot').src.split(',')[1];
        if (!screenshot) {
            this.ui.showToast("Info", "Önce bir ekran tarayın", "info");
            return null;
        }

        this.ui.setLoading(true, "AI GÖRSEL DENETİM YAPIYOR...");
        try {
            const custom = document.getElementById('audit-custom-prompt')?.value || '';
            const selected = document.getElementById('audit-prompt-select')?.value || '';
            const finalPrompt = custom.trim() ? custom : selected;

            const res = await this.api.visualAudit(screenshot, finalPrompt);
            const report = res.data?.report || res.report;

            if (report) {
                this.renderAuditReport(report);
                this.openAuditPanel();
                this.ui.showToast("AI Başarılı", "Görsel denetim tamamlandı", 'success');
                return report;
            } else {
                this.ui.showToast("AI Uyarı", "Rapor oluşturulamadı", "warning");
                return null;
            }
        } catch (e) {
            console.error("AI Visual Audit Error:", e);
            this.ui.showToast("AI Hatası", e.userMessage || "Görsel denetim başarısız", "error");
            return null;
        } finally {
            this.ui.resetState();
        }
    }

    /**
     * AI XPath Suggestion
     */
    async suggestXpath(element, callback) {
        this.ui.setLoading(true, "AI XPATH ÖNERİYOR...");
        try {
            const res = await this.api.aiSuggestXpath(element);
            const suggestedXpath = res.data?.xpath || res.xpath;

            if (suggestedXpath) {
                this.ui.showToast("AI Önerisi Hazır", "Yeni XPath yüklendi", 'success');
                this.ui.showConfirmModal(
                    `AI XPath Önerisi:\n\n${suggestedXpath}\n\nBu locator'ı kullanmak istiyor musunuz?`,
                    () => callback?.(suggestedXpath)
                );
                return suggestedXpath;
            } else {
                this.ui.showToast("AI Hatası", "XPath önerisi boş döndü", "warning");
                return null;
            }
        } catch (e) {
            console.error("AI XPath Suggest Error:", e);
            this.ui.showToast("AI Hatası", e.userMessage || "XPath önerisi başarısız", "error");
            return null;
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
        const container = document.getElementById('audit-content');
        if (!container) return;

        const findings = report.findings || [];
        const summary = report.summary || "Özet bilgi yok.";

        const findingHtml = findings.map((f, i) => `
            <div class="bg-zinc-700/50 rounded-lg p-3 mb-2">
                <div class="flex items-start gap-2">
                    <span class="text-lg">${f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵'}</span>
                    <div class="flex-1">
                        <h4 class="text-sm font-bold text-white mb-1">${f.title || `Bulgu #${i + 1}`}</h4>
                        <p class="text-xs text-gray-300">${f.description || ''}</p>
                        ${f.suggestion ? `<p class="text-xs text-green-400 mt-1">💡 ${f.suggestion}</p>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="mb-4 p-3 bg-zinc-800 rounded-lg">
                <h3 class="text-sm font-bold text-white mb-2">📋 Özet</h3>
                <p class="text-xs text-gray-300">${summary}</p>
            </div>
            <div>
                <h3 class="text-sm font-bold text-white mb-2">🔍 Bulgular (${findings.length})</h3>
                ${findingHtml || '<p class="text-xs text-gray-500">Herhangi bir bulgu yok.</p>'}
            </div>
        `;
    }

    updateAuditPromptDropdown(prompts) {
        const select = document.getElementById('audit-prompt-select');
        if (!select) return;

        const defaults = [
            { text: "🇹🇷 Türkçe (Varsayılan)", val: "Yanıtı Türkçe ver." },
            { text: "🇺🇸 English", val: "Give response in English." }
        ];

        select.innerHTML = defaults.map(d => `<option value="${d.val}">${d.text}</option>`).join('');

        prompts.forEach(p => {
            if (!p || !p.trim()) return;
            const opt = document.createElement('option');
            opt.value = p;
            opt.innerText = p.length > 50 ? p.substring(0, 50) + '...' : p;
            select.appendChild(opt);
        });
    }
}

// Export to window for global access
window.AIController = AIController;
