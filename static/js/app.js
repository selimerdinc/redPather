/**
 * QA RED PATHER - MAIN CONTROLLER
 * Orchestrates Components and Services.
 * Fully Modularized & OOP.
 */

class AppController {
    constructor() {
        // Services
        this.api = window.api;
        this.state = window.appState;

        // Managers (Components)
        this.ui = new UIManager();
        this.settings = new SettingsManager(this.api, this.ui);
        this.exportMgr = new ExportManager(this.state, this.ui);

        // UI Components
        this.xmlViewer = null;
        this.overlayMgr = null;
        this.listMgr = null;
        this.contextMenu = null; // ✅ YENİ: Context Menu

        // Runtime Data
        this.currentPlatform = "ANDROID";
        this.deletedLocators = new Set();
        this.allElements = [];

        this.init();
    }

    init() {
        // DOM Componentlerini Başlat
        if (window.XMLTreeViewer) this.xmlViewer = new XMLTreeViewer('xml-tree-root');
        if (window.OverlayManager) this.overlayMgr = new OverlayManager('overlays', 'screenshot');
        if (window.ElementListManager) this.listMgr = new ElementListManager('elements-list');

        // ✅ YENİ: Context Menu Başlat
        if (window.ContextMenu) this.contextMenu = new ContextMenu();

        // Global fonksiyonları bağla
        this.bindGlobals();

        // State değişikliklerini dinle
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

        if (data.window_w && this.overlayMgr) {
            this.overlayMgr.setDeviceSize(data.window_w, data.window_h);
        }

        img.onload = () => {
            this.ui.resetState();
            this.ui.showEmptyState(false);
            if (data.page_name) document.getElementById('pagePrefix').value = data.page_name;

            const validElements = data.elements.filter(el => !this.deletedLocators.has(el.locator));
            this.allElements = validElements.map((el, idx) => ({ ...el, index: idx, isDeleted: false }));

            this.state.set('elements', this.allElements);
            if (this.xmlViewer) this.xmlViewer.render(data.raw_source || "");
            this.ui.showToast("Success", `Found ${validElements.length} elements`, 'success');
        };
    }

    async performTap(x, y, imgW, imgH) {
        this.ui.setLoading(true, "TAPPING...");
        try {
            const res = await this.api.tap(x, y, imgW, imgH, this.currentPlatform);
            if (this.state.get('recorder.isRecording') && res.smart_action) {
                this.state.addStep(res.smart_action);
            }
            this.scanScreen();
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

    // --- ✅ YENİ: Context Menu Handlers (Send Keys & Assertions) ---
    // Bu kısım senin yüklediğin dosyada eksikti!

    handleSendKeys(element) {
        // ui-manager'a eklediğimiz showPromptModal'ı çağırıyoruz
        this.ui.showPromptModal(`Send text to: ${element.variable}`, "", async (text) => {
            if (!text) return;

            this.ui.setLoading(true, "SENDING KEYS...");
            try {
                // api.service'e eklediğimiz sendKeys'i çağırıyoruz
                await this.api.sendKeys(text, element.locator);

                if (this.state.get('recorder.isRecording')) {
                    this.state.addStep({
                        type: 'send_keys',
                        locator: element.locator,
                        text: text
                    });
                }

                this.ui.showToast("Success", "Text sent successfully");
                this.scanScreen();
            } catch (e) {
                this.ui.showToast("Error", "Failed to send keys", "error");
                this.ui.resetState();
            }
        });
    }

    async handleAssertion(type, element) {
        if (!this.state.get('recorder.isRecording')) {
            this.ui.showToast("Info", "Enable Recording first to add assertions", "info");
            return;
        }

        if (type === 'visibility') {
            this.state.addStep({
                type: 'assert_visible',
                locator: element.locator
            });
            this.ui.showToast("Assertion Added", "Verify Visibility");
        }
        else if (type === 'text') {
            this.ui.setLoading(true, "FETCHING TEXT...");
            try {
                // api.service'e eklediğimiz getElementText'i çağırıyoruz
                const res = await this.api.getElementText(element.locator);
                const text = res.text;

                this.state.addStep({
                    type: 'assert_text',
                    locator: element.locator,
                    expected: text
                });
                this.ui.showToast("Assertion Added", `Verify Text: "${text}"`);
            } catch (e) {
                this.ui.showToast("Error", "Could not read element text", "error");
            } finally {
                this.ui.resetState();
            }
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
        this.state.set('ui.currentHoverIndex', index);
    }

    // HTML tarafının erişmesi için global fonksiyonlar
    bindGlobals() {
        window.scanScreen = () => this.scanScreen();
        window.performTap = (x, y, w, h) => this.performTap(x, y, w, h);
        window.performScroll = (dir) => this.performScroll(dir);
        window.triggerBack = () => this.triggerAction('back');
        window.triggerHideKeyboard = () => this.triggerAction('hideKeyboard');

        window.toggleNavMode = (el) => {
            this.ui.toggleNavMode(el.checked);
            this.clearData();
            this.state.set('ui.currentHoverIndex', -1);
        };
        window.toggleVerifyUI = (el) => this.ui.toggleVerifyMode(el.checked);
        window.togglePlatform = () => {
            this.currentPlatform = this.currentPlatform === "ANDROID" ? "IOS" : "ANDROID";
            this.ui.togglePlatform(this.currentPlatform);
        };
        window.toggleSourceView = (mode) => {
            this.ui.toggleSourceView(mode);
        };

        window.openConfig = () => this.settings.openModal();
        window.saveConfig = () => this.settings.saveConfig();
        window.toggleRecordMode = () => this.exportMgr.toggleRecordMode();
        window.exportMgr = this.exportMgr;

        window.removeElement = (e, index) => {
            e.stopPropagation();
            const el = this.allElements.find(i => i.index === index);
            if (el) {
                el.isDeleted = true;
                if(el.locator) this.deletedLocators.add(el.locator);
                this.state.set('elements', this.allElements);
            }
        };

        window.highlightElement = (index) => {
            this.state.set('ui.currentHoverIndex', index);
        };

        window.clearSelection = () => {
             this.state.set('ui.currentHoverIndex', -1);
             const svg = document.getElementById('connector-path');
             if(svg) svg.style.display = 'none';
        };

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
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); this.ui.showConfirmModal(input.value, () => finish(true), () => { finish(false); input.focus(); }); }
                if (e.key === 'Escape') finish(false); e.stopPropagation();
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        };

        window.copyAllVariables = () => {
             const active = this.allElements.filter(e => !e.isDeleted);
             if(active.length === 0) return this.ui.showToast("Info", "No elements", "info");
             let output = "*** Variables ***\n";
             active.forEach(item => {
                 const parts = item.locator.split('=', 1);
                 output += `\${${item.variable.replace(/[${}]/g, '')}} = \t${parts[0]}=${item.locator.substring(parts[0].length + 1)}\n`;
             });
             navigator.clipboard.writeText(output).then(() => this.ui.showToast("Copied", "All variables copied"));
        };
    }
}

window.app = new AppController();