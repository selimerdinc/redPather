/**
 * Red Pather - Main Application
 * Refactored with state management and API service
 */

// Import services (assume they're loaded before this)
// In production, use proper module bundler

class RedPatherApp {
    constructor() {
        this.api = api; // From api.service.js
        this.state = appState; // From state.service.js
        
        // UI References
        this.ui = {
            screenshot: document.getElementById('screenshot'),
            elementsList: document.getElementById('elements-list'),
            overlays: document.getElementById('overlays'),
            loading: document.getElementById('loading'),
            loadingText: document.getElementById('loading-text'),
            emptyState: document.getElementById('empty-state'),
            deviceWrapper: document.getElementById('device-wrapper'),
            xmlTreeRoot: document.getElementById('xml-tree-root'),
            elementCount: document.getElementById('element-count')
        };
        
        // Bind methods
        this.init = this.init.bind(this);
        this.setupEventListeners = this.setupEventListeners.bind(this);
        this.setupStateSubscriptions = this.setupStateSubscriptions.bind(this);
    }

    /**
     * Initialize application
     */
    async init() {
        console.log("%c🚀 QA Red Pather Started", "color: #ef4444; font-size: 16px; font-weight: bold;");
        console.log("Version: 2.0.0 - Refactored");
        
        this.setupEventListeners();
        this.setupStateSubscriptions();
        this.setupImageResizeObserver();
        
        // Load initial config
        await this.loadConfig();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT') return;
            
            if (e.ctrlKey || e.metaKey) {
                switch(e.code) {
                    case 'KeyS':
                        e.preventDefault();
                        this.scanScreen();
                        break;
                    case 'KeyC':
                        e.preventDefault();
                        this.copyAllVariables();
                        break;
                }
            }
        });

        // Modal keyboard
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('confirmModal');
            if (modal.classList.contains('open')) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('modalConfirmBtn').click();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    document.getElementById('modalCancelBtn').click();
                }
            }
        });

        // List scroll sync with connector
        this.ui.elementsList.addEventListener('scroll', () => {
            const hoverIndex = this.state.get('ui.currentHoverIndex');
            if (hoverIndex !== -1) {
                this.updateConnector(hoverIndex);
            }
        });
    }

    /**
     * Setup state subscriptions
     */
    setupStateSubscriptions() {
        // Loading state
        this.state.subscribe('ui.isLoading', (isLoading, oldValue) => {
            if (isLoading) {
                this.ui.loading.classList.remove('hidden');
            } else {
                this.ui.loading.classList.add('hidden');
            }
        });

        this.state.subscribe('ui.loadingText', (text) => {
            this.ui.loadingText.innerText = text;
        });

        // Element count
        this.state.subscribe('elementCount', (count) => {
            this.ui.elementCount.innerText = count;
        });

        // Hover index
        this.state.subscribe('ui.currentHoverIndex', (index, oldIndex) => {
            if (oldIndex !== -1) {
                this.clearHighlight(oldIndex);
            }
            if (index !== -1) {
                this.highlightElement(index);
            }
        });

        // Platform change
        this.state.subscribe('ui.platform', (platform) => {
            this.updatePlatformUI(platform);
        });

        // View mode
        this.state.subscribe('ui.viewMode', (mode) => {
            this.switchViewMode(mode);
        });
    }

    /**
     * Setup image resize observer
     */
    setupImageResizeObserver() {
        if (!this.ui.screenshot) return;
        
        const resizeObserver = new ResizeObserver(() => {
            const hoverIndex = this.state.get('ui.currentHoverIndex');
            if (hoverIndex !== -1) {
                this.updateBoxPosition(hoverIndex);
                this.updateConnector(hoverIndex);
            }
        });
        
        resizeObserver.observe(this.ui.screenshot);
    }

    // ====================
    // API OPERATIONS
    // ====================

    async loadConfig() {
        try {
            const data = await this.api.getConfig();
            this.state.set('config', data);
            this.updateConfigUI(data);
        } catch (error) {
            this.handleError(error, 'Config Load');
        }
    }

    async saveConfig(config) {
        try {
            await this.api.saveConfig(config);
            this.state.set('config', config);
            this.showToast('Saved', 'Configuration updated', 'success');
            document.getElementById('configModal').classList.remove('open');
        } catch (error) {
            this.handleError(error, 'Config Save');
        }
    }

    async scanScreen() {
        const platform = this.state.get('ui.platform');
        const verify = document.getElementById('autoVerify').checked;
        const prefix = document.getElementById('pagePrefix').value || 'page';
        
        this.state.setLoading(true, 'ANALYZING...');
        this.state.reset();
        
        this.ui.emptyState.classList.add('hidden');
        this.ui.deviceWrapper.classList.add('hidden');
        this.ui.overlays.innerHTML = '';
        this.ui.elementsList.innerHTML = '';
        this.ui.xmlTreeRoot.innerHTML = '';
        
        try {
            const data = await this.api.scan(platform, verify, prefix);
            this.renderScanResult(data);
        } catch (error) {
            this.handleError(error, 'Scan');
            this.ui.emptyState.classList.remove('hidden');
        } finally {
            this.state.setLoading(false);
        }
    }

    async performTap(x, y) {
        const platform = this.state.get('ui.platform');
        const imgW = this.ui.screenshot.naturalWidth;
        const imgH = this.ui.screenshot.naturalHeight;
        
        this.state.setLoading(true, 'TAPPING...');
        
        try {
            await this.api.tap(x, y, imgW, imgH, platform);
            await this.scanScreen();
        } catch (error) {
            this.handleError(error, 'Tap');
            this.state.setLoading(false);
        }
    }

    async performScroll(direction) {
        const platform = this.state.get('ui.platform');
        this.state.setLoading(true, 'SCROLLING...');
        
        try {
            await this.api.scroll(direction, platform);
            await this.scanScreen();
        } catch (error) {
            this.handleError(error, 'Scroll');
            this.state.setLoading(false);
        }
    }

    async goBack() {
        this.state.setLoading(true, 'BACK...');
        
        try {
            await this.api.back();
            await this.scanScreen();
        } catch (error) {
            this.handleError(error, 'Back');
            this.state.setLoading(false);
        }
    }

    async hideKeyboard() {
        this.state.setLoading(true, 'HIDING KEYBOARD...');
        
        try {
            await this.api.hideKeyboard();
            await this.scanScreen();
        } catch (error) {
            this.handleError(error, 'Hide Keyboard');
            this.state.setLoading(false);
        }
    }

    async verifyLocator(locator, buttonEl) {
        const original = buttonEl.innerHTML;
        buttonEl.innerHTML = `<div class="loader"></div>`;
        
        try {
            const data = await this.api.verifyLocator(locator);
            
            if (data.valid) {
                buttonEl.innerHTML = `<span class="text-emerald-500 font-bold text-sm">✓</span>`;
                this.showToast('Verified', `Count: ${data.count}`, 'success');
            } else {
                buttonEl.innerHTML = `<span class="text-red-500 font-bold text-sm">✕</span>`;
                this.showToast('Failed', `Found: ${data.count}`, 'error');
            }
        } catch (error) {
            buttonEl.innerHTML = `<span class="text-yellow-500 font-bold text-sm">!</span>`;
            this.handleError(error, 'Verify');
        }
        
        setTimeout(() => buttonEl.innerHTML = original, 2000);
    }

    // ====================
    // RENDER METHODS
    // ====================

    renderScanResult(data) {
        this.ui.screenshot.src = "data:image/png;base64," + data.image;
        this.state.setXmlSource(data.raw_source || '');
        
        if (data.window_w && data.window_h) {
            this.state.setScreenshot(data.image, data.window_w, data.window_h);
        }

        this.ui.screenshot.onload = () => {
            this.ui.deviceWrapper.classList.remove('hidden');
            
            if (data.page_name) {
                const pageInput = document.getElementById('pagePrefix');
                pageInput.style.color = '#ef4444';
                pageInput.value = data.page_name;
                setTimeout(() => pageInput.style.color = 'white', 500);
            }

            // Add elements to state and UI
            data.elements.forEach((el, index) => {
                const element = { ...el, index, isDeleted: false };
                this.state.addElement(element);
                this.createBox(element);
                this.createListItem(element);
            });

            this.showToast('Success', `Found ${data.elements.length} elements`, 'success');
        };
    }

    createBox(element) {
        const box = document.createElement('div');
        box.id = `box-${element.index}`;
        box.className = 'target-box';
        box.dataset.x = element.coords.x;
        box.dataset.y = element.coords.y;
        box.dataset.w = element.coords.w;
        box.dataset.h = element.coords.h;

        box.onclick = (e) => {
            e.stopPropagation();
            const navMode = this.state.get('ui.navMode');
            
            if (navMode || e.shiftKey) {
                const cx = element.coords.x + element.coords.w / 2;
                const cy = element.coords.y + element.coords.h / 2;
                this.performTap(cx, cy);
            } else {
                this.state.setHoverIndex(element.index);
            }
        };

        const label = document.createElement('div');
        label.className = "box-label absolute -top-5 left-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-lg z-50 pointer-events-none";
        label.innerText = element.index + 1;
        box.appendChild(label);

        this.updateBoxPosition(element.index, box);
        this.ui.overlays.appendChild(box);
    }

    createListItem(element) {
        const item = document.createElement('div');
        item.className = 'list-item p-4 rounded-lg mb-2 cursor-pointer';
        item.id = `list-item-${element.index}`;

        let badgeClass = this.getStrategyBadgeClass(element.strategy);

        item.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono font-bold text-gray-500">#${String(element.index + 1).padStart(2, '0')}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}">${element.strategy}</span>
                </div>
                ${element.text ? `<span class="text-[10px] text-gray-500 truncate max-w-[120px]">${element.text}</span>` : ''}
            </div>
            <div class="w-full">
                <code class="block text-[13px] text-red-400 font-bold break-all">${element.variable}</code>
                <code class="block text-[10px] text-gray-600 bg-[#09090b] px-2 py-1.5 rounded">${element.locator}</code>
            </div>
            <div class="flex items-center gap-2 w-full mt-1">
                <button onclick="app.verifyLocatorByIndex(event, ${element.index}, this)" class="action-btn">🔍</button>
                <button onclick="app.copyElement(event, ${element.index})" class="action-btn">📋</button>
                <button onclick="app.removeElement(event, ${element.index})" class="action-btn delete ml-auto">✕</button>
            </div>
        `;

        item.addEventListener('mouseenter', () => this.state.setHoverIndex(element.index));
        item.addEventListener('mouseleave', () => this.state.clearHover());

        this.ui.elementsList.appendChild(item);
    }

    // Helper methods continue in next artifact...
    
    getStrategyBadgeClass(strategy) {
        if (strategy.includes('ID')) return "bg-blue-900/30 text-blue-400 border border-blue-800";
        if (strategy.includes('ACC_ID')) return "bg-emerald-900/30 text-emerald-400 border border-emerald-800";
        if (strategy.includes('ANCHOR')) return "bg-pink-900/30 text-pink-400 border border-pink-800";
        if (strategy.includes('TEXT')) return "bg-purple-900/30 text-purple-400 border border-purple-800";
        return "bg-gray-800 text-gray-400 border border-gray-700";
    }

    updateBoxPosition(index, boxEl = null) {
        const box = boxEl || document.getElementById(`box-${index}`);
        if (!box) return;

        const deviceW = this.state.get('device.width');
        const deviceH = this.state.get('device.height');
        
        if (deviceW === 0 || deviceH === 0) return;

        const scaleX = this.ui.screenshot.width / deviceW;
        const scaleY = this.ui.screenshot.height / deviceH;

        box.style.left = (parseFloat(box.dataset.x) * scaleX) + 'px';
        box.style.top = (parseFloat(box.dataset.y) * scaleY) + 'px';
        box.style.width = (parseFloat(box.dataset.w) * scaleX) + 'px';
        box.style.height = (parseFloat(box.dataset.h) * scaleY) + 'px';
    }

    highlightElement(index) {
        const box = document.getElementById(`box-${index}`);
        const listItem = document.getElementById(`list-item-${index}`);

        if (box) {
            box.classList.add('active');
            this.updateBoxPosition(index);
        }

        if (listItem) {
            listItem.classList.add('active');
            listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        this.updateConnector(index);
    }

    clearHighlight(index) {
        const box = document.getElementById(`box-${index}`);
        const listItem = document.getElementById(`list-item-${index}`);

        if (box) box.classList.remove('active');
        if (listItem) listItem.classList.remove('active');

        // Hide connector
        const svgPath = document.getElementById('connector-path');
        const dotList = document.getElementById('connector-dot-list');
        const dotImg = document.getElementById('connector-dot-img');
        if (svgPath) svgPath.style.display = 'none';
        if (dotList) dotList.style.display = 'none';
        if (dotImg) dotImg.style.display = 'none';
    }

    updateConnector(index) {
        const listItem = document.getElementById(`list-item-${index}`);
        const box = document.getElementById(`box-${index}`);
        
        if (!listItem || !box) return;

        const svgPath = document.getElementById('connector-path');
        const dotList = document.getElementById('connector-dot-list');
        const dotImg = document.getElementById('connector-dot-img');

        const listRect = listItem.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();

        const x1 = listRect.left;
        const y1 = listRect.top + listRect.height / 2;
        const x2 = boxRect.right;
        const y2 = boxRect.top + boxRect.height / 2;

        const d = `M ${x1} ${y1} C ${x1 - 60} ${y1}, ${x2 + 60} ${y2}, ${x2} ${y2}`;

        svgPath.setAttribute('d', d);
        svgPath.style.display = 'block';
        
        dotList.setAttribute('cx', x1);
        dotList.setAttribute('cy', y1);
        dotList.style.display = 'block';
        
        dotImg.setAttribute('cx', x2);
        dotImg.setAttribute('cy', y2);
        dotImg.style.display = 'block';
    }

    // ====================
    // UI ACTIONS
    // ====================

    removeElement(e, index) {
        e.stopPropagation();
        this.state.removeElement(index);
        
        const item = document.getElementById(`list-item-${index}`);
        const box = document.getElementById(`box-${index}`);
        
        if (item) {
            item.classList.add('removing');
            setTimeout(() => item.remove(), 200);
        }
        
        if (box) box.remove();
    }

    copyElement(e, index) {
        e.stopPropagation();
        const elements = this.state.get('elements');
        const element = elements.find(el => el.index === index);
        
        if (!element) return;

        const text = `\${${element.variable.replace(/[${}]/g, '')}} = ${element.locator}`;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied', 'Element copied', 'success');
        });
    }

    copyAllVariables() {
        const activeElements = this.state.getActiveElements();
        
        if (activeElements.length === 0) {
            this.showToast('Warning', 'No active elements', 'info');
            return;
        }

        let output = "*** Variables ***\n";
        activeElements.forEach(item => {
            const varName = item.variable.replace('${', '').replace('}', '').trim();
            const parts = item.locator.split('=', 1);
            const strategy = parts[0] || "xpath";
            const value = item.locator.substring(strategy.length + 1) || item.locator;
            output += `\${${varName}} = \t${strategy}=${value}\n`;
        });

        navigator.clipboard.writeText(output).then(() => {
            this.showToast('Copied!', `${activeElements.length} variables`, 'success');
        });
    }

    verifyLocatorByIndex(e, index, btn) {
        e.stopPropagation();
        const elements = this.state.get('elements');
        const element = elements.find(el => el.index === index);
        
        if (!element) return;
        
        this.verifyLocator(element.locator, btn);
    }

    // ====================
    // UTILITY
    // ====================

    showToast(title, message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
        
        toast.className = `pro-toast ${type}`;
        toast.innerHTML = `
            <div style="font-size: 20px; font-weight: bold;">${icons[type] || '•'}</div>
            <div>
                <h4 class="text-sm font-bold text-white">${title}</h4>
                <p class="text-xs text-gray-400 font-mono">${message}</p>
            </div>
        `;
        
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    handleError(error, context) {
        console.error(`${context} error:`, error);
        
        let title = "Error";
        let message = error.message || "Unknown error";
        
        if (error instanceof ApiError) {
            title = context;
            message = error.userMessage;
        }
        
        this.showToast(title, message, 'error');
    }

    updateConfigUI(config) {
        // Update config modal inputs
        const inputs = {
            'conf_android_pkg': config.ANDROID_PKG,
            'conf_android_act': config.ANDROID_ACT,
            'conf_android_device': config.ANDROID_DEVICE,
            'conf_ios_bundle': config.IOS_BUNDLE,
            'conf_ios_device': config.IOS_DEVICE,
            'conf_ios_udid': config.IOS_UDID,
            'conf_ios_org': config.IOS_ORG_ID,
            'conf_ios_sign': config.IOS_SIGN_ID
        };

        Object.entries(inputs).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        });
    }

    updatePlatformUI(platform) {
        const slider = document.getElementById('toggle-slider');
        const optAndroid = document.getElementById('opt-android');
        const optIos = document.getElementById('opt-ios');

        if (platform === 'IOS') {
            slider.style.transform = 'translateX(100%)';
            optAndroid.classList.remove('active');
            optIos.classList.add('active');
        } else {
            slider.style.transform = 'translateX(0)';
            optIos.classList.remove('active');
            optAndroid.classList.add('active');
        }
    }

    switchViewMode(mode) {
        const listEl = this.ui.elementsList;
        const sourceEl = document.getElementById('source-view-container');
        const listOpt = document.getElementById('view-list');
        const sourceOpt = document.getElementById('view-source');
        const slider = document.getElementById('view-slider');

        if (mode === 'list') {
            listEl.style.display = 'block';
            sourceEl.style.display = 'none';
            listOpt.classList.add('active');
            sourceOpt.classList.remove('active');
            slider.style.transform = 'translateX(0)';
        } else {
            listEl.style.display = 'none';
            sourceEl.style.display = 'block';
            sourceOpt.classList.add('active');
            listOpt.classList.remove('active');
            slider.style.transform = 'translateX(calc(100% - 2px))';
        }
    }
}

// Initialize app
const app = new RedPatherApp();

// Global window functions for onclick handlers
window.app = app;

window.addEventListener('DOMContentLoaded', () => {
    app.init();
});