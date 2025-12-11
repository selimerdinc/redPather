/**
 * Element List Manager
 * Handles the left sidebar list items, editing, and actions (verify, copy, delete).
 */
class ElementListManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);

        // State aboneliği (Highlight için)
        if (window.appState) {
            window.appState.subscribe('ui.currentHoverIndex', (idx) => this.handleHighlight(idx));
        }
    }

    render(elements) {
        if (!this.container) return;
        this.container.innerHTML = ''; // Listeyi temizle

        elements.forEach((el) => {
            if (!el.isDeleted) {
                const item = this.createListItem(el);
                this.container.appendChild(item);
            }
        });
    }

    createListItem(el) {
        const index = el.index;

        // Ana Kart
        const item = document.createElement('div');
        item.id = `list-item-${index}`;
        item.className = 'list-item p-4 rounded-lg mb-2 cursor-pointer group relative flex flex-col gap-2 border border-[#27272a]';

        // Badge Rengi Belirleme
        let badgeClass = "bg-gray-800 text-gray-400 border border-gray-700";
        if (el.strategy.includes('ID')) badgeClass = "bg-blue-900/30 text-blue-400 border border-blue-800";
        else if (el.strategy.includes('ACC_ID')) badgeClass = "bg-emerald-900/30 text-emerald-400 border border-emerald-800";
        else if (el.strategy.includes('ANCHOR')) badgeClass = "bg-pink-900/30 text-pink-400 border border-pink-800";
        else if (el.strategy.includes('TEXT')) badgeClass = "bg-purple-900/30 text-purple-400 border border-purple-800";

        // --- Header (Index + Strategy + Text) ---
        const header = document.createElement('div');
        header.className = "flex items-center justify-between w-full";

        header.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono font-bold text-gray-500">#${String(index + 1).padStart(2, '0')}</span>
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}">${el.strategy}</span>
            </div>
        `;

        if (el.text) {
            const textSpan = document.createElement('span');
            textSpan.className = "text-[10px] text-gray-500 truncate max-w-[120px]";
            textSpan.title = el.text;
            textSpan.textContent = el.text;
            header.appendChild(textSpan);
        }
        item.appendChild(header);

        // --- Variables (Variable Name + Locator) ---
        const varContainer = document.createElement('div');
        varContainer.className = "w-full";

        // Variable Name (Editable)
        const varCode = document.createElement('code');
        varCode.className = "block text-[13px] text-red-400 font-bold break-all hover:text-red-300 transition-colors cursor-text mb-1 border border-transparent hover:border-red-900/30 rounded px-1 -mx-1";
        varCode.title = "Çift tıkla düzenle";
        varCode.textContent = el.variable;
        varCode.ondblclick = (e) => {
            e.stopPropagation();
            if (window.startEdit) window.startEdit(varCode, index, 'variable');
        };
        varContainer.appendChild(varCode);

        // Locator (Editable)
        const locCode = document.createElement('code');
        locCode.className = "block text-[10px] text-gray-600 bg-[#09090b] px-2 py-1.5 rounded border border-[#27272a] break-all font-mono hover:text-gray-400 hover:border-gray-500 transition-colors cursor-text";
        locCode.title = "Çift tıkla düzenle";
        locCode.textContent = el.locator;
        locCode.ondblclick = (e) => {
            e.stopPropagation();
            if (window.startEdit) window.startEdit(locCode, index, 'locator');
        };
        varContainer.appendChild(locCode);

        item.appendChild(varContainer);

        // --- Actions Buttons ---
        const actions = document.createElement('div');
        actions.className = "flex items-center gap-2 w-full mt-1";

        // Verify Button
        const verifyBtn = this.createActionButton(
            `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>`,
            "Doğrula"
        );
        verifyBtn.onclick = (e) => this.handleVerify(e, index, verifyBtn, el.locator);
        actions.appendChild(verifyBtn);

        // Copy Button
        const copyBtn = this.createActionButton(
            `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`,
            "Kopyala"
        );
        copyBtn.onclick = (e) => this.handleCopy(e, el);
        actions.appendChild(copyBtn);

        // Delete Button
        const deleteBtn = this.createActionButton(
            `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            "Sil",
            true // isDelete
        );
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.removeElement) window.removeElement(e, index);
        };
        actions.appendChild(deleteBtn);

        item.appendChild(actions);

        // --- Event Listeners ---
        item.addEventListener('mouseenter', () => {
            if (window.highlightElement) window.highlightElement(index, false);
        });
        item.addEventListener('mouseleave', () => {
            if (window.clearSelection) window.clearSelection();
        });

        return item;
    }

    createActionButton(iconHtml, title, isDelete = false) {
        const btn = document.createElement('button');
        btn.className = `action-btn ${isDelete ? 'delete ml-auto' : ''}`;
        btn.title = title;
        btn.innerHTML = iconHtml;
        return btn;
    }

    // --- Actions ---

    async handleVerify(e, index, btn, locator) {
        e.stopPropagation();
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<div class="loader"></div>`;

        try {
            // Global api veya app.js'deki apiCall
            const result = window.api ? await window.api.verifyLocator(locator) : await window.apiCall('/api/verify', { method: 'POST', body: JSON.stringify({locator}) });

            const data = result.data || result;
            if (data.valid) {
                btn.innerHTML = `<span class="text-emerald-500 font-bold text-sm">✓</span>`;
                window.showToast("Verified", `Count: ${data.count}`, 'success');
            } else {
                btn.innerHTML = `<span class="text-red-500 font-bold text-sm">✕</span>`;
                window.showToast("Failed", `Found: ${data.count}`, 'error');
            }
        } catch (err) {
            btn.innerHTML = `<span class="text-yellow-500 font-bold text-sm">!</span>`;
            console.error(err);
            window.showToast("Error", "Verify failed", 'error');
        }

        setTimeout(() => btn.innerHTML = originalHtml, 2000);
    }

    handleCopy(e, el) {
        e.stopPropagation();
        const parts = el.locator.split('=', 1);
        const txt = `\${${el.variable.replace(/[${}]/g, '')}} = \t${parts[0]}=${el.locator.substring(parts[0].length + 1)}`;

        navigator.clipboard.writeText(txt).then(() => window.showToast("Copied", "Line copied", 'success'));
    }

    handleHighlight(index) {
        const oldActive = this.container.querySelector('.list-item.active');
        if (oldActive) {
            oldActive.classList.remove('active', 'flash');
        }

        if (index === -1) return;

        const newActive = document.getElementById(`list-item-${index}`);
        if (newActive) {
            newActive.classList.add('active');

            // Eğer liste görünümü aktifse scroll et
            const isListView = document.getElementById('view-list').classList.contains('active');
            if (isListView) {
                newActive.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash animasyonu
                newActive.classList.remove('flash');
                void newActive.offsetWidth; // Trigger reflow
                newActive.classList.add('flash');
            }
        }
    }
}

// Global'e ekle
window.ElementListManager = ElementListManager;