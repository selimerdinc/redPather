/**
 * QA RED PATHER - MAIN CONTROLLER
 * Orchestrates Components and Services.
 * Fully Modularized & OOP.
 */

class AppController {
    constructor() {
        // Services
        this.api = window.api; // api.service.js
        this.state = window.appState; // state.service.js

        // Managers (Components)
        this.ui = new UIManager();
        this.settings = new SettingsManager(this.api, this.ui);
        this.exportMgr = new ExportManager(this.state, this.ui);

        // UI Components (DOM dependent)
        this.xmlViewer = null;
        this.overlayMgr = null;
        this.listMgr = null;

        // Runtime Data
        this.currentPlatform = "ANDROID";
        this.deletedLocators = new Set();
        this.allElements = [];

        this.init();
    }

    init() {
        // Initialize DOM Components
        if (window.XMLTreeViewer) this.xmlViewer = new XMLTreeViewer('xml-tree-root');
        if (window.OverlayManager) this.overlayMgr = new OverlayManager('overlays', 'screenshot');
        if (window.ElementListManager) this.listMgr = new ElementListManager('elements-list');

        // Bind Global Window Functions (For HTML onClick handlers)
        this.bindGlobals();

        // Subscribe to State
        this.state.subscribe('ui.currentHoverIndex', (idx) => this.handleHighlight(idx));
        this.state.subscribe('elements', (elements) => this.renderAll(elements));
    }

    // --- Core Actions ---

    async scanScreen() {
        const verify = document.getElementById('autoVerify').checked;
        const prefix = document.getElementById('pagePrefix').value || "page";

        this.ui.setLoading(true, "ANALYZING...");
        this.ui.showEmptyState(false);
        this.clearData();

        try {
            const data = await this.api.scan(this.currentPlatform, verify, prefix);
            this.handleScanResult(data);
        } catch (error) {
            console.error(error);
            this.ui.showToast("Error", error.message || "Scan failed", "error");
            this.ui.resetState();
            this.ui.showEmptyState(true);
        }
    }

    handleScanResult(data) {
        const img = document.getElementById('screenshot');
        img.src = "data:image/png;base64," + data.image;

        // Device Size Update
        if (data.window_w && this.overlayMgr) {
            this.overlayMgr.setDeviceSize(data.window_w, data.window_h);
        }

        img.onload = () => {
            this.ui.resetState();
            this.ui.showEmptyState(false);

            // Set Page Name
            if (data.page_name) document.getElementById('pagePrefix').value = data.page_name;

            // Filter & Process Elements
            const validElements = data.elements.filter(el => !this.deletedLocators.has(el.locator));

            this.allElements = validElements.map((el, idx) => ({ ...el, index: idx, isDeleted: false }));

            // Update State (Triggers Render via Subscription)
            this.state.set('elements', this.allElements);

            // Render XML
            if (this.xmlViewer) this.xmlViewer.render(data.raw_source || "");

            this.ui.showToast("Success", `Found ${validElements.length} elements`, 'success');
        };
    }

    // --- Interactions ---

    async performTap(x, y, imgW, imgH) {
        this.ui.setLoading(true, "TAPPING...");
        try {
            const res = await this.api.tap(x, y, imgW, imgH, this.currentPlatform);
            if (this.state.get('recorder.isRecording') && res.smart_action) {
                this.state.addStep(res.smart_action);
            }
            this.scanScreen(); // Auto Rescan
        } catch (e) {
            this.ui.showToast("Error", "Tap failed", "error");
            this.ui.resetState();
        }
    }

    async performScroll(direction) {
        this.ui.setLoading(true, "SCROLLING...");
        try {
            await this.api.scroll(direction, this.currentPlatform);
            if (this.state.get('recorder.isRecording')) this.state.addStep({ type: 'scroll', direction });
            this.scanScreen();
        } catch (e) {
            this.ui.showToast("Error", "Scroll failed", "error");
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
            this.ui.showToast("Error", `${actionName} failed`, "error");
            this.ui.resetState();
        }
    }

    // --- Helpers ---

    clearData() {
        this.allElements = [];
        this.state.set('ui.currentHoverIndex', -1);

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

    handleHighlight(index) {
        // Highlight logic handled by components via state subscription
        // But we handle Global Connector drawing here if needed, or inside ListMgr
        // Currently ListMgr handles connector drawing on scroll/hover.
    }

    // --- Window Bindings for HTML ---
    bindGlobals() {
        window.scanScreen = () => this.scanScreen();
        window.performTap = (x, y, w, h) => this.performTap(x, y, w, h);
        window.performScroll = (dir) => this.performScroll(dir);
        window.triggerBack = () => this.triggerAction('back');
        window.triggerHideKeyboard = () => this.triggerAction('hideKeyboard');

        // Toggles
        window.toggleNavMode = (el) => {
            this.ui.toggleNavMode(el.checked);
            this.clearData(); // Clear selection visuals
            this.state.set('ui.currentHoverIndex', -1);
        };
        window.toggleVerifyUI = (el) => this.ui.toggleVerifyMode(el.checked);
        window.togglePlatform = () => {
            this.currentPlatform = this.currentPlatform === "ANDROID" ? "IOS" : "ANDROID";
            this.ui.togglePlatform(this.currentPlatform);
        };
        window.toggleSourceView = (mode) => {
            // mode = 'list' or 'source' (passed from HTML logic if changed to string)
            // Current HTML passes string 'list' or 'source'
            this.ui.toggleSourceView(mode);
        };

        // Config
        window.openConfig = () => this.settings.openModal();
        window.saveConfig = () => this.settings.saveConfig();

        // Export
        window.toggleRecordMode = () => this.exportMgr.toggleRecordMode();
        // ExportMgr global access for modal buttons
        window.exportMgr = this.exportMgr;

        // Edit/Remove Hooks (Called from List Manager)
        window.removeElement = (e, index) => {
            e.stopPropagation();
            const el = this.allElements.find(i => i.index === index);
            if (el) {
                el.isDeleted = true;
                if(el.locator) this.deletedLocators.add(el.locator);
                this.state.set('elements', this.allElements); // Re-render
            }
        };

        // Highlight Helper
        window.highlightElement = (index) => {
            this.state.set('ui.currentHoverIndex', index);
        };

        window.clearSelection = () => {
             this.state.set('ui.currentHoverIndex', -1);
             // Also clear visual connectors
             const svg = document.getElementById('connector-path');
             if(svg) svg.style.display = 'none';
        };

        // Edit Helper (Starts edit flow)
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
                if (e.key === 'Enter') {
                    e.preventDefault(); input.blur();
                    this.ui.showConfirmModal(input.value, () => finish(true), () => { finish(false); input.focus(); });
                }
                if (e.key === 'Escape') finish(false);
                e.stopPropagation();
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        };

        // Copy All Helper
        window.copyAllVariables = () => {
             const active = this.allElements.filter(e => !e.isDeleted);
             if(active.length === 0) return this.ui.showToast("Info", "No elements", "info");
             // ... copy logic ...
             let output = "*** Variables ***\n";
             active.forEach(item => {
                 const parts = item.locator.split('=', 1);
                 output += `\${${item.variable.replace(/[${}]/g, '')}} = \t${parts[0]}=${item.locator.substring(parts[0].length + 1)}\n`;
             });
             navigator.clipboard.writeText(output).then(() => this.ui.showToast("Copied", "All variables copied"));
        };
    }
}

// Start Application
window.app = new AppController();