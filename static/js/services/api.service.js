/**
 * API Service - Backend communication layer
 */

class ApiError extends Error {
    constructor(message, statusCode, userMessage, details) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.userMessage = userMessage;
        this.details = details;
    }
}

class ApiService {
    constructor() {
        this.baseUrl = '';
        this.timeout = 30000;
        this.retryAttempts = 2;
        this.retryDelay = 1000;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            method: options.method || 'GET',
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        let lastError;

        for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                const response = await fetch(url, { ...config, signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await response.json();

                if (!response.ok) {
                    // Backend create_error_response içindeki message'ı al
                    const errorMsg = data.message || data.error?.message || 'İstek başarısız oldu';
                    throw new ApiError(
                        errorMsg,
                        response.status,
                        errorMsg,
                        data.details || data.error?.details
                    );
                }
                return data.data || data;

            } catch (error) {
                lastError = error;
                if (error.name === 'AbortError') throw new ApiError('İstek zaman aşımı', 504, 'İşlem çok uzun sürdü.', 'Sunucu zaman aşımı');
                if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) throw error;
                if (attempt < this.retryAttempts) { await this.delay(this.retryDelay); continue; }
            }
        }
        throw lastError || new ApiError('Bağlantı Hatası', 500, 'Sunucu ile iletişim kurulamadı.', null);
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // ====================
    // API ENDPOINTS
    // ====================

    async getConfig() { return await this.request('/api/config', { method: 'GET' }); }
    async saveConfig(config) { return await this.request('/api/config', { method: 'POST', body: config }); }
    async scan(platform, verify, prefix) { return await this.request('/api/scan', { method: 'POST', body: { platform, verify, prefix } }); }
    async tap(x, y, img_w, img_h, platform) { return await this.request('/api/tap', { method: 'POST', body: { x, y, img_w, img_h, platform } }); }
    async scroll(direction, platform) { return await this.request('/api/scroll', { method: 'POST', body: { direction, platform } }); }
    async back() { return await this.request('/api/back', { method: 'POST' }); }
    async hideKeyboard() { return await this.request('/api/hide-keyboard', { method: 'POST' }); }
    async verifyLocator(locator) { return await this.request('/api/verify', { method: 'POST', body: { locator } }); }
    async aiRecognizePage(screenshot) { return await this.request('/api/ai/recognize-page', { method: 'POST', body: { screenshot } }); }
    async aiSuggestXpath(element) { return await this.request('/api/ai/suggest-xpath', { method: 'POST', body: { element } }); }
    async aiGenerateScript(steps, format) { return await this.request('/api/ai/generate-script', { method: 'POST', body: { steps, format } }); }

    // ✅ YENİ METODLAR
    async sendKeys(locator, text) {
        return await this.request('/api/send-keys', {
            method: 'POST',
            body: { locator, text }
        });
    }

    /**
     * Aktif Appium oturumlarını listeler
     */
    async getSessions() {
        return await this.request('/api/sessions', {
            method: 'GET'
        });
    }

    /**
     * Belirli bir oturuma bağlanır
     */
    async attachSession(sessionId, platform) {
        return await this.request('/api/sessions/attach', {
            method: 'POST',
            body: { sessionId, platform }
        });
    }

    /**
     * Belirli bir session ID'nin aktif olup olmadığını doğrular
     */
    async verifySession(sessionId) {
        return await this.request('/api/sessions/verify', {
            method: 'POST',
            body: { sessionId }
        });
    }

    async getElementText(locator) {
        return await this.request('/api/get-text', {
            method: 'POST',
            body: { locator }
        });
    }

    async visualAudit(screenshot, prompt = '') {
        return await this.request('/api/ai/audit', {
            method: 'POST',
            body: { screenshot, prompt }
        });
    }

    async getLogs(type = '') {
        return await this.request(`/api/sessions/logs?type=${type}`, { method: 'GET' });
    }

    // ✅ JIRA INTEGRATION
    async configureJira(config) {
        return await this.request('/api/jira/configure', { method: 'POST', body: config });
    }

    async testJiraConnection() {
        return await this.request('/api/jira/test', { method: 'POST' });
    }

    async createJiraIssue(summary, description, screenshot = null, priority = 'Medium') {
        return await this.request('/api/jira/create-issue', {
            method: 'POST',
            body: { summary, description, screenshot, priority, issue_type: 'Bug' }
        });
    }

    async getJiraStatus() {
        return await this.request('/api/jira/status', { method: 'GET' });
    }

    async generateBugDescription(screenshot, elementInfo = null, platform = 'ANDROID') {
        return await this.request('/api/ai/generate-bug-description', {
            method: 'POST',
            body: { screenshot, element_info: elementInfo, platform }
        });
    }

    async translateVariableNames(names) {
        return await this.request('/api/ai/translate-names', {
            method: 'POST',
            body: { names }
        });
    }

    /**
     * Cross-platform locator mapping
     * @param {string} content - Locator içeriği
     * @param {string} format - Input formatı: rf_variables, json, keyvalue
     * @param {string} sourcePlatform - Kaynak platform: ANDROID veya IOS
     * @param {string} targetPlatform - Hedef platform: ANDROID veya IOS
     * @param {string} outputFormat - Çıktı formatı: rf_variables, json, keyvalue
     */
    async mapLocators(content, format = 'rf_variables', sourcePlatform = 'ANDROID',
        targetPlatform = 'IOS', outputFormat = 'rf_variables') {
        return await this.request('/api/locator-mapper/map', {
            method: 'POST',
            body: {
                content,
                format,
                source_platform: sourcePlatform,
                target_platform: targetPlatform,
                output_format: outputFormat
            }
        });
    }

    async health() { return await this.request('/health', { method: 'GET' }); }
}

const api = new ApiService();
window.api = api;
window.ApiError = ApiError;