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

    setLoading(active, text = "LOADING...") {
        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loading-text');
        if (active) {
            if (loadingText) loadingText.innerText = text;
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
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
        const icons = { success: '✓', error: '✕', info: 'ℹ' };
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
                        <button onclick="document.getElementById('promptModal').remove()" class="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded">Cancel</button>
                        <button id="promptConfirmBtn" class="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-5 py-2 rounded">OK</button>
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
        if (active) { ui.classList.add('active'); document.body.classList.add('nav-mode'); this.showToast("Navigation Mode", "Click elements to tap & rescan", "info"); }
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
}

window.UIManager = UIManager;