/**
 * Export Manager
 * Handles recording steps, generating code (Robot/Python), and export modal.
 */
class ExportManager {
    constructor(stateService, uiManager) {
        this.state = stateService;
        this.ui = uiManager;
    }

    toggleRecordMode() {
        const isRecording = this.state.toggleRecording();
        const btn = document.getElementById('recordBtn');

        if (isRecording) {
            btn.classList.add('bg-red-600', 'text-white', 'animate-pulse');
            btn.classList.remove('text-gray-400');
            this.ui.showToast("Recording Started", "Actions will be captured", "info");
        } else {
            btn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
            btn.classList.add('text-gray-400');
            const steps = this.state.get('recorder.steps');
            this.ui.showToast("Recording Stopped", `${steps.length} steps captured`, "success");
            if (steps.length > 0) this.showExportModal();
        }
    }

    showExportModal() {
        const steps = this.state.get('recorder.steps');
        if (!steps || steps.length === 0) {
            this.ui.showToast("Uyarı", "No steps to export", "info");
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
                        <div><h3 class="text-sm font-bold text-white">Export Recorded Test</h3><p class="text-[11px] text-gray-400">${stepCount} steps captured</p></div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.exportMgr.downloadFormat('robot')" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-3 rounded transition">🤖 Robot Framework (.robot)</button>
                        <button onclick="window.exportMgr.downloadFormat('python')" class="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-3 rounded transition">🐍 Python/Pytest (.py)</button>
                    </div>
                    <div>
                        <label class="config-label mb-2 block">PREVIEW</label>
                        <div class="bg-[#09090b] p-3 rounded border border-[#27272a] max-h-64 overflow-y-auto">
                            <code class="text-[10px] text-gray-400 font-mono block whitespace-pre">${this.generateRobotCode()}</code>
                        </div>
                    </div>
                    <div class="flex gap-3 justify-end pt-3 border-t border-[#27272a]">
                        <button onclick="window.exportMgr.clearSteps()" class="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded transition">Clear Steps</button>
                        <button onclick="window.exportMgr.closeModal()" class="bg-[#27272a] hover:bg-[#3f3f46] text-white text-xs font-bold px-5 py-2 rounded transition">Close</button>
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
        this.ui.showToast("Cleared", "Steps removed", "info");
    }

    downloadFormat(format) {
        const code = format === 'robot' ? this.generateRobotCode() : this.generatePythonCode();
        const filename = format === 'robot' ? 'test.robot' : 'test.py';
        const blob = new Blob([code], {type: 'text/plain'});
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
        });
        return code;
    }

    generatePythonCode() {
        const steps = this.state.get('recorder.steps');
        let code = `import pytest\nfrom appium import webdriver\n\ndef test_scenario(driver):\n`;
        steps.forEach((step, i) => {
            if(step.locator) {
                var strat = step.locator.split('=')[0] === 'id' ? 'ID' : 'XPATH';
                var val = step.locator.split('=')[1];
            }
            code += `    # Step ${i+1}\n`;

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