let allElementsData = [];
let currentHoverIndex = -1;
let currentPlatform = "ANDROID";
let navModeActive = false;
let pendingEditCallback = null;
let pendingCancelCallback = null;
let currentDeviceW = 0;
let currentDeviceH = 0;
let rawSource = ""; // XML Source

// Constants
const TOAST_DURATION = 3500;
const API_TIMEOUT = 30000; // 30 seconds

window.addEventListener('DOMContentLoaded', () => {
    window.loadConfig();
    initializeEventListeners();
    setupImageResizeObserver();
    logAppStart();
});

function logAppStart() {
    console.log("%c🚀 QA Red Pather Started", "color: #ef4444; font-size: 16px; font-weight: bold;");
    console.log("Version: 1.1.0");
    console.log("Build: Enhanced & Optimized");
}

function initializeEventListeners() {
    // Modal keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('confirmModal');
        if (modal.classList.contains('open')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (pendingEditCallback) pendingEditCallback();
                window.hideConfirmModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (pendingCancelCallback) pendingCancelCallback();
                window.hideConfirmModal();
            }
        }
    });

    // Modal buttons
    document.getElementById('modalConfirmBtn').addEventListener('click', () => {
        if (pendingEditCallback) pendingEditCallback();
        window.hideConfirmModal();
    });

    document.getElementById('modalCancelBtn').addEventListener('click', () => {
        if (pendingCancelCallback) pendingCancelCallback();
        window.hideConfirmModal();
    });

    // Element list scroll sync
    document.getElementById('elements-list').addEventListener('scroll', () => {
        if (currentHoverIndex !== -1) {
            const listItem = document.getElementById(`list-item-${currentHoverIndex}`);
            const box = document.getElementById(`box-${currentHoverIndex}`);
            if (listItem && box) window.drawConnector(listItem, box);
        }
    });
}

function setupImageResizeObserver() {
    const imgEl = document.getElementById('screenshot');
    if (imgEl) {
        const resizeObserver = new ResizeObserver(() => {
            if (currentHoverIndex !== -1) {
                const box = document.getElementById(`box-${currentHoverIndex}`);
                const img = document.getElementById('screenshot');
                if (currentDeviceW > 0 && box) {
                    const scaleX = img.width / currentDeviceW;
                    const scaleY = img.height / currentDeviceH;
                    window.updateBoxPosition(box, scaleX, scaleY);
                    const listItem = document.getElementById(`list-item-${currentHoverIndex}`);
                    if (listItem) window.drawConnector(listItem, box);
                }
            }
        });
        resizeObserver.observe(imgEl);
    }
}

// --- API HELPER FUNCTIONS ---

async function apiCall(url, options = {}) {
    /**
     * Unified API call handler with timeout and error handling
     */
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        clearTimeout(timeoutId);

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response');
        }

        const data = await response.json();

        // Handle error responses
        if (!response.ok) {
            const errorMsg = data.message || `HTTP ${response.status}`;
            const errorDetails = data.details || '';
            throw new Error(`${errorMsg}${errorDetails ? ': ' + errorDetails : ''}`);
        }

        return data;

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error('Request timeout - operation took too long');
        }

        if (error instanceof TypeError) {
            throw new Error('Network error - check if server is running');
        }

        throw error;
    }
}

function handleApiError(error, context) {
    /**
     * Handle API errors with user-friendly messages
     */
    console.error(`${context} error:`, error);

    let title = "Error";
    let message = error.message || "Unknown error occurred";

    // Categorize errors
    if (message.includes('timeout')) {
        title = "Timeout";
        message = "Operation took too long. Try again.";
    } else if (message.includes('Network')) {
        title = "Connection Error";
        message = "Cannot reach server. Is Appium running?";
    } else if (message.includes('Invalid')) {
        title = "Invalid Input";
    } else if (message.includes('driver')) {
        title = "Driver Error";
        message = "Device connection lost. Check your setup.";
    }

    window.showToast(title, message, 'error');
}

// --- CONFIG API ---

window.loadConfig = async function() {
    try {
        const data = await apiCall('/config');

        if (document.getElementById('conf_android_pkg')) {
            document.getElementById('conf_android_pkg').value = data.ANDROID_PKG || '';
            document.getElementById('conf_android_act').value = data.ANDROID_ACT || '';
            document.getElementById('conf_android_device').value = data.ANDROID_DEVICE || 'emulator-5554';
            document.getElementById('conf_ios_bundle').value = data.IOS_BUNDLE || '';
            document.getElementById('conf_ios_device').value = data.IOS_DEVICE || 'iPhone 14';
            document.getElementById('conf_ios_udid').value = data.IOS_UDID || '';
            document.getElementById('conf_ios_org').value = data.IOS_ORG_ID || '';
            document.getElementById('conf_ios_sign').value = data.IOS_SIGN_ID || 'iPhone Developer';
        }
    } catch (error) {
        handleApiError(error, 'Config load');
    }
}

window.saveConfig = async function() {
    const config = {
        ANDROID_PKG: document.getElementById('conf_android_pkg').value,
        ANDROID_ACT: document.getElementById('conf_android_act').value,
        ANDROID_DEVICE: document.getElementById('conf_android_device').value,
        IOS_BUNDLE: document.getElementById('conf_ios_bundle').value,
        IOS_DEVICE: document.getElementById('conf_ios_device').value,
        IOS_UDID: document.getElementById('conf_ios_udid').value,
        IOS_ORG_ID: document.getElementById('conf_ios_org').value,
        IOS_SIGN_ID: document.getElementById('conf_ios_sign').value,
    };

    try {
        await apiCall('/config', {
            method: 'POST',
            body: JSON.stringify(config)
        });

        document.getElementById('configModal').classList.remove('open');
        window.showToast("Saved", "Configuration updated successfully", 'success');
    } catch (error) {
        handleApiError(error, 'Config save');
    }
}

window.openConfig = function() {
    document.getElementById('configModal').classList.add('open');
}

// --- UI INTERACTIONS ---

window.toggleNavMode = function(checkbox) {
    navModeActive = checkbox.checked;
    const ui = document.getElementById('nav-switch-ui');

    if (navModeActive) {
        ui.classList.add('active');
        document.body.classList.add('nav-mode');
        window.showToast("Navigation Mode", "Click elements to tap & rescan", "info");
        window.clearSelection();
    } else {
        ui.classList.remove('active');
        document.body.classList.remove('nav-mode');
    }
}

window.toggleVerifyUI = function(checkbox) {
    const ui = document.getElementById('verify-switch-ui');
    if (checkbox.checked) {
        ui.classList.add('active');
    } else {
        ui.classList.remove('active');
    }
}

window.togglePlatform = function() {
    const slider = document.getElementById('toggle-slider');
    const optAndroid = document.getElementById('opt-android');
    const optIos = document.getElementById('opt-ios');

    if (currentPlatform === "ANDROID") {
        currentPlatform = "IOS";
        slider.style.transform = "translateX(100%)";
        optAndroid.classList.remove('active');
        optIos.classList.add('active');
    } else {
        currentPlatform = "ANDROID";
        slider.style.transform = "translateX(0)";
        optIos.classList.remove('active');
        optAndroid.classList.add('active');
    }
}

window.clearSelection = function() {
    document.querySelectorAll('.list-item.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.target-box.active').forEach(el => el.classList.remove('active'));

    // Clear connector lines
    const svgPath = document.getElementById('connector-path');
    const dotList = document.getElementById('connector-dot-list');
    const dotImg = document.getElementById('connector-dot-img');

    svgPath.style.display = 'none';
    dotList.style.display = 'none';
    dotImg.style.display = 'none';
    currentHoverIndex = -1;
}

window.showToast = function(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    toast.className = `pro-toast ${type}`;
    toast.innerHTML = `
        <div style="font-size: 20px; font-weight: bold;">${icons[type] || '•'}</div>
        <div>
            <h4 class="text-sm font-bold text-white">${title}</h4>
            <p class="text-xs text-gray-400 font-mono">${message}</p>
        </div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, TOAST_DURATION);
}

// --- API ACTIONS ---

window.scanScreen = async function() {
    const btn = document.getElementById('scanBtn');
    const loading = document.getElementById('loading');
    const verify = document.getElementById('autoVerify').checked;
    const prefix = document.getElementById('pagePrefix').value || "page";

    // Disable UI
    btn.disabled = true;
    document.getElementById('loading-text').innerText = "ANALYZING...";
    loading.classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('device-wrapper').classList.add('hidden');

    // Clear previous data
    document.getElementById('overlays').innerHTML = '';
    document.getElementById('elements-list').innerHTML = '';
    window.clearSelection();
    allElementsData = [];

    try {
        const data = await apiCall('/scan', {
            method: 'POST',
            body: JSON.stringify({
                platform: currentPlatform,
                verify: verify,
                prefix: prefix
            })
        });

        if (data.status === 'success') {
            window.renderResult(data);
        } else {
            throw new Error(data.message || 'Scan failed');
        }

    } catch (error) {
        handleApiError(error, 'Scan');
        window.resetUI(true);
    }
}

window.performScroll = async function(direction) {
    document.getElementById('loading-text').innerText = "SCROLLING...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        await apiCall('/scroll', {
            method: 'POST',
            body: JSON.stringify({
                direction: direction,
                platform: currentPlatform
            })
        });

        // Rescan after scroll
        window.scanScreen();

    } catch (error) {
        handleApiError(error, 'Scroll');
        window.resetUI(false);
    }
}

window.performTap = async function(x, y, imgW, imgH) {
    document.getElementById('loading-text').innerText = "TAPPING & RESCANNING...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        await apiCall('/tap', {
            method: 'POST',
            body: JSON.stringify({
                x: x,
                y: y,
                img_w: imgW,
                img_h: imgH,
                platform: currentPlatform
            })
        });

        // Rescan after tap
        window.scanScreen();

    } catch (error) {
        handleApiError(error, 'Tap');
        window.resetUI(false);
    }
}

window.triggerBack = async function() {
    document.getElementById('loading-text').innerText = "GOING BACK...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        await apiCall('/action/back', { method: 'POST' });
        window.scanScreen();

    } catch (error) {
        handleApiError(error, 'Back');
        window.resetUI(false);
    }
}

window.triggerHideKeyboard = async function() {
    document.getElementById('loading-text').innerText = "HIDING KEYBOARD...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        await apiCall('/action/hide_keyboard', { method: 'POST' });
        window.scanScreen();

    } catch (error) {
        handleApiError(error, 'Hide Keyboard');
        window.resetUI(false);
    }
}

window.resetUI = function(showEmpty = false) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('scanBtn').disabled = false;

    if (showEmpty) {
        document.getElementById('empty-state').classList.remove('hidden');
    }
}

// --- RENDER LOGIC ---

window.renderResult = function(data) {
    const img = document.getElementById('screenshot');
    img.src = "data:image/png;base64," + data.image;

    rawSource = data.raw_source || "";

    if (data.window_w && data.window_h) {
        currentDeviceW = data.window_w;
        currentDeviceH = data.window_h;
    }

    img.onload = () => {
        window.resetUI(false);
        document.getElementById('device-wrapper').classList.remove('hidden');
        document.getElementById('copyAllBtn').classList.remove('hidden', 'opacity-0', 'scale-95');

        // Update page name
        if (data.page_name) {
            const pageInput = document.getElementById('pagePrefix');
            pageInput.style.color = '#ef4444';
            pageInput.value = data.page_name;
            setTimeout(() => { pageInput.style.color = 'white'; }, 500);
        }

        // Update element count
        document.getElementById('element-count').innerText = `${data.elements.length}`;

        // Create elements
        data.elements.forEach((el, index) => {
            allElementsData.push({ ...el, index, isDeleted: false });
            window.createBox(el, index);
            window.createListItem(el, index);
        });

        window.showToast("Success", `Found ${data.elements.length} elements`, 'success');
    };
}

window.createBox = function(el, index) {
    const box = document.createElement('div');
    box.id = `box-${index}`;
    box.className = 'target-box';

    box.onclick = (e) => {
        e.stopPropagation();

        if (navModeActive || e.shiftKey) {
            const centerX = el.coords.x + (el.coords.w / 2);
            const centerY = el.coords.y + (el.coords.h / 2);
            const img = document.getElementById('screenshot');
            window.performTap(centerX, centerY, img.naturalWidth, img.naturalHeight);
        } else {
            window.reverseLookup(e, index);
        }
    };

    box.dataset.x = el.coords.x;
    box.dataset.y = el.coords.y;
    box.dataset.w = el.coords.w;
    box.dataset.h = el.coords.h;

    const img = document.getElementById('screenshot');
    if (img.complete && currentDeviceW > 0) {
        const scaleX = img.width / currentDeviceW;
        const scaleY = img.height / currentDeviceH;
        window.updateBoxPosition(box, scaleX, scaleY);
    }

    const label = document.createElement('div');
    label.className = "box-label absolute -top-5 left-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-lg z-50 pointer-events-none";
    label.innerText = index + 1;

    box.appendChild(label);
    document.getElementById('overlays').appendChild(box);
}

window.updateBoxPosition = function(box, scaleX, scaleY) {
    if (!box) return;

    const x = parseFloat(box.dataset.x) * scaleX;
    const y = parseFloat(box.dataset.y) * scaleY;
    const w = parseFloat(box.dataset.w) * scaleX;
    const h = parseFloat(box.dataset.h) * scaleY;

    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
}

window.reverseLookup = function(e, index) {
    window.highlightElement(index, true);
}

// --- CORE UI FUNCTIONS (GLOBAL) ---

window.highlightElement = function(index, doScroll = false) {
    if (currentHoverIndex === index) return;

    window.clearSelection();
    currentHoverIndex = index;

    const box = document.getElementById(`box-${index}`);
    const listItem = document.getElementById(`list-item-${index}`);
    const img = document.getElementById('screenshot');

    if (box && img && currentDeviceW > 0) {
        const scaleX = img.width / currentDeviceW;
        const scaleY = img.height / currentDeviceH;
        window.updateBoxPosition(box, scaleX, scaleY);
        box.classList.add('active');
    }

    if (listItem) {
        listItem.classList.add('active');

        if (doScroll) {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            listItem.classList.remove('flash');
            void listItem.offsetWidth;
            listItem.classList.add('flash');
        }

        if (box) window.drawConnector(listItem, box);
    }
}

window.drawConnector = function(listEl, boxEl) {
    const svgPath = document.getElementById('connector-path');
    const dotList = document.getElementById('connector-dot-list');
    const dotImg = document.getElementById('connector-dot-img');
    const listContainer = document.getElementById('elements-list');

    const listRect = listEl.getBoundingClientRect();
    const containerRect = listContainer.getBoundingClientRect();

    // Hide if element is scrolled out of view
    if (listRect.top < containerRect.top || listRect.bottom > containerRect.bottom) {
        svgPath.style.display = 'none';
        dotList.style.display = 'none';
        dotImg.style.display = 'none';
        return;
    }

    const boxRect = boxEl.getBoundingClientRect();

    const x1 = listRect.left;
    const y1 = listRect.top + (listRect.height / 2);
    const x2 = boxRect.right;
    const y2 = boxRect.top + (boxRect.height / 2);

    const d = `M ${x1} ${y1} C ${x1 - 60} ${y1}, ${x2 + 60} ${y2}, ${x2} ${y2}`;

    svgPath.setAttribute('d', d);
    svgPath.style.display = 'block';

    dotList.setAttribute('cx', x1);
    dotList.setAttribute('cy', y1);
    dotList.style.display = 'block';

    dotImg.setAttribute('cx', x2);
    dotImg.setAttribute('cy', y2);
    dotImg.style.display = 'block';
}

window.showConfirmModal = function(newValue, onConfirm, onCancel) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalNewValue').innerText = newValue;
    modal.classList.add('open');
    pendingEditCallback = onConfirm;
    pendingCancelCallback = onCancel;
}

window.hideConfirmModal = function() {
    document.getElementById('confirmModal').classList.remove('open');
    pendingEditCallback = null;
    pendingCancelCallback = null;
}

window.startEdit = function(element, index, field) {
    const itemData = allElementsData.find(el => el.index === index);
    if (!itemData) return;

    const currentValue = itemData[field];
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'edit-input';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    element.removeAttribute('onclick');

    const finish = (save) => {
        if (save) {
            itemData[field] = input.value;
            element.innerText = input.value;
            window.showToast("Updated", `${field} updated successfully`, 'success');
        } else {
            element.innerText = currentValue;
        }
        element.ondblclick = (e) => window.startEdit(element, index, field);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (input.value !== currentValue) {
                input.blur();
                window.showConfirmModal(
                    input.value,
                    () => finish(true),
                    () => { finish(false); input.focus(); }
                );
            } else {
                finish(false);
            }
        }
        if (e.key === 'Escape') finish(false);
        e.stopPropagation();
    });

    input.addEventListener('click', (e) => e.stopPropagation());
}

window.createListItem = function(el, index) {
    const container = document.getElementById('elements-list');
    const item = document.createElement('div');
    item.className = 'list-item p-4 rounded-lg mb-2 cursor-pointer group relative flex flex-col gap-2 border border-[#27272a]';
    item.id = `list-item-${index}`;

    let badgeClass = "bg-gray-800 text-gray-400 border border-gray-700";

    if (el.strategy.includes('ID')) {
        badgeClass = "bg-blue-900/30 text-blue-400 border border-blue-800";
    } else if (el.strategy.includes('ACC_ID')) {
        badgeClass = "bg-emerald-900/30 text-emerald-400 border border-emerald-800";
    } else if (el.strategy.includes('ANCHOR')) {
        badgeClass = "bg-pink-900/30 text-pink-400 border border-pink-800";
    } else if (el.strategy.includes('TEXT')) {
        badgeClass = "bg-purple-900/30 text-purple-400 border border-purple-800";
    }

    const safeVar = el.variable.replace(/'/g, "\\'");
    const safeText = el.text ? el.text.replace(/'/g, "\\'") : "";

    item.innerHTML = `
        <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono font-bold text-gray-500">#${String(index + 1).padStart(2, '0')}</span>
                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}">${el.strategy}</span>
            </div>
            ${el.text ? `<span class="text-[10px] text-gray-500 truncate max-w-[120px]" title="${safeText}">${safeText}</span>` : ''}
        </div>
        <div class="w-full">
            <code class="block text-[13px] text-red-400 font-bold break-all hover:text-red-300 transition-colors cursor-text mb-1 border border-transparent hover:border-red-900/30 rounded px-1 -mx-1" title="Double Click to Edit" ondblclick="window.startEdit(this, ${index}, 'variable')">${el.variable}</code>
            <code class="block text-[10px] text-gray-600 bg-[#09090b] px-2 py-1.5 rounded border border-[#27272a] break-all font-mono hover:text-gray-400 hover:border-gray-500 transition-colors cursor-text" title="Double Click to Edit" ondblclick="window.startEdit(this, ${index}, 'locator')">${el.locator}</code>
        </div>
        <div class="flex items-center gap-2 w-full mt-1">
            <button onclick="window.verifyLocatorByIndex(event, ${index}, this)" class="action-btn" title="Verify Locator">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
            </button>
            <button onclick="window.copyDataByIndex(event, ${index}, 'Line')" class="action-btn" title="Copy Line">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </button>
            <button onclick="window.removeElement(event, ${index})" class="action-btn delete ml-auto" title="Remove from list">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>`;

    item.addEventListener('mouseenter', () => window.highlightElement(index, false));
    item.addEventListener('mouseleave', () => window.clearSelection());

    container.appendChild(item);
}

window.removeElement = function(e, index) {
    e.stopPropagation();
    window.clearSelection();

    const listItem = document.getElementById(`list-item-${index}`);
    const box = document.getElementById(`box-${index}`);

    if (listItem) {
        listItem.classList.add('removing');
        setTimeout(() => listItem.remove(), 200);
    }

    if (box) box.remove();

    const itemData = allElementsData.find(el => el.index === index);
    if (itemData) itemData.isDeleted = true;

    const activeCount = allElementsData.filter(el => !el.isDeleted).length;
    document.getElementById('element-count').innerText = activeCount;
}

window.verifyLocatorByIndex = async function(e, index, btn) {
    e.stopPropagation();

    const item = allElementsData.find(el => el.index === index);
    if (!item) return;

    const locator = item.locator;
    const originalIcon = btn.innerHTML;
    btn.innerHTML = `<div class="loader"></div>`;

    try {
        const data = await apiCall('/verify', {
            method: 'POST',
            body: JSON.stringify({ locator: locator })
        });

        if (data.valid) {
            btn.innerHTML = `<span class="text-emerald-500 font-bold text-sm">✓</span>`;
            window.showToast("Verified", `Element found (count: ${data.count})`, 'success');
        } else {
            btn.innerHTML = `<span class="text-red-500 font-bold text-sm">✕</span>`;
            window.showToast("Failed", `Found ${data.count} elements (expected 1)`, 'error');
        }
    } catch (error) {
        btn.innerHTML = `<span class="text-yellow-500 font-bold text-sm">!</span>`;
        handleApiError(error, 'Verify');
    }

    setTimeout(() => btn.innerHTML = originalIcon, 2000);
}

window.copyDataByIndex = function(e, index, mode = 'Line') {
    e.stopPropagation();

    const item = allElementsData.find(el => el.index === index);
    if (!item) return;

    let copyText = "";
    let copyTarget = "";

    // Kopyalanacak formatı belirle
    if (mode === 'Line') {
        // Değişken tanımını kopyala (Örn: ${selector_page_element} = locatorValue)
        const locatorValue = item.locator.split('=')[1] || item.locator;
        const locatorStrategy = item.locator.split('=')[0];
        copyText = `\${${item.variable.replace('$', '').replace('{', '').replace('}', '').trim()}} = ${locatorStrategy}=${locatorValue}`;
        copyTarget = "Locator Line";
    } else if (mode === 'Variable') {
        // Sadece değişken adını kopyala (Örn: ${selector_page_element})
        copyText = item.variable;
        copyTarget = "Variable Name";
    } else if (mode === 'Locator') {
        // Sadece locator dizesini kopyala (Örn: xpath=//xpath_value)
        copyText = item.locator;
        copyTarget = "Locator Value";
    }

    // Panoya kopyalama işlemini gerçekleştir
    navigator.clipboard.writeText(copyText).then(() => {
        window.showToast("Copied!", `${copyTarget} copied to clipboard`, 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        window.showToast("Copy Failed", "Please check browser permissions", 'error');
    });
}