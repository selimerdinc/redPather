/**
 * Error Handler - Global Error Boundary & User Feedback System
 * Catches unhandled errors and provides user-friendly feedback.
 */

class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 50;
        this.toastContainer = null;
        this.init();
    }

    init() {
        // Global error handlers
        window.addEventListener('error', (e) => this.handleError(e.error, 'Script Error'));
        window.addEventListener('unhandledrejection', (e) => this.handleError(e.reason, 'Async Error'));

        // Create toast container if not exists
        this.ensureToastContainer();

        window.debug?.log('🛡️ Error Boundary initialized');
    }

    ensureToastContainer() {
        if (!document.getElementById('errorToastContainer')) {
            const container = document.createElement('div');
            container.id = 'errorToastContainer';
            container.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-md';
            document.body.appendChild(container);
            this.toastContainer = container;
        } else {
            this.toastContainer = document.getElementById('errorToastContainer');
        }
    }

    /**
     * Main error handler - categorizes and displays errors
     */
    handleError(error, context = 'Error') {
        const errorInfo = this.parseError(error);

        // Log for debugging
        this.logError(errorInfo, context);

        // Show user-friendly notification
        this.showErrorToast(errorInfo);

        // Return false to allow default handling (console output)
        return false;
    }

    /**
     * Parse error into structured format
     */
    parseError(error) {
        if (!error) return { type: 'unknown', message: 'Bilinmeyen hata', details: null };

        // API Error (from ApiService)
        if (error.name === 'ApiError') {
            return {
                type: 'api',
                message: error.userMessage || error.message,
                details: error.details,
                statusCode: error.statusCode,
                recoverable: error.statusCode < 500
            };
        }

        // Network Error
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
            return {
                type: 'network',
                message: 'Sunucu bağlantısı kesildi',
                details: 'Appium sunucusunun çalıştığından emin olun.',
                recoverable: true
            };
        }

        // Timeout Error
        if (error.message?.includes('timeout') || error.message?.includes('abort')) {
            return {
                type: 'timeout',
                message: 'İşlem zaman aşımına uğradı',
                details: 'Cihaz yanıt vermiyor olabilir.',
                recoverable: true
            };
        }

        // DOM/UI Error
        if (error instanceof TypeError && error.message?.includes('null')) {
            return {
                type: 'ui',
                message: 'Arayüz hatası',
                details: 'Sayfa yenilemeyi deneyin.',
                recoverable: true
            };
        }

        // Generic Error
        return {
            type: 'generic',
            message: error.message || 'Beklenmeyen hata',
            details: error.stack?.split('\n')[1]?.trim() || null,
            recoverable: false
        };
    }

    /**
     * Log error for debugging
     */
    logError(errorInfo, context) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            context,
            ...errorInfo
        };

        this.errorLog.unshift(logEntry);
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.pop();
        }

        console.error(`[${context}]`, errorInfo.message, errorInfo.details);
    }

    /**
     * Show error toast with proper styling
     */
    showErrorToast(errorInfo) {
        this.ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = `
            bg-gradient-to-r from-red-500/95 to-red-600/95 
            text-white px-4 py-3 rounded-lg shadow-xl
            backdrop-blur-sm border border-red-400/30
            transform translate-x-full opacity-0
            transition-all duration-300 ease-out
            flex items-start gap-3
        `;

        const icon = errorInfo.recoverable
            ? '<svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
            : '<svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';

        toast.innerHTML = `
            ${icon}
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">${errorInfo.message}</p>
                ${errorInfo.details ? `<p class="text-xs text-red-100/80 mt-0.5 truncate">${errorInfo.details}</p>` : ''}
                ${errorInfo.action ? `
                    <button onclick="${errorInfo.action.onClick}" class="mt-2 text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors uppercase tracking-wider">
                        ${errorInfo.action.text}
                    </button>
                ` : ''}
            </div>
            <button onclick="this.parentElement.remove()" class="text-red-200 hover:text-white transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        `;

        this.toastContainer.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        });

        // Auto remove
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    /**
     * Show success toast
     */
    showSuccess(message, details = null) {
        this.ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = `
            bg-gradient-to-r from-emerald-500/95 to-emerald-600/95 
            text-white px-4 py-3 rounded-lg shadow-xl
            backdrop-blur-sm border border-emerald-400/30
            transform translate-x-full opacity-0
            transition-all duration-300 ease-out
            flex items-start gap-3
        `;

        toast.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">${message}</p>
                ${details ? `<p class="text-xs text-emerald-100/80 mt-0.5">${details}</p>` : ''}
            </div>
        `;

        this.toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show warning toast
     */
    showWarning(message, details = null) {
        this.ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = `
            bg-gradient-to-r from-amber-500/95 to-amber-600/95 
            text-white px-4 py-3 rounded-lg shadow-xl
            backdrop-blur-sm border border-amber-400/30
            transform translate-x-full opacity-0
            transition-all duration-300 ease-out
            flex items-start gap-3
        `;

        toast.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">${message}</p>
                ${details ? `<p class="text-xs text-amber-100/80 mt-0.5">${details}</p>` : ''}
            </div>
        `;

        this.toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        });

        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Show info toast
     */
    showInfo(message, details = null, action = null) {
        this.ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = `
            bg-gradient-to-r from-indigo-500/95 to-purple-600/95 
            text-white px-4 py-3 rounded-lg shadow-xl
            backdrop-blur-sm border border-indigo-400/30
            transform translate-x-full opacity-0
            transition-all duration-300 ease-out
            flex items-start gap-3
        `;

        toast.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">${message}</p>
                ${details ? `<p class="text-xs text-indigo-100/80 mt-0.5">${details}</p>` : ''}
                ${action ? `
                    <button onclick="${action.onClick}" class="mt-2 text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors uppercase tracking-wider">
                        ${action.text}
                    </button>
                ` : ''}
            </div>
            <button onclick="this.parentElement.remove()" class="text-indigo-200 hover:text-white transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        `;

        this.toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
        });

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }
        }, 6000);
    }

    /**
     * Get error log for debugging
     */
    getErrorLog() {
        return this.errorLog;
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
    }
}

// Create singleton
const errorHandler = new ErrorHandler();
window.errorHandler = errorHandler;

// Convenience functions
window.showError = (msg, details, action) => errorHandler.showErrorToast({ message: msg, details, recoverable: true, action });
window.showSuccess = (msg, details) => errorHandler.showSuccess(msg, details);
window.showWarning = (msg, details) => errorHandler.showWarning(msg, details);
window.showInfo = (msg, details, action) => errorHandler.showInfo(msg, details, action);
