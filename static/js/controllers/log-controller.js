/**
 * Log Controller - Handles device log viewing functionality
 * Extracted from app.js for better modularity
 */

class LogController {
    constructor(api, ui) {
        this.api = api;
        this.ui = ui;
        this.timer = null;
        this.isActive = false;
    }

    /**
     * Toggle the log panel visibility and start/stop log mirroring
     */
    toggle() {
        const panel = document.getElementById('log-panel');
        if (!panel) return;

        panel.classList.toggle('h-0');
        panel.classList.toggle('h-48');
        this.isActive = !panel.classList.contains('h-0');

        if (this.isActive) {
            this.startMirroring();
        } else {
            this.stopMirroring();
        }
    }

    /**
     * Start polling for device logs
     */
    startMirroring() {
        if (this.timer) return; // Already running
        this.timer = setInterval(() => this.fetchLogs(), 2000);
        this.fetchLogs(); // Immediate first fetch
    }

    /**
     * Stop polling for logs
     */
    stopMirroring() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Fetch logs from API
     */
    async fetchLogs() {
        try {
            const type = document.getElementById('logTypeSelect')?.value || '';
            const res = await this.api.getLogs(type);
            const logs = res?.logs || res || [];
            this.render(logs);
        } catch (e) {
            console.error("Log fetch error:", e);
        }
    }

    /**
     * Render logs to the panel
     */
    render(logs) {
        const container = document.getElementById('log-content');
        if (!container) return;

        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="text-gray-600 italic text-[10px]">Log bulunamadı.</div>';
            return;
        }

        // Only keep last 100 logs
        const displayLogs = logs.slice(-100);

        container.innerHTML = displayLogs.map(log => {
            const level = (log.level || 'INFO').toUpperCase();
            const color = {
                'ERROR': 'text-red-400',
                'WARNING': 'text-yellow-400',
                'WARN': 'text-yellow-400',
                'DEBUG': 'text-gray-500',
                'INFO': 'text-green-400'
            }[level] || 'text-gray-400';

            const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
            const msg = log.message || JSON.stringify(log);

            return `<div class="text-[10px] ${color} py-0.5 hover:bg-zinc-800/50 px-1 rounded">
                <span class="text-gray-600 mr-2">${time}</span>
                <span class="font-bold mr-2">[${level}]</span>
                <span>${msg}</span>
            </div>`;
        }).join('');

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Clear log display
     */
    clear() {
        const container = document.getElementById('log-content');
        if (container) {
            container.innerHTML = '<div class="text-gray-600 italic text-[10px]">Loglar temizlendi.</div>';
        }
    }

    /**
     * Cleanup on destroy
     */
    destroy() {
        this.stopMirroring();
    }
}

// Export to window for global access
window.LogController = LogController;
