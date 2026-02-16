/**
 * Element List Manager
 * Handles the left sidebar list items, editing, and actions.
 */
class ElementListManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (window.appState) {
            window.appState.subscribe('ui.currentHoverIndex', (idx) => this.handleHighlight(idx));
        }
    }

    // XSS koruması: HTML özel karakterlerini escape et
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    render(elements) {
        if (!this.container) return;
        this.container.innerHTML = '';
        elements.forEach((el) => {
            if (!el.isDeleted) {
                const item = this.createListItem(el);
                this.container.appendChild(item);
            }
        });
    }

    createListItem(el) {
        const index = el.index;
        const item = document.createElement('div');
        item.id = `list-item-${index}`;

        // Strategy badge colors
        let badgeColor = "bg-zinc-800/50 text-zinc-400 border-zinc-700/50";

        if (el.strategy.includes('ID')) badgeColor = "bg-violet-500/10 text-violet-400 border-violet-500/20";
        else if (el.strategy.includes('ACC_ID')) badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        else if (el.strategy.includes('ANCHOR')) badgeColor = "bg-pink-500/10 text-pink-400 border-pink-500/20";
        else if (el.strategy.includes('TEXT')) badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
        else if (el.strategy.includes('XPATH') || el.locator?.startsWith('xpath=')) badgeColor = "bg-red-500/10 text-red-400 border-red-500/20";

        // Health score indicator
        const healthScore = el.health_score ?? 50;
        const healthLabel = el.health_label ?? 'warning';
        let healthEmoji = '🟡';
        let healthColor = 'text-amber-400';
        let healthTip = 'Orta stabilite';

        if (healthLabel === 'good' || healthScore >= 70) {
            healthEmoji = '🟢';
            healthColor = 'text-emerald-400';
            healthTip = 'Stabil locator';
        } else if (healthLabel === 'fragile' || healthScore < 50) {
            healthEmoji = '🔴';
            healthColor = 'text-red-400';
            healthTip = '⚠️ Kırılgan! Değiştirmeyi düşünün';
        }

        // Premium kart stilleri - TÜM KARTLAR için kırmızı çerçeve + hover efekti
        item.className = `list-item group relative flex flex-col gap-2 p-3 mb-2 rounded-xl 
            border border-red-500/30 bg-zinc-900/60 
            hover:border-red-400/60 hover:bg-zinc-800/80 
            hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:scale-[1.01]
            focus-within:ring-2 focus-within:ring-red-500/40
            transition-all duration-300 cursor-pointer active:scale-[0.98] overflow-hidden`;

        // XSS-safe değerler
        const safeVariable = this._escapeHtml(el.variable);
        const safeLocator = this._escapeHtml(el.locator);
        const escapedLocator = el.locator.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        item.innerHTML = `
            <!-- Premium Red Accent Bar -->
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500/20 via-red-500/50 to-red-500/20 group-hover:via-red-400 group-hover:shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all duration-500"></div>

            <div class="flex items-start gap-3">
                <div class="shrink-0 mt-0.5">
                    <div class="w-9 h-9 rounded-lg glass flex items-center justify-center text-zinc-400 group-hover:text-white transition-all duration-300 relative">
                        <span class="text-[10px] font-mono font-extrabold tracking-tighter">#${String(index + 1).padStart(2, '0')}</span>
                        <span class="absolute -top-1 -right-1 text-[10px]" title="${healthTip} (${healthScore})">${healthEmoji}</span>
                    </div>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1.5 gap-2">
                        <span class="text-[13px] font-semibold text-zinc-50 truncate tracking-tight group-hover:text-white transition-colors cursor-text" 
                              ondblclick="event.stopPropagation(); window.startEdit(this, ${index}, 'variable')">${safeVariable}</span>
                        <div class="flex items-center gap-1">
                            <span class="text-[8px] ${healthColor} font-bold" title="${healthTip}">${healthScore}</span>
                            <span class="text-[9px] px-2 py-0.5 rounded-md ${badgeColor} font-black border uppercase tracking-wider">${el.strategy}</span>
                        </div>
                    </div>
                    
                    <div class="relative group/loc">
                        <code class="block text-[11px] text-zinc-400 font-mono font-medium truncate bg-black/30 px-2.5 py-2 rounded-lg border border-white/10 hover:border-red-500/40 hover:text-zinc-200 transition-all cursor-text"
                              ondblclick="event.stopPropagation(); window.startEdit(this, ${index}, 'locator')">${safeLocator}</code>
                    </div>

                    <!-- Actions Panel - Refined -->
                    <div class="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                        <div class="flex items-center gap-2">
                            <button onclick="event.stopPropagation(); window._verifyElement(this, ${index}, '${escapedLocator}')" 
                                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-all border border-white/10 hover:border-emerald-500/30" 
                                    title="Doğrula">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            </button>
                            <button onclick="event.stopPropagation(); window._copyElement('${this._escapeHtml(el.variable.replace(/[${}]/g, ''))}', '${escapedLocator}')" 
                                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-violet-500/20 text-zinc-400 hover:text-violet-400 transition-all border border-white/10 hover:border-violet-500/30" 
                                    title="Kopyala">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                            </button>
                            ${(window.app && window.app.isAiEnabled) ? `
                            <button onclick="event.stopPropagation(); if(window.app && window.app.startAiXpathSuggest) window.app.startAiXpathSuggest(null, ${index})" 
                                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-400 transition-all border border-white/10 hover:border-amber-500/30" 
                                    title="AI XPath Önerisi">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </button>` : ''}
                        </div>
                        
                        <button onclick="event.stopPropagation(); window.removeElement(event, ${index})" 
                                class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-all border border-white/10 hover:border-red-500/30"
                                title="Sil">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (window.app && window.app.contextMenu) {
                window.app.contextMenu.show(e.clientX, e.clientY, el);
            }
        });

        item.addEventListener('mouseenter', () => { if (window.highlightElement) window.highlightElement(index, false); });
        item.addEventListener('mouseleave', () => { if (window.clearSelection) window.clearSelection(); });

        return item;
    }

    // Fix #3: Global helper fonksiyonlar — prototype çağrısı bozuktu
    static registerGlobalHelpers(instance) {
        window._verifyElement = (btn, index, locator) => {
            instance.handleVerify(new Event('click'), index, btn, locator);
        };
        window._copyElement = (variable, locator) => {
            const txt = `\${${variable}}\t${locator}`;
            navigator.clipboard.writeText(txt).then(() => {
                if (window.app && window.app.ui) window.app.ui.showToast("Kopyalandı", "Satır kopyalandı", 'success');
            });
        };
    }

    static staticHandleCopy(variable, locator) {
        const txt = `\${${variable}}\t${locator}`;
        navigator.clipboard.writeText(txt).then(() => {
            if (window.app && window.app.ui) window.app.ui.showToast("Kopyalandı", "Satır kopyalandı", 'success');
        });
    }

    async handleVerify(e, index, btn, locator) {
        e.stopPropagation();
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<div class="loader"></div>`;
        try {
            const result = window.api ? await window.api.verifyLocator(locator) : await window.apiCall('/api/verify', { method: 'POST', body: JSON.stringify({ locator }) });
            const data = result.data || result;
            if (data.valid) {
                btn.innerHTML = `<span class="text-emerald-500 font-bold text-sm">✓</span>`;
                window.app.ui.showToast("Doğrulandı", `Eşleşme: ${data.count}`, 'success');
            } else {
                btn.innerHTML = `<span class="text-red-500 font-bold text-sm">✕</span>`;
                window.app.ui.showToast("Başarısız", `Bulunan: ${data.count}`, 'error');
            }
        } catch (err) {
            btn.innerHTML = `<span class="text-yellow-500 font-bold text-sm">!</span>`;
            console.error(err);
            window.app.ui.showToast("Hata", "Doğrulama başarısız", 'error');
        }
        setTimeout(() => btn.innerHTML = originalHtml, 2000);
    }

    handleCopy(e, el) {
        e.stopPropagation();
        const txt = `\${${el.variable.replace(/[${}]/g, '')}}\t${el.locator}`;
        navigator.clipboard.writeText(txt).then(() => window.app.ui.showToast("Kopyalandı", "Satır kopyalandı", 'success'));
    }

    handleHighlight(index) {
        const oldActive = this.container.querySelector('.list-item.active');
        if (oldActive) oldActive.classList.remove('active', 'flash');
        if (index === -1) return;
        const newActive = document.getElementById(`list-item-${index}`);
        if (newActive) {
            newActive.classList.add('active');
        }
    }

    scrollToIndex(index) {
        window.debug?.log("Attempting to scroll to index:", index);
        const item = document.getElementById(`list-item-${index}`);
        if (item) {
            window.debug?.log("Element found, scrolling...", item);
            item.scrollIntoView({ behavior: 'auto', block: 'center' });
            item.classList.remove('flash');
            void item.offsetWidth;
            item.classList.add('flash');
        } else {
            console.warn("Element NOT found for scrolling:", `list-item-${index}`);
        }
    }
}

window.ElementListManager = ElementListManager;