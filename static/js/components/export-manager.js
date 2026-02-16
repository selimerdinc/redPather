/**
 * Export Manager
 * Handles recording steps, generating code (Robot/Python), and export modal.
 */
class ExportManager {
    constructor(stateService, uiManager) {
        this.state = stateService;
        this.ui = uiManager;

        // Fix #10: React to state changes instead of direct DOM manipulation in StateService
        this.state.subscribe('recorder.steps', (steps) => {
            const badge = document.getElementById('stepCountBadge');
            if (badge && this.state.get('recorder.isRecording')) {
                badge.textContent = steps.length;
                badge.classList.remove('hidden');
            }
        });
    }

    toggleRecordMode() {
        const isRecording = this.state.toggleRecording();
        const btn = document.getElementById('recordBtn');
        const badge = document.getElementById('stepCountBadge');

        if (isRecording) {
            btn.classList.add('bg-red-600', 'text-white', 'animate-pulse');
            btn.classList.remove('text-gray-400');
            this.ui.showToast("Kayıt Başlatıldı", "Aksiyonlar kaydedilecek", "info");
            // Step counter'ı göster
            if (badge) {
                badge.textContent = this.state.get('recorder.steps').length || '0';
                badge.classList.remove('hidden');
            }
        } else {
            btn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
            btn.classList.add('text-gray-400');
            const steps = this.state.get('recorder.steps');
            this.ui.showToast("Kayıt Durduruldu", `${steps.length} adım kaydedildi`, "success");
            // Step counter'ı gizle
            if (badge) badge.classList.add('hidden');
            if (steps.length > 0) this.showExportModal();
        }
    }

    showExportModal() {
        const steps = this.state.get('recorder.steps');
        if (!steps || steps.length === 0) {
            this.ui.showToast("Uyarı", "Dışa aktarılacak adım yok", "info");
            return;
        }
        this.renderModal(steps.length);
    }

    renderModal(stepCount) {
        const modalHTML = `
        <div id="exportModal" class="modal-overlay open">
            <div class="modal-box config-modal-box">
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-3 border-b border-[#27272a] pb-3">
                        <div class="w-10 h-10 rounded-lg bg-red-900/30 flex items-center justify-center text-red-500">
                           <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                        </div>
                        <div><h3 class="text-sm font-bold text-white">Kaydedilen Testi Dışa Aktar</h3><p class="text-[11px] text-gray-400">${stepCount} adım kaydedildi</p></div>
                    </div>
                    <div class="flex gap-2">
                        <div class="flex-1 flex flex-col gap-2">
                            <button onclick="window.exportMgr.downloadFormat('robot')" class="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-4 py-2.5 rounded transition">🤖 Robot Framework</button>
                            ${window.app && window.app.isAiEnabled ? `<button onclick="window.exportMgr.aiRefine('robot')" class="bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-[9px] font-bold py-1.5 rounded border border-blue-800 transition">✨ AI Optimize Et (2-3sn Bekleyin)</button>` : ''}
                        </div>
                        <div class="flex-1 flex flex-col gap-2">
                            <button onclick="window.exportMgr.downloadFormat('python')" class="bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold px-4 py-2.5 rounded transition">🐍 Python/Pytest</button>
                            ${window.app && window.app.isAiEnabled ? `<button onclick="window.exportMgr.aiRefine('python')" class="bg-green-900/40 hover:bg-green-800/60 text-green-300 text-[9px] font-bold py-1.5 rounded border border-green-800 transition">✨ AI Optimize Et (2-3sn Bekleyin)</button>` : ''}
                        </div>
                    </div>
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <label class="config-label">ÖNİZLEME</label>
                            <button onclick="window.exportMgr.copyPreview()" class="text-[10px] text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-[#27272a] transition flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                Kopyala
                            </button>
                        </div>
                        <div class="bg-[#09090b] p-3 rounded border border-[#27272a] max-h-64 overflow-y-auto min-h-[100px]">
                            <code id="exportPreview" class="text-[10px] text-gray-400 font-mono block whitespace-pre">${this.generateRobotCode()}</code>
                        </div>
                    </div>
                    <div class="flex gap-3 justify-end pt-3 border-t border-[#27272a]">
                        <button onclick="window.exportMgr.clearSteps()" class="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded transition">Adımları Temizle</button>
                        <button onclick="window.exportMgr.closeModal()" class="bg-[#27272a] hover:bg-[#3f3f46] text-white text-xs font-bold px-5 py-2 rounded transition">Kapat</button>
                    </div>
                </div>
            </div>
        </div>`;
        const existing = document.getElementById('exportModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    closeModal() {
        const modal = document.getElementById('exportModal');
        if (modal) { modal.classList.remove('open'); setTimeout(() => modal.remove(), 300); }
    }

    clearSteps() {
        this.state.clearSteps();
        this.closeModal();
        this.ui.showToast("Temizlendi", "Adımlar silindi", "info");
    }

    copyPreview() {
        const preview = document.getElementById('exportPreview');
        if (!preview) return;

        navigator.clipboard.writeText(preview.textContent).then(() => {
            this.ui.showToast("Kopyalandı", "Kod panoya kopyalandı", "success");
        }).catch(() => {
            this.ui.showToast("Hata", "Kopyalama başarısız", "error");
        });
    }

    async aiRefine(format) {
        const steps = this.state.get('recorder.steps');
        const preview = document.getElementById('exportPreview');
        if (!preview) return;

        const originalText = preview.innerText;
        preview.innerText = "✨ AI işleniyor, lütfen bekleyin...\n(Prompt kuralları uygulanıyor)";
        preview.classList.add('animate-pulse', 'text-blue-400', 'min-h-[100px]');

        try {
            const res = await window.api.aiGenerateScript(steps, format);
            // ✅ FIX: API returns {data: {script: "..."}} not {script: "..."}
            const script = res.data?.script || res.script;

            if (script) {
                preview.innerText = script;
                preview.classList.remove('text-gray-400');
                preview.classList.add('text-emerald-400');
                this.ui.showToast("AI Başarılı", "Script özel prompt'a göre düzenlendi", 'success');
            } else {
                preview.innerText = originalText;
                this.ui.showToast("AI Uyarı", "Script oluşturulamadı", "warning");
            }
        } catch (e) {
            console.error("AI Refine Error:", e);
            preview.innerText = originalText;
            this.ui.showToast("AI Hatası", e.userMessage || "Script düzenlenemedi.", "error");
        } finally {
            preview.classList.remove('animate-pulse');
        }
    }

    downloadFormat(format) {
        const previewEl = document.getElementById('exportPreview');
        let code = "";

        if (previewEl && previewEl.classList.contains('text-emerald-400')) {
            code = previewEl.innerText;
        } else {
            code = format === 'robot' ? this.generateRobotCode() : this.generatePythonCode();
        }

        const filename = format === 'robot' ? 'test.robot' : 'test.py';
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        this.ui.showToast("Exported", filename, "success");
    }

    generateRobotCode() {
        const steps = this.state.get('recorder.steps');
        let code = `*** Settings ***\nLibrary    AppiumLibrary\n\n*** Test Cases ***\nRecorded Scenario\n`;
        steps.forEach(step => {
            if (step.type === 'element_click') code += `    Click Element    ${step.locator}\n`;
            else if (step.type === 'coordinate_tap') code += `    Tap    ${step.x}    ${step.y}\n`;
            // ✅ YENİ AKSİYONLAR
            else if (step.type === 'send_keys') code += `    Input Text    ${step.locator}    ${step.text}\n`;
            else if (step.type === 'assert_text') code += `    Element Text Should Be    ${step.locator}    ${step.expected}\n`;
            else if (step.type === 'assert_visible') code += `    Element Should Be Visible    ${step.locator}\n`;
            // ------------------
            else if (step.type === 'scroll') code += `    Swipe    ${step.direction}\n`;
            else if (step.type === 'back') code += `    Go Back\n`;
            else if (step.type === 'hideKeyboard') code += `    Hide Keyboard\n`;
        });

        // Custom prompt'tan basit replacement uygula
        code = this.applyCustomReplacements(code);
        return code;
    }

    // Custom prompt'tan keyword replacement'ları uygula
    applyCustomReplacements(code) {
        // Settings modal'dan veya cache'den custom prompt'u al
        let prompt = '';
        const promptEl = document.getElementById('conf_ai_prompt');
        if (promptEl && promptEl.value) {
            prompt = promptEl.value.toLowerCase();
        } else {
            // Fallback: API'den son yüklenen config
            prompt = (window._cachedCustomPrompt || '').toLowerCase();
        }

        if (!prompt) return code;

        // "click element" -> "utils.click" gibi değişiklikler
        if (prompt.includes('utils.click')) {
            code = code.replace(/Click Element/g, 'utils.click');
        }
        if (prompt.includes('utils.input') || prompt.includes('utils.send')) {
            code = code.replace(/Input Text/g, 'utils.input');
        }
        if (prompt.includes('utils.tap')) {
            code = code.replace(/Tap/g, 'utils.tap');
        }

        return code;
    }

    generatePythonCode() {
        const steps = this.state.get('recorder.steps');
        let code = `import pytest\nfrom appium import webdriver\nfrom appium.webdriver.common.appiumby import AppiumBy\n\ndef test_scenario(driver):\n`;

        steps.forEach((step, i) => {
            if (step.locator) {
                const strat = step.locator.split('=')[0] === 'id' ? 'ID' : 'XPATH';
                const val = step.locator.split('=')[1];
            }
            code += `    # Step ${i + 1}\n`;

            if (step.type === 'element_click')
                code += `    driver.find_element(AppiumBy.${strat}, "${val}").click()\n`;
            // ✅ YENİ AKSİYONLAR
            else if (step.type === 'send_keys')
                code += `    driver.find_element(AppiumBy.${strat}, "${val}").send_keys("${step.text}")\n`;
            else if (step.type === 'assert_text')
                code += `    assert driver.find_element(AppiumBy.${strat}, "${val}").text == "${step.expected}"\n`;
            else if (step.type === 'assert_visible')
                code += `    assert driver.find_element(AppiumBy.${strat}, "${val}").is_displayed()\n`;
            // ------------------
            else if (step.type === 'coordinate_tap')
                code += `    driver.tap([(${step.x}, ${step.y})])\n`;
        });
        return code;
    }
}

window.ExportManager = ExportManager;