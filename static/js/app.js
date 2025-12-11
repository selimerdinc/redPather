// =====================================================
// QA RED PATHER - MAIN APP.JS (COMPLETE VERSION)
// Bu dosya tüm eksik fonksiyonları içerir
// =====================================================

let allElementsData = [];
// --- DEĞİŞİKLİK: Silinen elementlerin locator'larını tutacak küme ---
let deletedLocators = new Set();
// -------------------------------------------------------------------
let currentHoverIndex = -1;
let currentPlatform = "ANDROID";
let navModeActive = false;
let pendingEditCallback = null;
let pendingCancelCallback = null;
let currentDeviceW = 0;
let currentDeviceH = 0;
let rawSource = "";

// Constants
const TOAST_DURATION = 3500;
const API_TIMEOUT = 30000;
const BOUNDS_TOLERANCE = 15;

window.addEventListener('DOMContentLoaded', () => {
    // State'i kullan
    appState.subscribe('ui.currentHoverIndex', (newIdx, oldIdx) => {
        if (oldIdx !== -1) clearHighlight(oldIdx);
        if (newIdx !== -1) highlightElement(newIdx);
    });

    appState.subscribe('elements', (elements) => {
        renderElementList(elements);
    });
});

function logAppStart() {
    console.log("%c🚀 QA Red Pather Started", "color: #ef4444; font-size: 16px; font-weight: bold;");
    console.log("Version: 2.2.0");
    console.log("Build: All Fixes Applied");
}

function initializeEventListeners() {
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('confirmModal');
        if (modal.classList.contains('open')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (pendingEditCallback) pendingEditCallback();
                window.hideConfirmModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (pendingCancelCallback) pendingCancelCallback();
                window.hideConfirmModal();
            }
        }
    });

    document.getElementById('modalConfirmBtn').addEventListener('click', () => {
        if (pendingEditCallback) pendingEditCallback();
        window.hideConfirmModal();
    });

    document.getElementById('modalCancelBtn').addEventListener('click', () => {
        if (pendingCancelCallback) pendingCancelCallback();
        window.hideConfirmModal();
    });

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

async function apiCall(url, options = {}) {
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
        const contentType = response.headers.get('content-type');

        if (!contentType || !contentType.includes('application/json')) {
             if(!response.ok) throw new Error(`Server Error: ${response.status}`);
             throw new Error('Server returned non-JSON response');
        }

        const data = await response.json();
        if (!response.ok) {
            const errorMsg = data.message || `HTTP ${response.status}`;
            const errorDetails = data.details || '';
            throw new Error(`${errorMsg}${errorDetails ? ': ' + errorDetails : ''}`);
        }
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') throw new Error('Request timeout - operation took too long');
        if (error instanceof TypeError) throw new Error('Network error - check if server is running');
        throw error;
    }
}

function handleApiError(error, context) {
    console.error(`${context} error:`, error);
    let title = "Error";
    let message = error.message || "Unknown error occurred";
    if (message.includes('timeout')) { title = "Timeout"; message = "Operation took too long."; }
    else if (message.includes('Network')) { title = "Connection Error"; message = "Cannot reach server."; }
    else if (message.includes('Invalid')) { title = "Invalid Input"; }
    else if (message.includes('driver')) { title = "Driver Error"; message = "Device connection lost."; }
    else if (message.includes('404')) { title = "Not Found"; message = "Endpoint not found (Check URL)."; }
    window.showToast(title, message, 'error');
}

window.loadConfig = async function() {
    try {
        const result = await apiCall('/api/config');
        const data = result.data || result;

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
    } catch (error) { handleApiError(error, 'Config load'); }
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
        await apiCall('/api/config', { method: 'POST', body: JSON.stringify(config) });
        document.getElementById('configModal').classList.remove('open');
        window.showToast("Saved", "Configuration updated", 'success');
    } catch (error) { handleApiError(error, 'Config save'); }
}

window.openConfig = function() {
    document.getElementById('configModal').classList.add('open');
}

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
    if (checkbox.checked) ui.classList.add('active');
    else ui.classList.remove('active');
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
    document.querySelectorAll('.xml-node.active').forEach(el => el.classList.remove('active'));
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
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.className = `pro-toast ${type}`;
    toast.innerHTML = `<div style="font-size: 20px; font-weight: bold;">${icons[type] || '•'}</div><div><h4 class="text-sm font-bold text-white">${title}</h4><p class="text-xs text-gray-400 font-mono">${message}</p></div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, TOAST_DURATION);
}

window.scanScreen = async function() {
    const btn = document.getElementById('scanBtn');
    const loading = document.getElementById('loading');
    const verify = document.getElementById('autoVerify').checked;
    const prefix = document.getElementById('pagePrefix').value || "page";

    btn.disabled = true;
    document.getElementById('loading-text').innerText = "ANALYZING...";
    loading.classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('device-wrapper').classList.add('hidden');
    document.getElementById('overlays').innerHTML = '';
    document.getElementById('elements-list').innerHTML = '';
    document.getElementById('xml-tree-root').innerHTML = '';
    window.clearSelection();
    allElementsData = [];

    try {
        const result = await apiCall('/api/scan', {
            method: 'POST',
            body: JSON.stringify({
                platform: currentPlatform,
                verify: verify,
                prefix: prefix
            })
        });

        const data = result.data || result;

        if (result.status === 'success' || data.image) {
            window.renderResult(data);
        } else {
            throw new Error(result.message || 'Scan failed');
        }
    } catch (error) {
        handleApiError(error, 'Scan');
        window.resetUI(true);
    }
}

// ✅ RENDER RESULT (BLACKLIST FİLTRELEME EKLENDİ)
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

        if (data.page_name) {
            const pageInput = document.getElementById('pagePrefix');
            pageInput.style.color = '#ef4444';
            pageInput.value = data.page_name;
            setTimeout(() => pageInput.style.color = 'white', 500);
        }

        // --- DEĞİŞİKLİK: SİLİNENLERİ FİLTRELE ---
        const validElements = data.elements.filter(el => !deletedLocators.has(el.locator));

        document.getElementById('element-count').innerText = `${validElements.length}`;

        validElements.forEach((el, index) => {
            allElementsData.push({ ...el, index, isDeleted: false });
            window.createBox(el, index);
            window.createListItem(el, index);
        });
        // ----------------------------------------

        parseXMLSource();
        window.showToast("Success", `Found ${validElements.length} elements`, 'success');
    };
}

window.performTap = async function(x, y, imgW, imgH) {
    document.getElementById('loading-text').innerText = "TAPPING...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        const result = await apiCall('/api/tap', {
            method: 'POST',
            body: JSON.stringify({
                x: x,
                y: y,
                img_w: imgW,
                img_h: imgH,
                platform: currentPlatform
            })
        });

        // ✅ RECORDER LOGIC
        if (appState.get('recorder.isRecording')) {
            if (result.data && result.data.smart_action) {
                appState.addStep(result.data.smart_action);
            }
        }

        window.scanScreen();
    } catch (error) {
        handleApiError(error, 'Tap');
        window.resetUI(false);
    }
}

window.performScroll = async function(direction) {
    document.getElementById('loading-text').innerText = "SCROLLING...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        await apiCall('/api/scroll', {
            method: 'POST',
            body: JSON.stringify({
                direction: direction,
                platform: currentPlatform
            })
        });

        // ✅ RECORDER LOGIC
        if (appState.get('recorder.isRecording')) {
            appState.addStep({
                type: 'scroll',
                direction: direction
            });
        }

        window.scanScreen();
    } catch (error) {
        handleApiError(error, 'Scroll');
        window.resetUI(false);
    }
}

window.triggerBack = async function() {
    document.getElementById('loading-text').innerText = "BACK...";
    document.getElementById('loading').classList.remove('hidden');

    try {
        await apiCall('/api/back', { method: 'POST' });

        // ✅ RECORDER LOGIC
        if (appState.get('recorder.isRecording')) {
            appState.addStep({ type: 'back' });
        }

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
        await apiCall('/api/hide-keyboard', { method: 'POST' });
        window.scanScreen();
    } catch (error) {
        handleApiError(error, 'Hide KB');
        window.resetUI(false);
    }
}

window.resetUI = function(showEmpty = false) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('scanBtn').disabled = false;
    if (showEmpty) document.getElementById('empty-state').classList.remove('hidden');
}

window.copyAllVariables = function() {
    const activeElements = allElementsData.filter(el => !el.isDeleted);
    if (activeElements.length === 0) {
        window.showToast("Uyarı", "No active elements", 'info');
        return;
    }

    let output = "*** Variables ***\n";
    activeElements.forEach(item => {
        const varName = item.variable.replace('${', '').replace('}', '').trim();
        const parts = item.locator.split('=', 1);
        const locatorStrategy = parts[0] || "xpath";
        const locatorValue = item.locator.substring(locatorStrategy.length + 1) || item.locator;
        output += `\${${varName}} = \t${locatorStrategy}=${locatorValue}\n`;
    });

    navigator.clipboard.writeText(output).then(() => {
        window.showToast("Copied!", `${activeElements.length} variables copied`, 'success');
    });
}

window.toggleSourceView = function(view) {
    const listEl = document.getElementById('elements-list');
    const sourceEl = document.getElementById('source-view-container');
    const listOpt = document.getElementById('view-list');
    const sourceOpt = document.getElementById('view-source');
    const slider = document.getElementById('view-slider');

    window.clearSelection();

    if (view === 'list') {
        listEl.style.display = 'block';
        sourceEl.style.display = 'none';
        listOpt.classList.add('active');
        sourceOpt.classList.remove('active');
        slider.style.transform = "translateX(0)";
    } else {
        listEl.style.display = 'none';
        sourceEl.style.display = 'block';
        sourceOpt.classList.add('active');
        listOpt.classList.remove('active');
        slider.style.transform = "translateX(calc(100% - 2px))";
        parseXMLSource();
    }
}

function parseBoundsFromElement(element) {
    if (element.hasAttribute('bounds')) {
        const m = element.getAttribute('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        if (m) return {
            x: parseInt(m[1]),
            y: parseInt(m[2]),
            w: parseInt(m[3]) - parseInt(m[1]),
            h: parseInt(m[4]) - parseInt(m[2])
        };
    } else if (element.hasAttribute('x')) {
        return {
            x: parseInt(element.getAttribute('x')),
            y: parseInt(element.getAttribute('y')),
            w: parseInt(element.getAttribute('width')),
            h: parseInt(element.getAttribute('height'))
        };
    }
    return null;
}

function findElementByBounds(targetX, targetY, targetW, targetH) {
    const candidates = allElementsData.filter(item => !item.isDeleted && item.coords);
    const tMx = targetX + targetW / 2;
    const tMy = targetY + targetH / 2;

    for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        const c = item.coords;
        const iMx = c.x + c.w / 2;
        const iMy = c.y + c.h / 2;

        if (Math.abs(iMx - tMx) < BOUNDS_TOLERANCE &&
            Math.abs(iMy - tMy) < BOUNDS_TOLERANCE &&
            Math.abs(c.w - targetW) < BOUNDS_TOLERANCE * 2 &&
            Math.abs(c.h - targetH) < BOUNDS_TOLERANCE * 2) {
            return item.index;
        }
    }
    return -1;
}

function parseXMLSource() {
    if (!rawSource) return;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rawSource, "text/xml");
    const rootElement = xmlDoc.documentElement;

    if (!rootElement || rootElement.nodeName === 'parsererror') {
        window.showToast("Hata", "XML Parse Hatası", 'error');
        return;
    }

    const treeRoot = document.getElementById('xml-tree-root');
    treeRoot.innerHTML = '';
    treeRoot.appendChild(renderNode(rootElement));
}

// redPather/static/js/app.js - renderNode fonksiyonunu bununla değiştir:

function renderNode(element, depth = 0) {
    const tagName = element.tagName;
    const hasChildren = element.children.length > 0;
    const nodeContainer = document.createElement('div');
    nodeContainer.className = 'xml-node';

    // Girinti
    nodeContainer.style.paddingLeft = `${depth * 15}px`;

    // Index ve ID ataması
    const bounds = parseBoundsFromElement(element);
    let myIndex = -1;

    if (bounds) {
        nodeContainer.dataset.x = bounds.x;
        nodeContainer.dataset.y = bounds.y;
        nodeContainer.dataset.w = bounds.w;
        nodeContainer.dataset.h = bounds.h;

        myIndex = findElementByBounds(bounds.x, bounds.y, bounds.w, bounds.h);

        if (myIndex !== -1) {
            nodeContainer.id = `xml-node-${myIndex}`;
            nodeContainer.dataset.index = myIndex;
        }
    }

    const toggle = document.createElement('span');
    toggle.className = 'xml-node-toggle';

    if (hasChildren) {
        // ✅ DÜZELTME: Auto-collapse mantığını sildik. Varsayılan '▼' (Açık)
        toggle.innerText = '▼';

        toggle.onclick = (e) => {
            e.stopPropagation();
            const childrenContainer = nodeContainer.nextElementSibling;
            if (childrenContainer) {
                childrenContainer.classList.toggle('hidden-children');
                // İkonu güncelle
                toggle.innerText = childrenContainer.classList.contains('hidden-children') ? '►' : '▼';
                toggle.classList.toggle('collapsed');
            }
        };
    } else {
        toggle.innerHTML = '&nbsp;&nbsp;';
    }
    nodeContainer.appendChild(toggle);

    // İçerik Wrapper (Text Wrapping için)
    const contentSpan = document.createElement('span');
    contentSpan.className = 'xml-node-content';

    const tagSpan = document.createElement('span');
    tagSpan.className = 'xml-node-tag';
    tagSpan.innerText = `<${tagName}`;
    contentSpan.appendChild(tagSpan);

    const attribSpan = document.createElement('span');
    attribSpan.className = 'xml-node-attributes';

    let attribText = '';
    for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        let val = attr.value;
        // Çok uzun metinleri kısalt
        if (val.length > 120) val = val.substring(0, 120) + '...';
        attribText += ` ${attr.name}="${val}"`;
    }

    if (!hasChildren) {
        attribText += " />";
    } else {
        attribText += ">";
    }

    attribSpan.innerText = attribText;
    contentSpan.appendChild(attribSpan);
    nodeContainer.appendChild(contentSpan);

    // Tıklama Olayı
    nodeContainer.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.xml-node.active').forEach(n => n.classList.remove('active'));
        nodeContainer.classList.add('active');

        if (myIndex !== -1) {
            window.highlightElement(myIndex, true);
        }
    };

    // Recursion
    if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'xml-children';
        // ✅ DÜZELTME: 'hidden-children' sınıfını varsayılan olarak EKLEMİYORUZ.

        Array.from(element.children).forEach(child => {
            childrenContainer.appendChild(renderNode(child, depth + 1));
        });

        const closeTag = document.createElement('div');
        closeTag.className = 'xml-node';
        closeTag.style.paddingLeft = `${(depth * 15) + 20}px`;
        closeTag.innerHTML = `<span class="xml-node-tag">&lt;/${tagName}&gt;</span>`;

        const frag = document.createDocumentFragment();
        frag.appendChild(nodeContainer);
        frag.appendChild(childrenContainer);
        frag.appendChild(closeTag);
        return frag;
    }

    return nodeContainer;
}

window.createBox = function(el, index) {
    const box = document.createElement('div');
    box.id = `box-${index}`;
    box.className = 'target-box';

    box.onclick = (e) => {
        e.stopPropagation();
        if (navModeActive || e.shiftKey) {
            const img = document.getElementById('screenshot');
            const cx = el.coords.x + el.coords.w / 2;
            const cy = el.coords.y + el.coords.h / 2;
            window.performTap(cx, cy, img.naturalWidth, img.naturalHeight);
        } else {
            window.highlightElement(index, true);
        }
    };

    box.dataset.x = el.coords.x;
    box.dataset.y = el.coords.y;
    box.dataset.w = el.coords.w;
    box.dataset.h = el.coords.h;

    const img = document.getElementById('screenshot');
    if (img.complete && currentDeviceW > 0) {
        const sx = img.width / currentDeviceW;
        const sy = img.height / currentDeviceH;
        window.updateBoxPosition(box, sx, sy);
    }

    const label = document.createElement('div');
    label.className = "box-label absolute -top-5 left-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-lg z-50 pointer-events-none";
    label.innerText = index + 1;
    box.appendChild(label);

    document.getElementById('overlays').appendChild(box);
}

window.updateBoxPosition = function(box, sx, sy) {
    if (!box) return;
    box.style.left = (parseFloat(box.dataset.x) * sx) + 'px';
    box.style.top = (parseFloat(box.dataset.y) * sy) + 'px';
    box.style.width = (parseFloat(box.dataset.w) * sx) + 'px';
    box.style.height = (parseFloat(box.dataset.h) * sy) + 'px';
}

// redPather/static/js/app.js - highlightElement fonksiyonunu bununla değiştir:

window.highlightElement = function(index, doScroll = false) {
    if (currentHoverIndex === index) return;

    window.clearSelection();
    currentHoverIndex = index;

    const box = document.getElementById(`box-${index}`);
    const listItem = document.getElementById(`list-item-${index}`);
    const img = document.getElementById('screenshot');

    // 1. Kutu (Overlay) Güncellemesi
    if (box && img && currentDeviceW > 0) {
        const sx = img.width / currentDeviceW;
        const sy = img.height / currentDeviceH;
        window.updateBoxPosition(box, sx, sy);
        box.classList.add('active');
    }

    // 2. Sol Liste Güncellemesi
    if (listItem) {
        listItem.classList.add('active');
        if (doScroll && document.getElementById('view-list').classList.contains('active')) {
            listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            listItem.classList.remove('flash');
            void listItem.offsetWidth;
            listItem.classList.add('flash');
        }
        if (box) window.drawConnector(listItem, box);
    }

    // 3. Raw Source Güncellemesi (Otomatik Açma Özellikli)
    const sourceView = document.getElementById('source-view-container');

    // Eğer Raw Source görünürse veya biz arka planda güncellemek istiyorsak
    if (sourceView) {
        const xmlNode = document.getElementById(`xml-node-${index}`);

        if (xmlNode) {
            // --- YENİ EKLENEN: Ebeveynleri Bul ve Aç ---
            let parent = xmlNode.parentElement;
            while (parent && parent !== sourceView) {
                // Eğer bu bir 'xml-children' container ise ve gizliyse
                if (parent.classList.contains('xml-children') && parent.classList.contains('hidden-children')) {
                    parent.classList.remove('hidden-children');

                    // Toggle ikonunu da güncelle (► -> ▼)
                    // xml-children'ın hemen öncesindeki sibling 'xml-node' dur ve içinde toggle vardır.
                    const prevSibling = parent.previousElementSibling;
                    if (prevSibling && prevSibling.classList.contains('xml-node')) {
                        const toggle = prevSibling.querySelector('.xml-node-toggle');
                        if (toggle) {
                            toggle.innerText = '▼';
                            toggle.classList.remove('collapsed');
                        }
                    }
                }
                parent = parent.parentElement;
            }
            // -------------------------------------------

            xmlNode.classList.add('active');

            // Sadece Raw Source sekmesi açıksa scroll et
            if (doScroll && sourceView.style.display !== 'none') {
                setTimeout(() => {
                    xmlNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50); // DOM güncellemesi için minik gecikme
            }
        }
    }
}

window.drawConnector = function(listEl, boxEl) {
    const listContainer = document.getElementById('elements-list');
    if (listContainer.style.display === 'none' || window.getComputedStyle(listContainer).display === 'none') return;

    const svgPath = document.getElementById('connector-path');
    const dotList = document.getElementById('connector-dot-list');
    const dotImg = document.getElementById('connector-dot-img');
    const listRect = listEl.getBoundingClientRect();
    const containerRect = listContainer.getBoundingClientRect();

    if (listRect.top < containerRect.top || listRect.bottom > containerRect.bottom) {
        svgPath.style.display = 'none';
        dotList.style.display = 'none';
        dotImg.style.display = 'none';
        return;
    }

    const boxRect = boxEl.getBoundingClientRect();
    const x1 = listRect.left;
    const y1 = listRect.top + listRect.height / 2;
    const x2 = boxRect.right;
    const y2 = boxRect.top + boxRect.height / 2;
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

    window.hideConfirmModal = function () {
        document.getElementById('confirmModal').classList.remove('open');
        pendingEditCallback = null;
        pendingCancelCallback = null;
    }

    window.startEdit = function (element, index, field) {
        const item = allElementsData.find(el => el.index === index);
        if (!item) return;
        const currentVal = item[field];
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentVal;
        input.className = 'edit-input';
        element.innerHTML = '';
        element.appendChild(input);
        input.focus();
        element.removeAttribute('onclick');
        const finish = (save) => {
            if (save) {
                item[field] = input.value;
                element.innerText = input.value;
                window.showToast("Updated", "Değer güncellendi", 'success');
            } else {
                element.innerText = currentVal;
            }
            element.ondblclick = () => window.startEdit(element, index, field);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
                window.showConfirmModal(input.value, () => finish(true), () => {
                    finish(false);
                    input.focus();
                });
            }
            if (e.key === 'Escape') finish(false);
            e.stopPropagation();
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    }

    window.createListItem = function (el, index) {
        const container = document.getElementById('elements-list');
        const item = document.createElement('div');
        item.className = 'list-item p-4 rounded-lg mb-2 cursor-pointer group relative flex flex-col gap-2 border border-[#27272a]';
        item.id = `list-item-${index}`;
        let badgeClass = "bg-gray-800 text-gray-400 border border-gray-700";
        if (el.strategy.includes('ID')) badgeClass = "bg-blue-900/30 text-blue-400 border border-blue-800";
        else if (el.strategy.includes('ACC_ID')) badgeClass = "bg-emerald-900/30 text-emerald-400 border border-emerald-800";
        else if (el.strategy.includes('ANCHOR')) badgeClass = "bg-pink-900/30 text-pink-400 border border-pink-800";
        else if (el.strategy.includes('TEXT')) badgeClass = "bg-purple-900/30 text-purple-400 border border-purple-800";

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
            <code class="block text-[13px] text-red-400 font-bold break-all hover:text-red-300 transition-colors cursor-text mb-1 border border-transparent hover:border-red-900/30 rounded px-1 -mx-1" title="Düzenle" ondblclick="window.startEdit(this, ${index}, 'variable')">${el.variable}</code>
            <code class="block text-[10px] text-gray-600 bg-[#09090b] px-2 py-1.5 rounded border border-[#27272a] break-all font-mono hover:text-gray-400 hover:border-gray-500 transition-colors cursor-text" title="Düzenle" ondblclick="window.startEdit(this, ${index}, 'locator')">${el.locator}</code>
        </div>
        <div class="flex items-center gap-2 w-full mt-1">
            <button onclick="window.verifyLocatorByIndex(event, ${index}, this)" class="action-btn" title="Doğrula"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg></button>
            <button onclick="window.copyDataByIndex(event, ${index}, 'Line')" class="action-btn" title="Kopyala"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>
            <button onclick="window.removeElement(event, ${index})" class="action-btn delete ml-auto" title="Sil"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>`;
        item.addEventListener('mouseenter', () => window.highlightElement(index, false));
        item.addEventListener('mouseleave', () => window.clearSelection());
        container.appendChild(item);
    }

    // ✅ REMOVE ELEMENT (BLACKLIST'E EKLEME)
    window.removeElement = function (e, index) {
        e.stopPropagation();
        window.clearSelection();
        const item = document.getElementById(`list-item-${index}`);
        const box = document.getElementById(`box-${index}`);
        if (item) {
            item.classList.add('removing');
            setTimeout(() => item.remove(), 200);
        }
        if (box) box.remove();
        const data = allElementsData.find(el => el.index === index);
        if (data) {
            data.isDeleted = true;

            // --- DEĞİŞİKLİK: SİLİNEN LOCATOR'I KAYDET ---
            if (data.locator) {
                deletedLocators.add(data.locator);
            }
            // ------------------------------------------
        }
        document.getElementById('element-count').innerText = allElementsData.filter(el => !el.isDeleted).length;
    }

    window.verifyLocatorByIndex = async function (e, index, btn) {
        e.stopPropagation();
        const item = allElementsData.find(el => el.index === index);
        if (!item) return;
        const original = btn.innerHTML;
        btn.innerHTML = `<div class="loader"></div>`;
        try {
            const result = await apiCall('/api/verify', {
                method: 'POST',
                body: JSON.stringify({locator: item.locator})
            });
            const data = result.data || result;
            if (data.valid) {
                btn.innerHTML = `<span class="text-emerald-500 font-bold text-sm">✓</span>`;
                window.showToast("Verified", `Count: ${data.count}`, 'success');
            } else {
                btn.innerHTML = `<span class="text-red-500 font-bold text-sm">✕</span>`;
                window.showToast("Failed", `Found: ${data.count}`, 'error');
            }
        } catch (e) {
            btn.innerHTML = `<span class="text-yellow-500 font-bold text-sm">!</span>`;
            handleApiError(e, 'Verify');
        }
        setTimeout(() => btn.innerHTML = original, 2000);
    }

    window.copyDataByIndex = function (e, index, mode) {
        e.stopPropagation();
        const item = allElementsData.find(el => el.index === index);
        if (!item) return;
        let txt = "";
        if (mode === 'Line') {
            const parts = item.locator.split('=', 1);
            txt = `\${${item.variable.replace(/[${}]/g, '')}} = \t${parts[0]}=${item.locator.substring(parts[0].length + 1)}`;
        } else if (mode === 'Variable') txt = item.variable;
        else txt = item.locator;
        navigator.clipboard.writeText(txt).then(() => window.showToast("Copied", mode, 'success'));
    }

    window.toggleRecordMode = function () {
        const isRecording = appState.toggleRecording();
        const btn = document.getElementById('recordBtn');

        if (isRecording) {
            btn.classList.add('bg-red-600', 'text-white', 'animate-pulse');
            btn.classList.remove('text-gray-400');
            window.showToast("Recording Started", "Actions will be captured", "info");
        } else {
            btn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
            btn.classList.add('text-gray-400');

            const steps = appState.get('recorder.steps');
            window.showToast("Recording Stopped", `${steps.length} steps captured`, "success");

            // Eğer step varsa export modalını göster
            if (steps.length > 0) {
                window.showExportModal();
            }
        }
    }

    window.showExportModal = function () {
        const steps = appState.get('recorder.steps');
        if (steps.length === 0) {
            window.showToast("Uyarı", "No steps to export", "info");
            return;
        }

        // Modal HTML oluştur
        const modalHTML = `
        <div id="exportModal" class="modal-overlay open">
            <div class="modal-box config-modal-box">
                <div class="flex flex-col gap-4">
                    <div class="flex items-center gap-3 border-b border-[#27272a] pb-3">
                        <div class="w-10 h-10 rounded-lg bg-red-900/30 flex items-center justify-center text-red-500">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-sm font-bold text-white">Export Recorded Test</h3>
                            <p class="text-[11px] text-gray-400">${steps.length} steps captured</p>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button onclick="window.exportAsFormat('robot')" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-3 rounded transition">
                            <div class="flex flex-col items-center gap-1">
                                <span>🤖 Robot Framework</span>
                                <span class="text-[9px] opacity-70">.robot</span>
                            </div>
                        </button>
                        <button onclick="window.exportAsFormat('python')" class="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-3 rounded transition">
                            <div class="flex flex-col items-center gap-1">
                                <span>🐍 Python/Pytest</span>
                                <span class="text-[9px] opacity-70">.py</span>
                            </div>
                        </button>
                    </div>

                    <div>
                        <label class="config-label mb-2 block">PREVIEW</label>
                        <div id="exportPreview" class="bg-[#09090b] p-3 rounded border border-[#27272a] max-h-64 overflow-y-auto">
                            <code class="text-[10px] text-gray-400 font-mono block whitespace-pre">${window.generateRobotCode()}</code>
                        </div>
                    </div>

                    <div class="flex gap-3 justify-end pt-3 border-t border-[#27272a]">
                        <button onclick="window.clearRecording()" class="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 rounded transition border border-transparent hover:border-[#3f3f46]">
                            Clear Steps
                        </button>
                        <button onclick="window.closeExportModal()" class="bg-[#27272a] hover:bg-[#3f3f46] text-white text-xs font-bold px-5 py-2 rounded transition">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

        // Mevcut export modal varsa kaldır
        const existing = document.getElementById('exportModal');
        if (existing) existing.remove();

        // Yeni modal ekle
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    window.closeExportModal = function () {
        const modal = document.getElementById('exportModal');
        if (modal) {
            modal.classList.remove('open');
            setTimeout(() => modal.remove(), 300);
        }
    }

    window.exportAsFormat = function (format) {
        const code = format === 'robot' ? window.generateRobotCode() : window.generatePythonCode();
        const filename = format === 'robot' ? 'recorded_test.robot' : 'test_recorded.py';

        // Dosya olarak indir
        const blob = new Blob([code], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        window.showToast("Exported", `Downloaded as ${filename}`, "success");
    }

    window.generateRobotCode = function () {
        const steps = appState.get('recorder.steps');

        let code = `*** Settings ***
Library    AppiumLibrary

*** Test Cases ***
Recorded Test Scenario
    [Documentation]    Auto-generated from QA Red Pather
    [Tags]    recorded    ${new Date().toISOString().split('T')[0]}
    
`;

        steps.forEach((step, index) => {
            if (step.type === 'element_click') {
                const strategy = step.locator.split('=')[0];
                const value = step.locator.substring(strategy.length + 1);

                if (strategy === 'id') {
                    code += `    Click Element    id=${value}\n`;
                } else if (strategy === 'xpath') {
                    code += `    Click Element    xpath=${value}\n`;
                } else if (strategy === 'accessibility_id') {
                    code += `    Click Element    accessibility_id=${value}\n`;
                }

            } else if (step.type === 'coordinate_tap') {
                code += `    Tap    ${step.x}    ${step.y}\n`;

            } else if (step.type === 'scroll') {
                code += `    Swipe    ${step.direction === 'up' ? 'up' : 'down'}\n`;

            } else if (step.type === 'back') {
                code += `    Go Back\n`;
            }
        });

        return code;
    }

    window.generatePythonCode = function () {
        const steps = appState.get('recorder.steps');
        const platform = appState.get('ui.platform');

        let code = `"""
Auto-generated test from QA Red Pather
Date: ${new Date().toLocaleString()}
Platform: ${platform}
"""
import pytest
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestRecordedScenario:
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # TODO: Configure your Appium capabilities
        self.driver = webdriver.Remote(
            'http://127.0.0.1:4723/wd/hub',
            options=options  # Define options based on your config
        )
        yield
        self.driver.quit()
    
    def test_recorded_scenario(self):
        """Recorded test scenario"""
        wait = WebDriverWait(self.driver, 10)
        
`;

        steps.forEach((step, index) => {
            code += `        # Step ${index + 1}\n`;

            if (step.type === 'element_click') {
                const strategy = step.locator.split('=')[0];
                const value = step.locator.substring(strategy.length + 1);

                const strategyMap = {
                    'id': 'AppiumBy.ID',
                    'xpath': 'AppiumBy.XPATH',
                    'accessibility_id': 'AppiumBy.ACCESSIBILITY_ID'
                };

                const by = strategyMap[strategy] || 'AppiumBy.XPATH';
                code += `        element = wait.until(EC.element_to_be_clickable((${by}, "${value}")))\n`;
                code += `        element.click()\n`;

            } else if (step.type === 'coordinate_tap') {
                code += `        self.driver.tap([(${step.x}, ${step.y})])\n`;

            } else if (step.type === 'scroll') {
                code += `        # Scroll ${step.direction}\n`;
                code += `        size = self.driver.get_window_size()\n`;
                code += `        start_y = int(size['height'] * 0.7 if '${step.direction}' == 'down' else size['height'] * 0.3)\n`;
                code += `        end_y = int(size['height'] * 0.3 if '${step.direction}' == 'down' else size['height'] * 0.7)\n`;
                code += `        self.driver.swipe(size['width']//2, start_y, size['width']//2, end_y, 300)\n`;

            } else if (step.type === 'back') {
                code += `        self.driver.back()\n`;
            }

            code += `\n`;
        });

        return code;
    }

    window.clearRecording = function () {
        appState.clearSteps();
        window.closeExportModal();
        window.showToast("Cleared", "All recorded steps removed", "info");
    }


    window.exportRecording = function () {
        const steps = appState.get('recorder.steps');
        if (steps.length === 0) return;

        let code = "*** Test Cases ***\nRecorded Test Scenario\n";

        steps.forEach(step => {
            if (step.type === 'element_click') {
                // Robot Framework Formatı
                code += `    Click Element    ${step.locator}\n`;
            } else if (step.type === 'coordinate_tap') {
                code += `    Click At Coordinates    ${step.x}    ${step.y}\n`;
            } else if (step.type === 'scroll') {
                code += `    Swipe    ${step.direction}\n`;
            } else if (step.type === 'back') {
                code += `    Go Back\n`;
            }
        });

        // Konsola bas veya panoya kopyala
        console.log(code);
        navigator.clipboard.writeText(code).then(() => {
            window.showToast("Exported", "Test script copied to clipboard", "success");
        });

        // İsterseniz burada bir Modal açıp kodu gösterebilirsiniz.
        alert("Test Script Generated (Copied to Clipboard):\n\n" + code);
    }

    // static/js/app.js'e ekleyin

function clearHighlight(index) {
    const item = document.getElementById(`list-item-${index}`);
    const box = document.getElementById(`box-${index}`);
    const xmlNode = document.getElementById(`xml-node-${index}`);

    if (item) item.classList.remove('active', 'flash');
    if (box) box.classList.remove('active');
    if (xmlNode) xmlNode.classList.remove('active');
}

function renderElementList(elements) {
    const container = document.getElementById('elements-list');
    if (!container) return;

    container.innerHTML = '';

    elements.forEach((el, index) => {
        if (!el.isDeleted) {
            window.createListItem(el, index);
        }
    });

    document.getElementById('element-count').innerText =
        elements.filter(el => !el.isDeleted).length;
}