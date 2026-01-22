/**
 * Export Controller - Variable export and clipboard functionality
 * Handles copying variables, AI keywords, and Robot Framework export
 */
class ExportController {
    constructor(appController) {
        this.app = appController;
    }

    /**
     * Copy all variables to clipboard
     */
    async copyAllVariables() {
        const elements = this.app.state.get('elements') || this.app.allElements || [];

        if (!elements || elements.length === 0) {
            this.app.ui.showToast("Uyarı", "Kopyalanacak element yok", "warning");
            return;
        }

        const lines = elements
            .filter(el => !el.isDeleted)
            .map(el => `${el.variable}    ${el.locator}`);

        const output = "*** Variables ***\n" + lines.join('\n');

        try {
            await navigator.clipboard.writeText(output);
            this.app.ui.showToast("📋 Kopyalandı", `${lines.length} değişken panoya kopyalandı`, "success");
        } catch (e) {
            console.error("Clipboard error:", e);
            this.app.ui.showToast("Hata", "Panoya kopyalama başarısız", "error");
        }
    }

    /**
     * Copy single variable to clipboard
     */
    async copySingleVariable(element) {
        const line = `${element.variable}    ${element.locator}`;

        try {
            await navigator.clipboard.writeText(line);
            this.app.ui.showToast("📋 Kopyalandı", element.variable, "success");
        } catch (e) {
            console.error("Clipboard error:", e);
        }
    }

    /**
     * Copy locator only
     */
    async copyLocator(element) {
        try {
            await navigator.clipboard.writeText(element.locator);
            this.app.ui.showToast("📋 Locator Kopyalandı", element.locator.substring(0, 40) + "...", "success");
        } catch (e) {
            console.error("Clipboard error:", e);
        }
    }

    /**
     * Request AI keywords generation
     */
    async generateAIKeywords(customPrompt = '') {
        const elements = this.app.state.get('elements') || this.app.allElements || [];

        if (!elements || elements.length === 0) {
            this.app.ui.showToast("Uyarı", "Keyword üretilecek element yok", "warning");
            return;
        }

        this.app.ui.setLoading(true, "AI KEYWORD ÜRETİYOR...");

        try {
            const result = await this.app.api.generateKeywords(
                elements.filter(el => !el.isDeleted),
                customPrompt
            );

            if (result && result.data) {
                this.app.showAIKeywordsModal(result.data);
            } else {
                throw new Error("AI yanıt alamadı");
            }
        } catch (e) {
            this.app.ui.showToast("Hata", e.userMessage || e.message || "AI keyword üretimi başarısız", "error");
        } finally {
            this.app.ui.resetState();
        }
    }

    /**
     * Translate variable names using AI
     */
    async translateVariableNames() {
        const elements = this.app.state.get('elements') || this.app.allElements || [];

        if (!elements || elements.length === 0) {
            this.app.ui.showToast("Uyarı", "Çevrilecek element yok", "warning");
            return;
        }

        this.app.ui.setLoading(true, "AI İSİMLERİ ÇEVİRİYOR...");

        try {
            const variableNames = elements
                .filter(el => !el.isDeleted)
                .map(el => el.variable);

            const result = await this.app.api.translateVariableNames(variableNames);

            if (result && result.data) {
                // Apply translations to elements
                let translatedCount = 0;
                elements.forEach(el => {
                    const newName = result.data[el.variable];
                    if (newName && newName !== el.variable) {
                        el.variable = newName;
                        translatedCount++;
                    }
                });

                this.app.state.set('elements', elements);
                this.app.ui.showToast("🌐 Çeviri Tamamlandı", `${translatedCount} isim güncellendi`, "success");
            }
        } catch (e) {
            this.app.ui.showToast("Hata", e.userMessage || e.message || "Çeviri başarısız", "error");
        } finally {
            this.app.ui.resetState();
        }
    }

    /**
     * Download variables as Robot Framework file
     */
    downloadAsRobotFile() {
        const elements = this.app.state.get('elements') || this.app.allElements || [];

        if (!elements || elements.length === 0) {
            this.app.ui.showToast("Uyarı", "İndirilecek element yok", "warning");
            return;
        }

        const lines = elements
            .filter(el => !el.isDeleted)
            .map(el => `${el.variable}    ${el.locator}`);

        const output = "*** Variables ***\n" + lines.join('\n');
        const pageName = document.getElementById('pagePrefix').value || 'page';
        const filename = `${pageName}_locators.robot`;

        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.app.ui.showToast("📥 İndirildi", filename, "success");
    }
}

// Export for use in app.js
window.ExportController = ExportController;
