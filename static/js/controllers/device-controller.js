/**
 * Device Controller - Handles device interaction actions
 * Extracted from app.js for better modularity
 */

class DeviceController {
    constructor(api, ui, state) {
        this.api = api;
        this.ui = ui;
        this.state = state;
        this.currentPlatform = 'ANDROID';
    }

    /**
     * Set the current platform
     */
    setPlatform(platform) {
        this.currentPlatform = platform.toUpperCase();
        window.appState?.setPlatform(this.currentPlatform);
        this.ui.togglePlatform(this.currentPlatform);
        window.debug?.log(`🌐 Platform switched to: ${this.currentPlatform}`);
    }

    /**
     * Toggle between platforms
     */
    togglePlatform() {
        const next = this.currentPlatform === 'ANDROID' ? 'IOS' : 'ANDROID';
        this.setPlatform(next);
    }

    /**
     * Perform tap action
     */
    async performTap(x, y, imgW, imgH, callback) {
        this.ui.setLoading(true, "TIKLANIYOR...");
        try {
            const res = await this.api.tap(x, y, imgW, imgH, this.currentPlatform);

            // Handle healed response
            if (res.data?.healed) {
                callback?.('healed', res.data);
            }

            // Record step if recording
            if (this.state.get('recorder.isRecording') && res.data?.smart_action) {
                this.state.addStep(res.data.smart_action);
            }

            return res;
        } catch (e) {
            this.ui.showToast("Hata", e.userMessage || e.message || "Tıklama başarısız", "error");
            this.ui.resetState();
            throw e;
        }
    }

    /**
     * Perform scroll action
     */
    async performScroll(direction) {
        this.ui.setLoading(true, "KAYDIRILIYOR...");
        try {
            await this.api.scroll(direction, this.currentPlatform);
            if (this.state.get('recorder.isRecording')) {
                this.state.addStep({ type: 'scroll', direction });
            }
            return true;
        } catch (e) {
            this.ui.showToast("Hata", e.userMessage || e.message || "Kaydırma başarısız", "error");
            this.ui.resetState();
            throw e;
        }
    }

    /**
     * Trigger back action
     */
    async triggerBack() {
        return this.triggerAction('back');
    }

    /**
     * Trigger hide keyboard action
     */
    async triggerHideKeyboard() {
        return this.triggerAction('hideKeyboard');
    }

    /**
     * Generic action trigger
     */
    async triggerAction(actionName) {
        this.ui.setLoading(true, `${actionName.toUpperCase()}...`);
        try {
            if (actionName === 'back') await this.api.back();
            if (actionName === 'hideKeyboard') await this.api.hideKeyboard();

            if (this.state.get('recorder.isRecording')) {
                this.state.addStep({ type: actionName });
            }
            return true;
        } catch (e) {
            this.ui.showToast("Hata", e.userMessage || e.message || `${actionName} işlemi başarısız`, "error");
            this.ui.resetState();
            throw e;
        }
    }

    /**
     * Send keys to an element
     */
    async sendKeys(locator, text) {
        this.ui.setLoading(true, "METİN GÖNDERİLİYOR...");
        try {
            await this.api.sendKeys(locator, text);

            if (this.state.get('recorder.isRecording')) {
                this.state.addStep({
                    type: 'send_keys',
                    locator: locator,
                    text: text
                });
            }

            this.ui.showToast("Başarılı", "Metin başarıyla gönderildi");
            return true;
        } catch (e) {
            this.ui.showToast("Hata", "Metin gönderme başarısız", "error");
            this.ui.resetState();
            throw e;
        }
    }

    /**
     * Add assertion step
     */
    async addAssertion(type, element) {
        if (!this.state.get('recorder.isRecording')) {
            this.ui.showToast("Bilgi", "Doğrulama eklemek için önce Kaydı başlatın", "info");
            return false;
        }

        if (type === 'visibility') {
            this.state.addStep({
                type: 'assert_visible',
                locator: element.locator
            });
            this.ui.showToast("Doğrulama Eklendi", "Görünürlük Kontrolü");
            return true;
        }

        if (type === 'text') {
            this.ui.setLoading(true, "METİN ALINIYOR...");
            try {
                const res = await this.api.getElementText(element.locator);
                const text = res.text;

                this.state.addStep({
                    type: 'assert_text',
                    locator: element.locator,
                    expected: text
                });
                this.ui.showToast("Doğrulama Eklendi", `Metin Kontrolü: "${text}"`);
                return true;
            } catch (e) {
                this.ui.showToast("Hata", "Eleman metni okunamadı", "error");
                this.ui.resetState();
                return false;
            }
        }

        return false;
    }
}

// Export to window for global access
window.DeviceController = DeviceController;
