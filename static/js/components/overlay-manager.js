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

        // State değişikliklerini dinle
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
        this.container.innerHTML = '';

        // ✅ FIX: Alanı büyük olanı önce çiz (altta kalsın), küçüğü sonra çiz (üstte kalsın)
        // Bu sıralama, büyük kapsayıcıların içindeki küçük butonların tıklanabilmesini sağlar.
        const sortedElements = [...elements].sort((a, b) => {
            const areaA = (a.coords.w || 0) * (a.coords.h || 0);
            const areaB = (b.coords.w || 0) * (b.coords.h || 0);
            return areaB - areaA; // Büyükten küçüğe
        });

        sortedElements.forEach((el) => {
            if (!el.isDeleted) {
                // Orijinal index'i koruyarak kutuyu oluşturuyoruz
                this.createBox(el, el.index);
            }
        });

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

        // ✅ FIX: Z-INDEX YÖNETİMİ
        // Alanı küçük olanın z-index'ini artırarak her zaman en üstte kalmasını sağlıyoruz.
        const area = el.coords.w * el.coords.h;
        box.style.zIndex = Math.max(20, 1000 - Math.floor(area / 1000));

        // Etiket (Sol üstteki numara)
        const label = document.createElement('div');
        label.className = "box-label absolute -top-5 left-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-lg z-50 pointer-events-none";
        label.innerText = index + 1;
        box.appendChild(label);

        // Tıklama Olayı
        box.onclick = (e) => {
            e.stopPropagation();
            const isNavMode = document.body.classList.contains('nav-mode');

            if (isNavMode || e.shiftKey) {
                if (window.performTap && this.image) {
                    const cx = el.coords.x + el.coords.w / 2;
                    const cy = el.coords.y + el.coords.h / 2;
                    window.performTap(cx, cy, this.image.naturalWidth, this.image.naturalHeight);
                }
            } else {
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
        const oldActive = this.container.querySelector('.target-box.active');
        if (oldActive) oldActive.classList.remove('active');

        if (index === -1) return;

        const newActive = document.getElementById(`box-${index}`);
        if (newActive) {
            newActive.classList.add('active');
            this.updateAllPositions();
        }
    }
}

window.OverlayManager = OverlayManager;