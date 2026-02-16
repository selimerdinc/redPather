/**
 * Settings Manager
 * Handles configuration loading, saving and modal interactions.
 */
class SettingsManager {
    constructor(api, uiManager) {
        this.api = api;
        this.ui = uiManager;
    }

    openModal() {
        document.getElementById('configModal').classList.add('open');
        this.loadConfig();
    }

    closeModal() {
        document.getElementById('configModal').classList.remove('open');
    }

    async loadConfig() {
        try {
            const data = await this.api.getConfig();

            this.setVal('conf_android_pkg', data.ANDROID_PKG);
            this.setVal('conf_android_act', data.ANDROID_ACT);
            this.setVal('conf_android_device', data.ANDROID_DEVICE || 'emulator-5554');
            this.setVal('conf_ios_bundle', data.IOS_BUNDLE);
            this.setVal('conf_ios_device', data.IOS_DEVICE || 'iPhone 14');
            this.setVal('conf_ios_udid', data.IOS_UDID);
            this.setVal('conf_ios_version', data.IOS_PLATFORM_VER || '16.0');
            this.setVal('conf_ios_org', data.IOS_ORG_ID);
            this.setVal('conf_ios_sign', data.IOS_SIGN_ID || 'iPhone Developer');
            this.setVal('conf_gemini_key', data.GEMINI_API_KEY);
            this.setVal('conf_ai_prompt', data.AI_CUSTOM_PROMPT);

            // Jira Settings
            this.setVal('conf_jira_url', data.JIRA_URL);
            this.setVal('conf_jira_email', data.JIRA_EMAIL);
            this.setVal('conf_jira_project', data.JIRA_PROJECT);
            this.setVal('conf_jira_token', data.JIRA_TOKEN);

            // Export Manager için custom prompt'u cache'le
            window._cachedCustomPrompt = data.AI_CUSTOM_PROMPT || '';

            // AI Audit Prompts Listesini Yükle
            let promptList = [];
            try {
                promptList = JSON.parse(data.AI_AUDIT_PROMPTS || '[]');
            } catch (e) {
                promptList = [];
            }
            this.renderPromptRows(promptList);

        } catch (error) {
            console.error(error);
            this.ui.showToast("Hata", "Ayarlar yüklenemedi", "error");
        }
    }

    async saveConfig() {
        // Collect prompts from list
        const promptInputs = document.querySelectorAll('.audit-prompt-row input');
        const promptList = Array.from(promptInputs).map(i => i.value).filter(v => v.trim());

        const config = {
            ANDROID_PKG: this.getVal('conf_android_pkg'),
            ANDROID_ACT: this.getVal('conf_android_act'),
            ANDROID_DEVICE: this.getVal('conf_android_device'),
            IOS_BUNDLE: this.getVal('conf_ios_bundle'),
            IOS_DEVICE: this.getVal('conf_ios_device'),
            IOS_UDID: this.getVal('conf_ios_udid'),
            IOS_PLATFORM_VER: this.getVal('conf_ios_version'),
            IOS_ORG_ID: this.getVal('conf_ios_org'),
            IOS_SIGN_ID: this.getVal('conf_ios_sign'),
            GEMINI_API_KEY: this.getVal('conf_gemini_key'),
            AI_CUSTOM_PROMPT: this.getVal('conf_ai_prompt'),
            AI_AUDIT_PROMPTS: JSON.stringify(promptList),
            // Jira Settings
            JIRA_URL: this.getVal('conf_jira_url'),
            JIRA_EMAIL: this.getVal('conf_jira_email'),
            JIRA_PROJECT: this.getVal('conf_jira_project'),
            JIRA_TOKEN: this.getVal('conf_jira_token')
        };

        try {
            await this.api.saveConfig(config);
            this.closeModal();
            this.ui.showToast("Kaydedildi", "Yapılandırma güncellendi", 'success');

            // Reset profile session so it re-applies on next scan after config change
            window.resetProfileSession?.();

            // Audit drop-down'ını güncelle
            if (window.app && window.app.updateAuditPromptDropdown) {
                window.app.updateAuditPromptDropdown(promptList);
            }
        } catch (error) {
            console.error(error);
            this.ui.showToast("Hata", "Ayarlar kaydedilemedi", "error");
        }
    }

    // --- Prompt List Helpers ---
    renderPromptRows(prompts) {
        const container = document.getElementById('conf_ai_prompts_container');
        if (!container) return;
        container.innerHTML = '';
        prompts.forEach(p => this.addPromptRow(p));
    }

    addPromptRow(value = '') {
        const container = document.getElementById('conf_ai_prompts_container');
        const div = document.createElement('div');
        div.className = 'flex gap-2 audit-prompt-row';
        div.innerHTML = `
            <input type="text" value="${value}" placeholder="Örn: Sadece kritik UI hatalarını bul" 
                class="flex-1 bg-zinc-900/50 text-[10px] text-zinc-300 border border-[#27272a] rounded px-2 py-1 focus:outline-none focus:border-red-500/30">
            <button onclick="this.parentElement.remove()" class="text-gray-500 hover:text-red-500 p-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        `;
        container.appendChild(div);
    }

    // Helpers
    setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    }

    getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    // ✅ SESSION ATTACH LOGIC
    async refreshSessions() {
        const select = document.getElementById('session-list');
        if (!select) return;

        select.innerHTML = '<option value="">-- Fetching sessions... --</option>';

        try {
            const res = await this.api.getSessions();
            const sessions = res.data || [];

            select.innerHTML = '<option value="">-- Bir oturum seçin --</option>';

            if (sessions.length === 0) {
                select.innerHTML = '<option value="">Aktif oturum bulunamadı</option>';
                return;
            }

            sessions.forEach(s => {
                const caps = s.capabilities || {};
                const name = caps.deviceName || caps.device || 'Unknown Device';
                const platform = caps.platformName || 'ANDROID';
                const pkg = caps.appPackage || caps.bundleId || '';

                const option = document.createElement('option');
                option.value = JSON.stringify({ id: s.id, platform: platform });
                option.textContent = `[${platform}] ${name} (${s.id.substring(0, 8)}...) ${pkg ? '- ' + pkg : ''}`;
                select.appendChild(option);
            });

            this.ui.showToast("Yenilendi", `${sessions.length} oturum bulundu`, "info");
        } catch (e) {
            console.error("Refresh sessions error:", e);
            select.innerHTML = '<option value="">Oturumlar alınırken hata oluştu</option>';
            this.ui.showToast("Hata", "Oturumlar listelenemedi", "error");
        }
    }

    async attachToSelectedSession() {
        const select = document.getElementById('session-list');
        const val = select ? select.value : '';

        if (!val) {
            this.ui.showToast("Uyarı", "Lütfen önce bir oturum seçin", "warning");
            return;
        }

        try {
            const data = JSON.parse(val);
            this.ui.showToast("Bağlanıyor...", "Oturuma bağlantı kuruluyor...", "info");

            await this.api.attachSession(data.id, data.platform);

            this.ui.showToast("Bağlandı!", "Oturuma başarıyla bağlanıldı", "success");

            // UI'ı güncelle ve modal'ı kapa
            if (window.app) window.app.checkAiStatus();
            window.closeConfig();

            // Otomatik scan başlat
            if (window.scanScreen) {
                setTimeout(() => window.scanScreen(), 500);
            }
        } catch (e) {
            console.error("Attach session error:", e);
            this.ui.showToast("Bağlantı Başarısız", e.message || "Oturuma bağlanılamadı", "error");
        }
    }
}

// Global expose for onclick handlers
window.refreshSessions = () => {
    if (window.settings && window.settings.refreshSessions) {
        window.settings.refreshSessions();
    }
};

window.attachToSelectedSession = () => {
    if (window.settings && window.settings.attachToSelectedSession) {
        window.settings.attachToSelectedSession();
    }
};

window.SettingsManager = SettingsManager;