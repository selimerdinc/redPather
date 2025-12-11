/**
 * Overlay Manager Component
 * Handles rendering and positioning of target boxes over the screenshot.
 */
class OverlayManager {
    constructor(containerId, imageId) {
        this.container = document.getElementById(containerId);
        this.image = document.getElementById(imageId);
        this.deviceW = 0;
        this.deviceH = 0;

        // Resize Observer: Resim boyutu değişince kutuları güncelle
        if (this.image) {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateAllPositions();
            });
            this.resizeObserver.observe(this.image);
        }

        // State değişikliklerini dinle (Highlight için)
        if (window.appState) {
            window.appState.subscribe('ui.currentHoverIndex', (idx) => this.handleHighlight(idx));
        }
    }

    setDeviceSize(w, h) {
        this.deviceW = w;
        this.deviceH = h;
    }

    render(elements) {
        if (!this.container) return;
        this.container.innerHTML = ''; // Temizle

        elements.forEach((el, index) => {
            if (!el.isDeleted) {
                this.createBox(el, index);
            }
        });

        // İlk render sonrası pozisyonları hemen güncelle
        // (Resim yüklendiyse hemen, yüklenmediyse onload bekler ama biz yine de tetikleyelim)
        this.updateAllPositions();
    }

    createBox(el, index) {
        const box = document.createElement('div');
        box.id = `box-${index}`;
        box.className = 'target-box';

        // Koordinat verilerini sakla
        box.dataset.x = el.coords.x;
        box.dataset.y = el.coords.y;
        box.dataset.w = el.coords.w;
        box.dataset.h = el.coords.h;

        // Etiket (Sol üstteki küçük numara)
        const label = document.createElement('div');
        label.className = "box-label absolute -top-5 left-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-lg z-50 pointer-events-none";
        label.innerText = index + 1;
        box.appendChild(label);

        // Tıklama Olayı
        box.onclick = (e) => {
            e.stopPropagation();
            // Global değişkenlere erişim (app.js'den gelenler)
            const isNavMode = document.body.classList.contains('nav-mode'); // CSS class kontrolü daha güvenli

            if (isNavMode || e.shiftKey) {
                // Tıklama modu
                if (window.performTap && this.image) {
                    const cx = el.coords.x + el.coords.w / 2;
                    const cy = el.coords.y + el.coords.h / 2;
                    window.performTap(cx, cy, this.image.naturalWidth, this.image.naturalHeight);
                }
            } else {
                // Seçim modu
                if (window.highlightElement) {
                    window.highlightElement(index, true);
                }
            }
        };

        this.container.appendChild(box);
    }

    updateAllPositions() {
        if (!this.image || this.deviceW === 0) return;

        const boxes = this.container.querySelectorAll('.target-box');
        const sx = this.image.width / this.deviceW;
        const sy = this.image.height / this.deviceH;

        boxes.forEach(box => {
            box.style.left = (parseFloat(box.dataset.x) * sx) + 'px';
            box.style.top = (parseFloat(box.dataset.y) * sy) + 'px';
            box.style.width = (parseFloat(box.dataset.w) * sx) + 'px';
            box.style.height = (parseFloat(box.dataset.h) * sy) + 'px';
        });
    }

    handleHighlight(index) {
        // Eskiyi temizle
        const oldActive = this.container.querySelector('.target-box.active');
        if (oldActive) oldActive.classList.remove('active');

        if (index === -1) return;

        // Yeniyi seç
        const newActive = document.getElementById(`box-${index}`);
        if (newActive) {
            newActive.classList.add('active');
            // Pozisyonu garantiye al
            this.updateAllPositions();
        }
    }
}

// Global'e ekle
window.OverlayManager = OverlayManager;