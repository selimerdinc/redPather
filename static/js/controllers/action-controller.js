/**
 * Action Controller - Device interaction functionality
 * Handles tap, scroll, back, hide keyboard, and other device actions
 */
class ActionController {
    constructor(appController) {
        this.app = appController;
    }

    /**
     * Perform tap action at coordinates
     */
    async performTap(x, y, imgW, imgH) {
        this.app.ui.setLoading(true, "TIKLANIYOR...");
        try {
            const res = await this.app.api.tap(x, y, imgW, imgH, this.app.currentPlatform);

            // AI Healing check
            if (res.data && res.data.healed) {
                this.app.handleHealedResponse(res.data);
            }

            // Record action if recording
            if (this.app.state.get('recorder.isRecording') && res.data && res.data.smart_action) {
                this.app.state.addStep(res.data.smart_action);
            }

            this.app.scanController.scanScreen();
        } catch (e) {
            this.app.ui.showToast("Hata", e.userMessage || e.message || "Tıklama başarısız", "error");
            this.app.ui.resetState();
        }
    }

    /**
     * Perform scroll action
     */
    async performScroll(direction) {
        this.app.ui.setLoading(true, "KAYDIRILIYOR...");
        try {
            await this.app.api.scroll(direction, this.app.currentPlatform);

            // Record action if recording
            if (this.app.state.get('recorder.isRecording')) {
                this.app.state.addStep({ type: 'scroll', direction });
            }

            this.app.scanController.scanScreen();
        } catch (e) {
            this.app.ui.showToast("Hata", e.userMessage || e.message || "Kaydırma başarısız", "error");
            this.app.ui.resetState();
        }
    }

    /**
     * Trigger device action (back, hide keyboard, etc.)
     */
    async triggerAction(actionName) {
        this.app.ui.setLoading(true, actionName.toUpperCase() + "...");
        try {
            await this.app.api.deviceAction(actionName, this.app.currentPlatform);

            // Record action if recording
            if (this.app.state.get('recorder.isRecording')) {
                this.app.state.addStep({ type: 'action', action: actionName });
            }

            this.app.scanController.scanScreen();
        } catch (e) {
            this.app.ui.showToast("Hata", e.userMessage || e.message || `${actionName} başarısız`, "error");
            this.app.ui.resetState();
        }
    }

    /**
     * Trigger back button
     */
    async triggerBack() {
        return this.triggerAction('back');
    }

    /**
     * Trigger hide keyboard
     */
    async triggerHideKeyboard() {
        return this.triggerAction('hide_keyboard');
    }

    /**
     * Handle send keys action
     */
    async handleSendKeys(element) {
        // Show input modal
        this.app.showInputModal(element.locator, element.text || '');
    }

    /**
     * Submit input from modal
     */
    async submitInput(locator, text) {
        this.app.ui.setLoading(true, "METİN GİRİLİYOR...");
        try {
            await this.app.api.sendKeys(locator, text, this.app.currentPlatform);

            // Record action if recording
            if (this.app.state.get('recorder.isRecording')) {
                this.app.state.addStep({
                    type: 'input',
                    locator,
                    text,
                    keyword: `Input Text    ${locator}    ${text}`
                });
            }

            this.app.closeInputModal();
            this.app.scanController.scanScreen();
        } catch (e) {
            this.app.ui.showToast("Hata", e.userMessage || e.message || "Metin girişi başarısız", "error");
            this.app.ui.resetState();
        }
    }

    /**
     * Handle assertion action
     */
    async handleAssertion(type, element) {
        const locator = element.locator;
        const text = element.text || '';

        let assertionKeyword = '';

        switch (type) {
            case 'visible':
                assertionKeyword = `Element Should Be Visible    ${locator}`;
                break;
            case 'enabled':
                assertionKeyword = `Element Should Be Enabled    ${locator}`;
                break;
            case 'text':
                assertionKeyword = `Element Text Should Be    ${locator}    ${text}`;
                break;
            case 'exists':
                assertionKeyword = `Page Should Contain Element    ${locator}`;
                break;
            default:
                assertionKeyword = `Element Should Be Visible    ${locator}`;
        }

        // Copy to clipboard
        try {
            await navigator.clipboard.writeText(assertionKeyword);
            this.app.ui.showToast("📋 Kopyalandı", assertionKeyword.substring(0, 50) + "...", "success");

            // Record assertion if recording
            if (this.app.state.get('recorder.isRecording')) {
                this.app.state.addStep({
                    type: 'assertion',
                    assertion_type: type,
                    locator,
                    text,
                    keyword: assertionKeyword
                });
            }
        } catch (e) {
            console.error("Clipboard error:", e);
        }
    }
}

// Export for use in app.js
window.ActionController = ActionController;
