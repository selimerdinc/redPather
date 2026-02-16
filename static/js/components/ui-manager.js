/**
 * UI Manager
 * Handles generic UI interactions: Toasts, Modals, Loading states, and Toggles.
 */
class UIManager {
    constructor() {
        this.pendingEditCallback = null;
        this.pendingCancelCallback = null;
        this.initializeModalListeners();
    }

    setLoading(active, text = "YÜKLENİYOR...") {
        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loading-text');
        if (active) {
            if (loadingText) loadingText.innerText = text;
            loading.classList.remove('hidden');
            // Safety timeout: auto-reset loading after 60s to prevent stuck UI
            if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
            this._loadingTimeout = setTimeout(() => {
                console.warn('⚠️ Loading timeout safety net triggered (60s)');
                this.resetState();
            }, 60000);
        } else {
            loading.classList.add('hidden');
            if (this._loadingTimeout) {
                clearTimeout(this._loadingTimeout);
                this._loadingTimeout = null;
            }
        }
    }

    resetState(enableScanBtn = true) {
        this.setLoading(false);
        if (enableScanBtn) {
            const btn = document.getElementById('scanBtn');
            if (btn) btn.disabled = false;
        }
    }

    showEmptyState(show) {
        const el = document.getElementById('empty-state');
        const wrapper = document.getElementById('device-wrapper');
        if (show) {
            el.classList.remove('hidden');
            wrapper.classList.add('hidden');
        } else {
            el.classList.add('hidden');
            wrapper.classList.remove('hidden');
        }
    }

    showToast(title, message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
        toast.className = `pro-toast ${type}`;
        toast.innerHTML = `<div style="font-size: 20px; font-weight: bold;">${icons[type] || '•'}</div><div><h4 class="text-sm font-bold text-white">${title}</h4><p class="text-xs text-gray-400 font-mono">${message}</p></div>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3500);
    }

    initializeModalListeners() {
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('confirmModal');
            if (modal && modal.classList.contains('open')) {
                if (e.key === 'Enter') { e.preventDefault(); if (this.pendingEditCallback) this.pendingEditCallback(); this.hideConfirmModal(); }
                else if (e.key === 'Escape') { e.preventDefault(); if (this.pendingCancelCallback) this.pendingCancelCallback(); this.hideConfirmModal(); }
            }
        });
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');
        if (confirmBtn) confirmBtn.addEventListener('click', () => { if (this.pendingEditCallback) this.pendingEditCallback(); this.hideConfirmModal(); });
        if (cancelBtn) cancelBtn.addEventListener('click', () => { if (this.pendingCancelCallback) this.pendingCancelCallback(); this.hideConfirmModal(); });
    }

    showConfirmModal(newValue, onConfirm, onCancel) {
        const modal = document.getElementById('confirmModal');
        const valEl = document.getElementById('modalNewValue');
        if (modal && valEl) {
            valEl.innerText = newValue;
            modal.classList.add('open');
            this.pendingEditCallback = onConfirm;
            this.pendingCancelCallback = onCancel;
        }
    }

    hideConfirmModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) modal.classList.remove('open');
        this.pendingEditCallback = null;
        this.pendingCancelCallback = null;
    }

    // ✅ YENİ: Input Prompt Modal (DÜZELTİLDİ: break-all eklendi)
    showPromptModal(title, defaultValue, onConfirm) {
        const modalHTML = `
        <div id="promptModal" class="modal-overlay open">
            <div class="modal-box">
                <div class="flex flex-col gap-4">
                    <h3 class="text-sm font-bold text-white break-all">${title}</h3>
                    <input type="text" id="promptInput" class="config-input border-red-500/50 focus:border-red-500" value="${defaultValue || ''}" placeholder="Type here...">
                    <div class="flex gap-3 justify-end mt-2">
                        <button onclick="document.getElementById('promptModal').remove()" class="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded">İptal</button>
                        <button id="promptConfirmBtn" class="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-5 py-2 rounded">Tamam</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const input = document.getElementById('promptInput');
        input.focus();

        const confirm = () => {
            const val = input.value;
            document.getElementById('promptModal').remove();
            if (onConfirm) onConfirm(val);
        };

        document.getElementById('promptConfirmBtn').onclick = confirm;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') document.getElementById('promptModal').remove();
        });
    }

    toggleNavMode(active) {
        const ui = document.getElementById('nav-switch-ui');
        if (active) { ui.classList.add('active'); document.body.classList.add('nav-mode'); this.showToast("Navigasyon Modu", "Elemanlara tıklayarak işlem yapın", "info"); }
        else { ui.classList.remove('active'); document.body.classList.remove('nav-mode'); }
    }

    toggleVerifyMode(active) {
        const ui = document.getElementById('verify-switch-ui');
        if (active) ui.classList.add('active'); else ui.classList.remove('active');
    }

    togglePlatform(currentPlatform) {
        const slider = document.getElementById('toggle-slider');
        const optAndroid = document.getElementById('opt-android');
        const optIos = document.getElementById('opt-ios');
        if (currentPlatform === "IOS") { slider.style.transform = "translateX(100%)"; optAndroid.classList.remove('active'); optIos.classList.add('active'); }
        else { slider.style.transform = "translateX(0)"; optIos.classList.remove('active'); optAndroid.classList.add('active'); }
    }

    toggleSourceView(view) {
        const listEl = document.getElementById('elements-list');
        const sourceEl = document.getElementById('source-view-container');
        const slider = document.getElementById('view-slider');
        document.getElementById('view-list').classList.toggle('active', view === 'list');
        document.getElementById('view-source').classList.toggle('active', view !== 'list');
        if (view === 'list') { listEl.style.display = 'block'; sourceEl.style.display = 'none'; slider.style.transform = "translateX(0)"; }
        else { listEl.style.display = 'none'; sourceEl.style.display = 'block'; slider.style.transform = "translateX(calc(100% - 2px))"; }
    }

    // --- ✅ YENİ: AI Self-Healing Modal ---
    showHealingModal(data, onApply) {
        const modalId = 'healingModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const modalHTML = `
        <div id="${modalId}" class="modal-overlay open">
            <div class="modal-box w-[450px] border-green-500/30">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                        <h3 class="text-white font-bold text-base">AI ile İyileştirildi</h3>
                        <p class="text-green-500/70 text-[10px] uppercase font-bold tracking-widest">Self-Healing Aktif</p>
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="bg-black/40 p-3 rounded border border-white/5">
                        <span class="text-[9px] text-gray-500 uppercase font-bold block mb-1">Reason</span>
                        <p class="text-xs text-white leading-tight font-medium">${data.reason || 'Element structure changed.'}</p>
                        ${data.explanation ? `<p class="text-[10px] text-gray-400 mt-2 italic leading-normal">${data.explanation}</p>` : ''}
                    </div>

                    <div class="grid grid-cols-1 gap-2">
                        <div class="bg-red-500/5 p-2 rounded border border-red-500/10">
                            <span class="text-[9px] text-red-500/50 uppercase font-bold block mb-1">Broken Locator</span>
                            <p class="text-[10px] text-red-400 font-mono break-all line-through">${data.old_locator || '...'} </p>
                        </div>
                        <div class="bg-green-500/5 p-2 rounded border border-green-500/20">
                            <span class="text-[9px] text-green-500 uppercase font-bold block mb-1">Yeni Locator (Önerilen)</span>
                            <p class="text-[10px] text-green-400 font-mono break-all font-bold">${data.new_locator}</p>
                        </div>
                    </div>
                </div>

                <div class="flex gap-3 justify-end mt-6">
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-xs font-bold text-gray-500 hover:text-white px-4 py-2 transition-colors">
                        Vazgeç
                    </button>
                    <button id="applyHealingBtn" class="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-6 py-2 rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-95">
                        Düzeltmeyi Uygula
                    </button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('applyHealingBtn').onclick = () => {
            if (onApply) onApply(data.new_locator);
            document.getElementById(modalId).remove();
        };
    }

    showJiraBugModal(summary, description, screenshot, onSubmit) {
        const modalId = 'jiraBugModal';
        const existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const escapedSummary = summary.replace(/"/g, '&quot;');
        const escapedDesc = description.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-[#0f0f10] border border-[#27272a] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="p-6 border-b border-[#27272a]">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-xl">🐛</div>
                        <div>
                            <h2 class="text-sm font-bold text-white">Jira Kaydı Oluştur</h2>
                            <p class="text-[10px] text-gray-500">AI tarafından oluşturuldu - düzenleyebilirsiniz</p>
                        </div>
                    </div>
                </div>
                <div class="p-6 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label class="text-[10px] text-gray-400 uppercase font-bold block mb-1">Summary</label>
                        <input type="text" id="jiraSummaryInput" value="${escapedSummary}" 
                            class="w-full bg-zinc-900 text-white text-sm border border-[#27272a] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                    </div>
                    <div>
                        <label class="text-[10px] text-gray-400 uppercase font-bold block mb-1">Description</label>
                        <textarea id="jiraDescInput" rows="12" 
                            class="w-full bg-zinc-900 text-white text-xs font-mono border border-[#27272a] rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none">${escapedDesc}</textarea>
                    </div>
                </div>
                <div class="p-4 border-t border-[#27272a] flex gap-3 justify-end">
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-xs font-bold text-gray-500 hover:text-white px-4 py-2">Vazgeç</button>
                    <button id="submitJiraBugBtn" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-6 py-2 rounded-lg shadow-lg">🔗 Kayıt Oluştur</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('submitJiraBugBtn').onclick = () => {
            const finalSummary = document.getElementById('jiraSummaryInput').value;
            const finalDesc = document.getElementById('jiraDescInput').value;
            document.getElementById(modalId).remove();
            if (onSubmit) onSubmit(finalSummary, finalDesc);
        };
    }
}

window.UIManager = UIManager;