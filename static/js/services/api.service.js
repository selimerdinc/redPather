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
                    throw new ApiError(
                        data.error?.message || 'Request failed',
                        response.status,
                        data.error?.message || 'An error occurred',
                        data.error?.details
                    );
                }
                return data.data || data;

            } catch (error) {
                lastError = error;
                if (error.name === 'AbortError') throw new ApiError('Request timeout', 504, 'Request took too long.', 'Server timeout');
                if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) throw error;
                if (attempt < this.retryAttempts) { await this.delay(this.retryDelay); continue; }
            }
        }
        throw lastError || new ApiError('Request failed', 500, 'Unknown error', null);
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

    // ✅ YENİ METODLAR
    async sendKeys(text, locator) {
        return await this.request('/api/send-keys', {
            method: 'POST',
            body: { text, locator }
        });
    }

    async getElementText(locator) {
        return await this.request('/api/get-text', {
            method: 'POST',
            body: { locator }
        });
    }

    async health() { return await this.request('/health', { method: 'GET' }); }
}

const api = new ApiService();
window.api = api;
window.ApiError = ApiError;