/**
 * Premium Tooltip Component
 * 2 saniye hover sonrası açıklama gösteren tooltip sistemi
 */
class TooltipManager {
    constructor() {
        this.tooltip = null;
        this.currentTarget = null;
        this.showTimeout = null;
        this.hideTimeout = null;
        this.DELAY_MS = 1500; // 1.5 saniye bekle
        this.init();
    }

    init() {
        this.createTooltipElement();

        // Event delegation
        document.addEventListener('mouseenter', (e) => {
            const btn = e.target.closest('.tooltip-btn');
            if (btn && btn.dataset.tooltip) {
                this.scheduleShow(btn);
            }
        }, true);

        document.addEventListener('mouseleave', (e) => {
            const btn = e.target.closest('.tooltip-btn');
            if (btn) {
                this.cancelAndHide();
            }
        }, true);

        // Tıklayınca tooltip'i iptal et
        document.addEventListener('mousedown', () => {
            this.cancelAndHide();
        }, true);
    }

    createTooltipElement() {
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'premium-tooltip';
        this.tooltip.innerHTML = `
            <div class="tooltip-arrow"></div>
            <div class="tooltip-content"></div>
        `;
        document.body.appendChild(this.tooltip);

        const style = document.createElement('style');
        style.textContent = `
            #premium-tooltip {
                position: fixed;
                z-index: 999999;
                pointer-events: none;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                transform: translateY(-8px);
            }
            
            #premium-tooltip.visible {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            #premium-tooltip .tooltip-content {
                background: #0d0d0f;
                color: #ffffff;
                padding: 14px 18px;
                border-radius: 14px;
                font-size: 12px;
                font-weight: 500;
                line-height: 1.7;
                max-width: 300px;
                min-width: 160px;
                text-align: left;
                border: 1px solid rgba(255, 255, 255, 0.12);
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.8),
                    0 8px 24px rgba(0, 0, 0, 0.6),
                    0 0 0 1px rgba(0, 0, 0, 0.5);
                white-space: pre-line;
            }
            
            #premium-tooltip .tooltip-arrow {
                position: absolute;
                top: -8px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 10px solid transparent;
                border-right: 10px solid transparent;
                border-bottom: 10px solid #0d0d0f;
                filter: drop-shadow(0 -2px 4px rgba(0,0,0,0.3));
            }
            
            /* Tooltip başlığı için emoji vurgusu */
            #premium-tooltip .tooltip-content::first-line {
                font-weight: 700;
                font-size: 13px;
            }
        `;
        document.head.appendChild(style);
    }

    scheduleShow(target) {
        // Önceki timeout'u iptal et
        clearTimeout(this.showTimeout);
        clearTimeout(this.hideTimeout);

        this.currentTarget = target;

        // 2 saniye sonra göster
        this.showTimeout = setTimeout(() => {
            this.show(target);
        }, this.DELAY_MS);
    }

    show(target) {
        const text = target.dataset.tooltip;
        if (!text || this.currentTarget !== target) return;

        const content = this.tooltip.querySelector('.tooltip-content');
        content.textContent = text;

        // Önce tooltip'i görünmez şekilde render et (boyut hesabı için)
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.display = 'block';

        const rect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();

        // Tooltip'i butonun altına konumlandır
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.bottom + 12;

        // Ekran sınırlarını kontrol et
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.visibility = '';
        this.tooltip.style.display = '';

        // Arrow pozisyonu
        const arrow = this.tooltip.querySelector('.tooltip-arrow');
        const arrowLeft = Math.max(20, Math.min(rect.left + (rect.width / 2) - left, tooltipRect.width - 20));
        arrow.style.left = `${arrowLeft}px`;

        this.tooltip.classList.add('visible');
    }

    cancelAndHide() {
        clearTimeout(this.showTimeout);
        clearTimeout(this.hideTimeout);

        this.hideTimeout = setTimeout(() => {
            this.tooltip.classList.remove('visible');
            this.currentTarget = null;
        }, 50);
    }
}

// Sayfa yüklendiğinde başlat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.tooltipManager = new TooltipManager();
    });
} else {
    window.tooltipManager = new TooltipManager();
}
