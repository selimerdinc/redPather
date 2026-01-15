/**
 * Context Menu Component
 * Provides right-click actions for elements (Verify, Send Keys, etc.)
 */
class ContextMenu {
    constructor() {
        this.activeElement = null;
        this.menu = null;
        this.init();
    }

    init() {
        // Menü DOM'unu oluştur
        this.menu = document.createElement('div');
        this.menu.className = 'fixed z-[100] bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl py-1 w-48 hidden flex-col';
        document.body.appendChild(this.menu);

        // Dışarı tıklayınca kapat
        document.addEventListener('click', () => this.hide());
    }

    show(x, y, elementData) {
        this.activeElement = elementData;
        const targetElement = elementData; // ✅ KOPYALADIK: Elementi burada hafızaya alıyoruz.

        this.menu.innerHTML = ''; // Temizle

        const actions = [
            {
                label: '✍️ Metin Gönder',
                action: () => window.app.handleSendKeys(targetElement)
            },
            {
                label: '👁️ Görünürlüğü Doğrula',
                action: () => window.app.handleAssertion('visibility', targetElement)
            },
            {
                label: 'abc Metni Doğrula',
                action: () => window.app.handleAssertion('text', targetElement)
            },
            { type: 'separator' },
            {
                label: '📋 Lokasyonu Kopyala',
                action: () => {
                    if (targetElement && targetElement.locator) {
                        navigator.clipboard.writeText(targetElement.locator);
                        window.app.ui.showToast('Kopyalandı', 'Lokasyon panoya kopyalandı');
                    }
                }
            },
            {
                label: '🔗 Jira Kaydı Oluştur',
                action: () => window.createJiraIssue(targetElement)
            }
        ];

        actions.forEach(item => {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.className = 'h-px bg-[#27272a] my-1';
                this.menu.appendChild(sep);
            } else {
                const btn = document.createElement('button');
                btn.className = 'text-left px-4 py-2 text-xs text-gray-300 hover:bg-[#27272a] hover:text-white w-full transition-colors flex items-center gap-2';
                btn.innerText = item.label;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.hide(); // Menü kapanıyor
                    item.action(); // Ama artık targetElement'i bildiği için hata vermeyecek
                };
                this.menu.appendChild(btn);
            }
        });

        // Pozisyonu ayarla (Ekran dışına taşmayı önle)
        let top = y;
        let left = x;

        if (top + this.menu.offsetHeight > window.innerHeight) {
            top = top - this.menu.offsetHeight;
        }

        this.menu.style.top = `${top}px`;
        this.menu.style.left = `${left}px`;
        this.menu.classList.remove('hidden');
        this.menu.classList.add('flex');
    }

    hide() {
        this.menu.classList.add('hidden');
        this.menu.classList.remove('flex');
        this.activeElement = null; // Burası artık sorun yaratmayacak
    }
}

window.ContextMenu = ContextMenu;