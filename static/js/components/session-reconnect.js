/**
 * Session Reconnect Manager
 * Auto-reconnects when Appium connection is lost
 */

class SessionReconnect {
    constructor() {
        this.isMonitoring = false;
        this.reconnectAttempts = 0;
        this.maxAttempts = 3;
        this.checkInterval = 10000; // 10 seconds
        this.reconnectDelay = 2000; // 2 seconds between retries
        this.lastSessionInfo = null;
        this.intervalId = null;
        this.wasConnected = false;

        this.init();
    }

    init() {
        // Listen for successful connections
        this.setupConnectionListener();
        window.debug?.log('🔄 Session Reconnect Manager initialized');
    }

    setupConnectionListener() {
        // Intercept successful scan responses to track connection state
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);

            // Clone response to read body
            const clone = response.clone();

            try {
                const url = args[0];
                if (typeof url === 'string') {
                    // Track successful scan = connected
                    if (url.includes('/api/scan') && response.ok) {
                        this.onConnectionSuccess();
                    }
                    // Track connection errors, but ignore specific APIs that handle their own errors
                    // Locator mapper switching platforms might return 500 if target not ready,
                    // but we don't want to trigger a global "lost connection" toast for the main platform yet.
                    const isMapperApi = url.includes('/api/locator-mapper');
                    if (!response.ok && response.status >= 500 && !isMapperApi) {
                        this.onConnectionError();
                    }
                }
            } catch (e) {
                // Ignore parsing errors
            }

            return response;
        };
    }

    onConnectionSuccess() {
        this.wasConnected = true;
        this.reconnectAttempts = 0;

        // Save session info for potential reconnection
        this.saveSessionInfo();

        // Start monitoring if not already
        if (!this.isMonitoring) {
            this.startMonitoring();
        }
    }

    async saveSessionInfo() {
        try {
            const response = await fetch('/api/sessions/current');
            if (response.ok) {
                const data = await response.json();
                if (data.data) {
                    this.lastSessionInfo = {
                        ...data.data,
                        platform: window.appState?.get('ui.platform') || 'ANDROID',
                        timestamp: Date.now()
                    };
                    window.debug?.log('💾 Session info saved for reconnection');
                }
            }
        } catch (e) {
            console.debug('Could not save session info:', e);
        }
    }

    onConnectionError() {
        if (this.wasConnected && this.lastSessionInfo) {
            console.warn('⚠️ Connection lost, attempting recovery...');
            this.attemptReconnect();
        }
    }

    startMonitoring() {
        if (this.intervalId) return;

        this.isMonitoring = true;
        this.intervalId = setInterval(() => this.healthCheck(), this.checkInterval);
        window.debug?.log('👀 Session health monitoring started');
    }

    stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isMonitoring = false;
    }

    async healthCheck() {
        if (!this.wasConnected) return;

        try {
            const response = await fetch('/api/sessions/current', {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                const data = await response.json();
                if (!data.data || !data.data.id) {
                    // Session lost
                    this.onSessionLost();
                }
            }
        } catch (e) {
            console.debug('Health check failed:', e);
        }
    }

    onSessionLost() {
        if (this.reconnectAttempts < this.maxAttempts) {
            console.warn('🔌 Session lost, attempting reconnect...');
            this.attemptReconnect();
        }
    }

    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxAttempts) {
            this.showReconnectFailed();
            return;
        }

        this.reconnectAttempts++;

        // Show reconnecting UI
        this.showReconnectingUI();

        try {
            // Wait before retry
            await this.delay(this.reconnectDelay);

            // Try to attach to last known session
            if (this.lastSessionInfo?.id) {
                window.debug?.log(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxAttempts}...`);

                const response = await fetch('/api/sessions/attach', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: this.lastSessionInfo.id,
                        platform: this.lastSessionInfo.platform
                    })
                });

                if (response.ok) {
                    this.onReconnectSuccess();
                    return;
                }
            }

            // If attach failed, try starting fresh
            window.debug?.log('📡 Trying fresh connection...');
            const platform = window.appState?.get('ui.platform') || 'ANDROID';
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, verify: false, prefix: '' })
            });

            if (response.ok) {
                this.onReconnectSuccess();
            } else {
                throw new Error('Fresh connection failed');
            }

        } catch (e) {
            console.error('Reconnect attempt failed:', e);
            if (this.reconnectAttempts < this.maxAttempts) {
                this.attemptReconnect();
            } else {
                this.showReconnectFailed();
            }
        }
    }

    onReconnectSuccess() {
        this.reconnectAttempts = 0;
        this.hideReconnectingUI();

        window.showSuccess?.('Bağlantı yeniden kuruldu!', 'Otomatik yeniden bağlanma başarılı');

        // Update connection status
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-green-500 transition-colors';
        if (text) {
            text.textContent = 'BAĞLI';
            text.className = 'text-[9px] font-bold text-green-500 uppercase tracking-wider';
        }

        window.debug?.log('✅ Reconnection successful!');
    }

    showReconnectingUI() {
        // Add reconnect indicator if not exists
        if (document.getElementById('reconnectIndicator')) return;

        const indicator = document.createElement('div');
        indicator.id = 'reconnectIndicator';
        indicator.className = `
            fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]
            bg-amber-500/95 text-white px-4 py-2 rounded-full
            flex items-center gap-2 shadow-lg
        `;
        indicator.innerHTML = `
            <div class="loading-spinner w-4 h-4 border-white/30 border-t-white"></div>
            <span class="text-sm font-medium">Yeniden bağlanılıyor...</span>
            <span class="text-xs opacity-75">${this.reconnectAttempts}/${this.maxAttempts}</span>
        `;

        document.body.appendChild(indicator);

        // Update connection status to yellow
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse transition-colors';
        if (text) {
            text.textContent = 'BAĞLANIYOR';
            text.className = 'text-[9px] font-bold text-amber-500 uppercase tracking-wider';
        }
    }

    hideReconnectingUI() {
        document.getElementById('reconnectIndicator')?.remove();
    }

    showReconnectFailed() {
        this.hideReconnectingUI();

        window.showError?.('Bağlantı kurulamadı', 'Appium sunucusunu kontrol edin ve tekrar deneyin');

        // Update connection status to red
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-red-500 transition-colors';
        if (text) {
            text.textContent = 'BAĞLANTI YOK';
            text.className = 'text-[9px] font-bold text-red-500 uppercase tracking-wider';
        }

        this.wasConnected = false;
        this.stopMonitoring();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Manual reconnect trigger
    manualReconnect() {
        this.reconnectAttempts = 0;
        this.attemptReconnect();
    }
}

// Create singleton
const sessionReconnect = new SessionReconnect();
window.sessionReconnect = sessionReconnect;

// Convenience function
window.reconnect = () => sessionReconnect.manualReconnect();
