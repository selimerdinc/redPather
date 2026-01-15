/**
 * Loading States Manager
 * Skeleton UI components and enhanced loading indicators
 */

class LoadingStates {
    constructor() {
        this.activeLoaders = new Set();
        this.skeletonStyles = this.injectStyles();
    }

    /**
     * Inject skeleton animation styles
     */
    injectStyles() {
        if (document.getElementById('skeleton-styles')) return;

        const style = document.createElement('style');
        style.id = 'skeleton-styles';
        style.textContent = `
            /* Skeleton shimmer animation */
            @keyframes skeleton-shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }
            
            .skeleton {
                background: linear-gradient(
                    90deg,
                    rgba(255,255,255,0.05) 0%,
                    rgba(255,255,255,0.15) 50%,
                    rgba(255,255,255,0.05) 100%
                );
                background-size: 200% 100%;
                animation: skeleton-shimmer 1.5s infinite;
                border-radius: 4px;
            }
            
            .skeleton-dark {
                background: linear-gradient(
                    90deg,
                    rgba(0,0,0,0.05) 0%,
                    rgba(0,0,0,0.1) 50%,
                    rgba(0,0,0,0.05) 100%
                );
                background-size: 200% 100%;
                animation: skeleton-shimmer 1.5s infinite;
                border-radius: 4px;
            }
            
            /* Pulse animation for cards */
            @keyframes pulse-subtle {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            .loading-pulse {
                animation: pulse-subtle 2s infinite;
            }
            
            /* Spinner */
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            .loading-spinner {
                border: 2px solid rgba(255,255,255,0.1);
                border-top-color: #ef4444;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }
            
            /* Progress bar */
            @keyframes progress-indeterminate {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
            }
            
            .progress-bar {
                overflow: hidden;
                position: relative;
            }
            
            .progress-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 25%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(239,68,68,0.6), transparent);
                animation: progress-indeterminate 1.5s infinite;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show full-page loading overlay
     */
    showFullPageLoader(text = 'Yükleniyor...', id = 'fullPageLoader') {
        if (document.getElementById(id)) return;

        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-zinc-900/90 rounded-2xl p-8 flex flex-col items-center gap-4 border border-zinc-700/50 shadow-2xl">
                <div class="loading-spinner w-12 h-12"></div>
                <p class="text-white font-medium text-lg">${text}</p>
                <div class="progress-bar w-48 h-1 bg-zinc-800 rounded-full"></div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.activeLoaders.add(id);
    }

    /**
     * Hide full-page loader
     */
    hideFullPageLoader(id = 'fullPageLoader') {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            setTimeout(() => overlay.remove(), 300);
            this.activeLoaders.delete(id);
        }
    }

    /**
     * Create skeleton element list (for element panel)
     */
    createElementListSkeleton(count = 5) {
        const container = document.createElement('div');
        container.className = 'element-skeleton-container space-y-2 p-4';

        for (let i = 0; i < count; i++) {
            const item = document.createElement('div');
            item.className = 'bg-zinc-800/50 rounded-lg p-3 space-y-2';
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="skeleton w-8 h-8 rounded"></div>
                    <div class="flex-1 space-y-1.5">
                        <div class="skeleton h-3 w-3/4 rounded"></div>
                        <div class="skeleton h-2 w-1/2 rounded"></div>
                    </div>
                </div>
            `;
            container.appendChild(item);
        }

        return container;
    }

    /**
     * Create screenshot skeleton
     */
    createScreenshotSkeleton() {
        const container = document.createElement('div');
        container.className = 'screenshot-skeleton w-full aspect-[9/16] max-h-[70vh]';
        container.innerHTML = `
            <div class="skeleton w-full h-full rounded-xl flex items-center justify-center">
                <div class="text-center text-zinc-500">
                    <div class="loading-spinner w-10 h-10 mx-auto mb-3"></div>
                    <p class="text-sm">Ekran görüntüsü alınıyor...</p>
                </div>
            </div>
        `;
        return container;
    }

    /**
     * Replace element with skeleton, then restore
     */
    showSkeletonFor(element, skeletonHtml) {
        if (!element) return null;

        const originalContent = element.innerHTML;
        const originalClasses = element.className;

        element.innerHTML = skeletonHtml;
        element.classList.add('loading-pulse');

        return () => {
            element.innerHTML = originalContent;
            element.className = originalClasses;
        };
    }

    /**
     * Inline button loading state
     */
    setButtonLoading(button, loading = true, originalText = null) {
        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `
                <div class="loading-spinner w-4 h-4"></div>
                <span class="ml-2">İşleniyor...</span>
            `;
            button.classList.add('opacity-75', 'cursor-wait');
        } else {
            button.disabled = false;
            button.innerHTML = originalText || button.dataset.originalText || 'Tamam';
            button.classList.remove('opacity-75', 'cursor-wait');
            delete button.dataset.originalText;
        }
    }

    /**
     * Show inline section loader
     */
    showSectionLoader(containerId, text = 'Yükleniyor...') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const loaderId = `${containerId}-loader`;
        if (document.getElementById(loaderId)) return;

        const loader = document.createElement('div');
        loader.id = loaderId;
        loader.className = 'absolute inset-0 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg';
        loader.innerHTML = `
            <div class="flex items-center gap-3 text-zinc-300">
                <div class="loading-spinner w-5 h-5"></div>
                <span class="text-sm">${text}</span>
            </div>
        `;

        // Make container relative if not already
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        container.appendChild(loader);
        this.activeLoaders.add(loaderId);
    }

    /**
     * Hide inline section loader
     */
    hideSectionLoader(containerId) {
        const loaderId = `${containerId}-loader`;
        const loader = document.getElementById(loaderId);
        if (loader) {
            loader.remove();
            this.activeLoaders.delete(loaderId);
        }
    }

    /**
     * Create toast-style loading indicator
     */
    showLoadingToast(message, id = 'loadingToast') {
        const container = document.getElementById('errorToastContainer') || document.body;

        if (document.getElementById(id)) return;

        const toast = document.createElement('div');
        toast.id = id;
        toast.className = `
            bg-gradient-to-r from-zinc-700/95 to-zinc-800/95 
            text-white px-4 py-3 rounded-lg shadow-xl
            backdrop-blur-sm border border-zinc-600/30
            flex items-center gap-3
            fixed top-4 right-4 z-[9999]
        `;
        toast.innerHTML = `
            <div class="loading-spinner w-5 h-5"></div>
            <span class="text-sm font-medium">${message}</span>
        `;

        container.appendChild(toast);
        this.activeLoaders.add(id);
    }

    /**
     * Hide loading toast
     */
    hideLoadingToast(id = 'loadingToast') {
        const toast = document.getElementById(id);
        if (toast) {
            toast.remove();
            this.activeLoaders.delete(id);
        }
    }

    /**
     * Clean up all loaders
     */
    hideAll() {
        this.activeLoaders.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.remove();
        });
        this.activeLoaders.clear();
    }
}

// Create singleton
const loadingStates = new LoadingStates();
window.loadingStates = loadingStates;

// Convenience functions
window.showLoader = (text) => loadingStates.showFullPageLoader(text);
window.hideLoader = () => loadingStates.hideFullPageLoader();
window.showLoadingToast = (msg, id) => loadingStates.showLoadingToast(msg, id);
window.hideLoadingToast = (id) => loadingStates.hideLoadingToast(id);
