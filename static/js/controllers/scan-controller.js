/**
 * Scan Controller - Screen scanning and analysis functionality
 * Handles page scanning, AI page recognition, and scan result processing
 */
class ScanController {
    constructor(appController) {
        this.app = appController;
        this.lastSourceHash = null;
        this.lastAiPageName = null;
        this.lastHeuristicPageName = null;
    }

    /**
     * Perform screen scan with optional AI page recognition
     */
    async scanScreen() {
        const verify = document.getElementById('autoVerify').checked;
        let prefix = document.getElementById('pagePrefix').value || "page";

        this.app.ui.setLoading(true, "ANALİZ EDİLİYOR...");
        this.app.ui.showEmptyState(false);
        this.app.clearData();

        try {
            const data = await this.app.api.scan(this.app.currentPlatform, verify, prefix);

            // AI Optimization: Skip AI if page hasn't changed
            let skipAi = this._shouldSkipAi(data);

            // AI automatic page name detection
            if (this.app.isAiEnabled && data.image && !skipAi) {
                await this._performAiPageRecognition(data, prefix);
            } else if (skipAi && this.lastAiPageName) {
                this._useCachedAiName(data);
            }

            this.handleScanResult(data);
        } catch (error) {
            console.error(error);
            this.app.ui.showToast("Hata", error.userMessage || error.message || "Tarama başarısız oldu", "error");
            this.app.ui.resetState();
            this.app.ui.showEmptyState(true);
        }
    }

    /**
     * Check if AI page recognition should be skipped
     */
    _shouldSkipAi(data) {
        // Same source hash (identical screen)
        if (this.lastSourceHash === data.source_hash && this.lastAiPageName) {

            return true;
        }

        // Same heuristic page name (probably same page with minor changes)
        if (this.lastHeuristicPageName === data.page_name && this.lastAiPageName) {

            return true;
        }

        return false;
    }

    /**
     * Perform AI page recognition
     */
    async _performAiPageRecognition(data, prefix) {
        try {
            this.app.ui.setLoading(true, "AI SAYFA ADI BELİRLİYOR...");
            const aiRes = await this.app.api.aiRecognizePage(data.image);
            const pageName = aiRes.data?.page_name || aiRes.page_name;

            if (pageName && pageName !== "unknown" && pageName !== "page") {
                const cleanNewPage = pageName.replace(/_screen$/, '').replace(/_page$/, '');

                // Update state
                this.lastAiPageName = cleanNewPage;
                this.lastHeuristicPageName = data.page_name;
                this.lastSourceHash = data.source_hash;

                document.getElementById('pagePrefix').value = cleanNewPage;
                data.page_name = cleanNewPage;

                // Update element names
                this._applyPagePrefixToElements(data, cleanNewPage);
                this.app.ui.showToast("🤖 AI", `Sayfa: ${cleanNewPage}`, "info");
            }
        } catch (aiError) {
            console.warn("AI page recognition skipped:", aiError.message);
        }
    }

    /**
     * Use cached AI page name
     */
    _useCachedAiName(data) {
        document.getElementById('pagePrefix').value = this.lastAiPageName;
        data.page_name = this.lastAiPageName;
        this._applyPagePrefixToElements(data, this.lastAiPageName);
        console.info("💡 Using cached AI page name:", this.lastAiPageName);
    }

    /**
     * Apply page prefix to all elements
     */
    _applyPagePrefixToElements(data, cleanNewPage) {
        if (data.elements && data.elements.length > 0) {
            data.elements = data.elements.map(el => {
                if (el.variable) {
                    let content = el.variable.replace('${selector_', '').replace('}', '');
                    let parts = content.split('_');
                    parts[0] = cleanNewPage;
                    const uniqueParts = [];
                    parts.forEach(p => {
                        if (uniqueParts.length === 0 || p !== uniqueParts[uniqueParts.length - 1]) {
                            uniqueParts.push(p);
                        }
                    });
                    el.variable = `\${selector_${uniqueParts.join('_')}}`;
                }
                return el;
            });
        }
    }

    /**
     * Handle scan result and update UI
     */
    handleScanResult(data) {
        const img = document.getElementById('screenshot');
        img.src = "data:image/png;base64," + data.image;

        if (data.window_w && this.app.overlayMgr) {
            this.app.overlayMgr.setDeviceSize(data.window_w, data.window_h);
        }

        img.onload = () => {
            this.app.ui.resetState();
            this.app.ui.showEmptyState(false);
            if (data.page_name) document.getElementById('pagePrefix').value = data.page_name;

            const validElements = data.elements.filter(el => !this.app.deletedLocators.has(el.locator));
            this.app.allElements = validElements.map((el, idx) => ({ ...el, index: idx, isDeleted: false }));

            this.app.state.set('elements', this.app.allElements);

            // Show copy buttons if elements found
            if (validElements.length > 0) {
                const copyBtn = document.getElementById('copyAllBtn');
                const copyAIBtn = document.getElementById('copyAllAIBtn');
                const translateBtn = document.getElementById('translateAIBtn');
                if (copyBtn) copyBtn.classList.remove('hidden', 'opacity-0', 'scale-95');
                if (copyAIBtn) copyAIBtn.classList.remove('hidden', 'opacity-0', 'scale-95');
                if (translateBtn) translateBtn.classList.remove('hidden', 'opacity-0', 'scale-95');
            }

            if (this.app.xmlViewer) this.app.xmlViewer.render(data.raw_source || "");
            this.app.ui.showToast("Başarılı", `${validElements.length} eleman bulundu`, 'success');

            // Update connection status
            this.app.updateConnectionStatus(true);
        };
    }
}

// Export for use in app.js
window.ScanController = ScanController;
