let allElementsData = [];
let currentHoverIndex = -1;
let currentPlatform = "ANDROID";
let navModeActive = false;
let pendingEditCallback = null;
let pendingCancelCallback = null;
let currentDeviceW = 0;
let currentDeviceH = 0;
let rawSource = ""; // XML Source

window.addEventListener('DOMContentLoaded', () => {
    loadConfig();

    // Global Key Listeners
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('confirmModal');
        if (modal.classList.contains('open')) {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (pendingEditCallback) pendingEditCallback(); hideConfirmModal(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (pendingCancelCallback) pendingCancelCallback(); hideConfirmModal(); }
        }
    });

    // Modal Button Listeners
    document.getElementById('modalConfirmBtn').addEventListener('click', () => { if (pendingEditCallback) pendingEditCallback(); hideConfirmModal(); });
    document.getElementById('modalCancelBtn').addEventListener('click', () => { if (pendingCancelCallback) pendingCancelCallback(); hideConfirmModal(); });

    // Scroll Listener
    document.getElementById('elements-list').addEventListener('scroll', () => {
        if (currentHoverIndex !== -1) {
            const listItem = document.getElementById(`list-item-${currentHoverIndex}`);
            const box = document.getElementById(`box-${currentHoverIndex}`);
            if (listItem && box) drawConnector(listItem, box);
        }
    });

    // Resize Observer for Screenshot
    const imgEl = document.getElementById('screenshot');
    if(imgEl) {
        const resizeObserver = new ResizeObserver(() => {
            if (currentHoverIndex !== -1) {
                const box = document.getElementById(`box-${currentHoverIndex}`);
                const img = document.getElementById('screenshot');
                if (currentDeviceW > 0 && box) {
                    const scaleX = img.width / currentDeviceW;
                    const scaleY = img.height / currentDeviceH;
                    updateBoxPosition(box, scaleX, scaleY);
                    const listItem = document.getElementById(`list-item-${currentHoverIndex}`);
                    if(listItem) drawConnector(listItem, box);
                }
            }
        });
        resizeObserver.observe(imgEl);
    }
});

// --- CONFIG API ---
async function loadConfig() {
    try {
        const res = await fetch('/config');
        const data = await res.json();
        if(document.getElementById('conf_android_pkg')) {
            document.getElementById('conf_android_pkg').value = data.ANDROID_PKG || '';
            document.getElementById('conf_android_act').value = data.ANDROID_ACT || '';
            document.getElementById('conf_android_device').value = data.ANDROID_DEVICE || 'emulator-5554';
            document.getElementById('conf_ios_bundle').value = data.IOS_BUNDLE || '';
            document.getElementById('conf_ios_device').value = data.IOS_DEVICE || 'iPhone 14';
            document.getElementById('conf_ios_udid').value = data.IOS_UDID || '';
            document.getElementById('conf_ios_org').value = data.IOS_ORG_ID || '';
            document.getElementById('conf_ios_sign').value = data.IOS_SIGN_ID || 'iPhone Developer';
        }
    } catch(e) { console.error("Config load fail", e); }
}

async function saveConfig() {
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
        await fetch('/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(config) });
        document.getElementById('configModal').classList.remove('open');
        showToast("Config Saved", "Settings updated. Driver will restart.", 'success');
    } catch(e) { showToast("Error", "Failed to save config.", 'error'); }
}

function openConfig() { document.getElementById('configModal').classList.add('open'); }

// --- UI INTERACTIONS ---
function toggleNavMode(checkbox) {
    navModeActive = checkbox.checked;
    const ui = document.getElementById('nav-switch-ui');
    if (navModeActive) { ui.classList.add('active'); document.body.classList.add('nav-mode'); showToast("Navigation Mode", "Click elements to tap & rescan.", "info"); clearSelection(); }
    else { ui.classList.remove('active'); document.body.classList.remove('nav-mode'); }
}

function toggleVerifyUI(checkbox) { const ui = document.getElementById('verify-switch-ui'); if (checkbox.checked) ui.classList.add('active'); else ui.classList.remove('active'); }

function togglePlatform() {
    const slider = document.getElementById('toggle-slider');
    const optAndroid = document.getElementById('opt-android');
    const optIos = document.getElementById('opt-ios');
    if (currentPlatform === "ANDROID") { currentPlatform = "IOS"; slider.style.transform = "translateX(100%)"; optAndroid.classList.remove('active'); optIos.classList.add('active'); }
    else { currentPlatform = "ANDROID"; slider.style.transform = "translateX(0)"; optIos.classList.remove('active'); optAndroid.classList.add('active'); }
}

function toggleSourceView(isActive) {
    const listPanel = document.getElementById('elements-list');
    const sourcePanelContainer = document.getElementById('source-view-container');
    const listToggle = document.getElementById('list-toggle-btn');
    const sourceToggle = document.getElementById('source-toggle-btn');

    if (isActive) {
        listPanel.classList.add('hidden');
        sourcePanelContainer.classList.remove('hidden');
        sourceToggle.classList.add('bg-red-600', 'text-white');
        listToggle.classList.remove('bg-red-600', 'text-white');
        listToggle.classList.add('text-gray-500');
    } else {
        listPanel.classList.remove('hidden');
        sourcePanelContainer.classList.add('hidden');
        sourceToggle.classList.remove('bg-red-600', 'text-white');
        listToggle.classList.add('bg-red-600', 'text-white');
        sourceToggle.classList.add('text-gray-500');
    }
}

function clearSelection() {
    document.querySelectorAll('.list-item.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.target-box.active').forEach(el => el.classList.remove('active'));
    const svgPath = document.getElementById('connector-path');
    const dotList = document.getElementById('connector-dot-list');
    const dotImg = document.getElementById('connector-dot-img');
    svgPath.style.display = 'none'; dotList.style.display = 'none'; dotImg.style.display = 'none';
    currentHoverIndex = -1;
}

function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    let borderColor = type === 'info' ? 'border-blue-500' : (type === 'error' ? 'border-red-500' : 'border-emerald-500');
    toast.className = `pro-toast ${type} ${borderColor}`;
    toast.innerHTML = `<div><h4 class="text-sm font-bold text-white">${title}</h4><p class="text-xs text-gray-400 font-mono">${message}</p></div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3500);
}

// --- API ACTIONS ---
async function scanScreen() {
    const btn = document.getElementById('scanBtn');
    const loading = document.getElementById('loading');
    const verify = document.getElementById('autoVerify').checked;
    const prefix = document.getElementById('pagePrefix').value || "page";
    btn.disabled = true; document.getElementById('loading-text').innerText = "ANALYZING..."; loading.classList.remove('hidden'); document.getElementById('empty-state').classList.add('hidden'); document.getElementById('device-wrapper').classList.add('hidden');
    document.getElementById('overlays').innerHTML = ''; document.getElementById('elements-list').innerHTML = ''; clearSelection(); allElementsData = [];
    try {
        const response = await fetch('/scan', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ platform: currentPlatform, verify: verify, prefix: prefix }) });
        const data = await response.json();
        if (data.status === 'success') { renderResult(data); } else { showToast("Error", data.message, 'error'); resetUI(true); }
    } catch (e) { showToast("Error", "Connection failed.", 'error'); resetUI(true); }
}

async function performScroll(direction) {
    document.getElementById('loading-text').innerText = direction === 'down' ? "SCROLLING..." : "SCROLLING UP...";
    document.getElementById('loading').classList.remove('hidden');
    try {
        const response = await fetch('/scroll', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ direction: direction, platform: currentPlatform }) });
        const res = await response.json();
        if(res.status === 'success') { scanScreen(); } else { showToast("Error", "Scroll failed.", 'error'); resetUI(false); }
    } catch(e) { showToast("Error", "Scroll connection failed.", 'error'); resetUI(false); }
}

async function performTap(x, y, imgW, imgH) {
    document.getElementById('loading-text').innerText = "TAPPING & RESCANNING...";
    document.getElementById('loading').classList.remove('hidden');
    try {
        const response = await fetch('/tap', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ x: x, y: y, img_w: imgW, img_h: imgH, platform: currentPlatform }) });
        const res = await response.json();
        if(res.status === 'success') { scanScreen(); } else { showToast("Error", "Tap failed.", 'error'); resetUI(false); }
    } catch(e) { showToast("Error", "Tap connection failed.", 'error'); resetUI(false); }
}

async function triggerBack() {
    document.getElementById('loading-text').innerText = "GOING BACK...";
    document.getElementById('loading').classList.remove('hidden');
    try {
        const response = await fetch('/action/back', { method: 'POST' });
        const res = await response.json();
        if(res.status === 'success') { scanScreen(); } else { showToast("Error", "Back failed.", 'error'); resetUI(false); }
    } catch(e) { showToast("Error", "Back connection failed.", 'error'); resetUI(false); }
}

async function triggerHideKeyboard() {
    document.getElementById('loading-text').innerText = "HIDING KEYBOARD...";
    document.getElementById('loading').classList.remove('hidden');
    try {
        const response = await fetch('/action/hide_keyboard', { method: 'POST' });
        const res = await response.json();
        if(res.status === 'success') { scanScreen(); } else { showToast("Info", "Keyboard hidden.", 'info'); resetUI(false); }
    } catch(e) { showToast("Error", "Connection failed.", 'error'); resetUI(false); }
}

function resetUI(showEmpty = false) { document.getElementById('loading').classList.add('hidden'); document.getElementById('scanBtn').disabled = false; if(showEmpty) document.getElementById('empty-state').classList.remove('hidden'); }

// --- RENDER LOGIC ---
function renderResult(data) {
    const img = document.getElementById('screenshot'); img.src = "data:image/png;base64," + data.image;

    rawSource = data.raw_source || "";

    if(data.window_w && data.window_h) { currentDeviceW = data.window_w; currentDeviceH = data.window_h; }
    img.onload = () => {
        resetUI(false); document.getElementById('device-wrapper').classList.remove('hidden'); document.getElementById('copyAllBtn').classList.remove('hidden'); document.getElementById('copyAllBtn').classList.remove('opacity-0', 'scale-95');

        if (data.page_name) { const pageInput = document.getElementById('pagePrefix'); pageInput.style.color = '#ef4444'; pageInput.value = data.page_name; setTimeout(() => { pageInput.style.color = 'white'; }, 500); }
        document.getElementById('element-count').innerText = `${data.elements.length}`;
        data.elements.forEach((el, index) => { allElementsData.push({ ...el, index, isDeleted: false }); createBox(el, index); createListItem(el, index); });

        showToast("Success", `Found ${data.elements.length} elements.`, 'success');

        // Render sonrası List View'a dön ve ağacı oluştur
        if (rawSource) {
            renderXmlTree(rawSource, 'xml-tree-root');
        }
        toggleSourceView(false);
    };
}

function createBox(el, index) {
    const box = document.createElement('div'); box.id = `box-${index}`; box.className = 'target-box';
    box.onclick = (e) => {
        e.stopPropagation();
        if (navModeActive || e.shiftKey) {
            const centerX = el.coords.x + (el.coords.w / 2); const centerY = el.coords.y + (el.coords.h / 2);
            const img = document.getElementById('screenshot');
            performTap(centerX, centerY, img.naturalWidth, img.naturalHeight);
        } else { reverseLookup(e, index); }
    };
    box.dataset.x = el.coords.x; box.dataset.y = el.coords.y; box.dataset.w = el.coords.w; box.dataset.h = el.coords.h;
    const img = document.getElementById('screenshot');
    if (img.complete && currentDeviceW > 0) { const scaleX = img.width / currentDeviceW; const scaleY = img.height / currentDeviceH; updateBoxPosition(box, scaleX, scaleY); }
    const label = document.createElement('div'); label.className = "box-label absolute -top-5 left-0 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-lg z-50 pointer-events-none"; label.innerText = index + 1;
    box.appendChild(label); document.getElementById('overlays').appendChild(box);
}

function updateBoxPosition(box, scaleX, scaleY) { if(!box) return; const x = parseFloat(box.dataset.x) * scaleX; const y = parseFloat(box.dataset.y) * scaleY; const w = parseFloat(box.dataset.w) * scaleX; const h = parseFloat(box.dataset.h) * scaleY; box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.width = w + 'px'; box.style.height = h + 'px'; }

function reverseLookup(e, index) {
    highlightElement(index, true);
    highlightSourceElement(index);
}

// --- XML TREE HIGHLIGHTING ---
function highlightSourceElement(index) {
    const item = allElementsData.find(el => el.index === index);
    if (!item || !item.full_xpath || !rawSource) return;

    toggleSourceView(true); // Source View'a geç

    const sourceContainer = document.getElementById('source-view-container');
    const sourceText = sourceContainer.querySelector('.xml-node.active'); // Aktif olanı bul

    // Eğer zaten vurgulanmış bir node varsa, onu temizle
    document.querySelectorAll('.xml-node.active').forEach(node => node.classList.remove('active'));

    // Full XPath'i kullanarak DOM ağacında ilgili node'u bul
    // XPath'in kendisi XML'de doğrudan bir metin olmayacağı için,
    // biz Tree View'de gösterilen attribute'lardan yola çıkarak bulacağız.

    // Basit bir arama: Elementin sınıf ve locator bilgisini içeren satırı bul.
    const uniqueAttr = (item.locator.includes('=') ? item.locator.split('=')[1] : item.locator) || item.text || item.variable;

    // Tüm node'ları gez
    const nodes = sourceContainer.querySelectorAll('.xml-node');
    let foundNode = null;

    nodes.forEach(node => {
        // Tag ve attribute içeriğinde arama
        if (node.textContent.includes(item.full_xpath.split('/').pop()) && node.textContent.includes(uniqueAttr)) {
            foundNode = node;
        }
    });

    if (foundNode) {
        foundNode.classList.add('active'); // Yeni node'u vurgula

        // Parent'ları aç (eğer kapalıysa)
        let parent = foundNode.parentElement;
        while (parent && parent.classList.contains('xml-children')) {
            parent.classList.remove('hidden-children');

            // Toggle butonunu açılmış moda getir
            const toggle = parent.previousElementSibling.querySelector('.xml-node-toggle');
            if(toggle) toggle.classList.remove('collapsed');

            parent = parent.parentElement.parentElement;
        }

        // Node'u View içine kaydır
        foundNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function highlightElement(index, doScroll = false) {
    if (currentHoverIndex === index) return; clearSelection(); currentHoverIndex = index;
    const box = document.getElementById(`box-${index}`); const listItem = document.getElementById(`list-item-${index}`); const img = document.getElementById('screenshot');
    if(box && img && currentDeviceW > 0) { const scaleX = img.width / currentDeviceW; const scaleY = img.height / currentDeviceH; updateBoxPosition(box, scaleX, scaleY); box.classList.add('active'); }
    if(listItem) { listItem.classList.add('active'); if (doScroll) { listItem.scrollIntoView({ behavior: 'smooth', block: 'center' }); listItem.classList.remove('flash'); void listItem.offsetWidth; listItem.classList.add('flash'); } if(box) drawConnector(listItem, box); }
}

function drawConnector(listEl, boxEl) {
    const svgPath = document.getElementById('connector-path'); const dotList = document.getElementById('connector-dot-list'); const dotImg = document.getElementById('connector-dot-img'); const listContainer = document.getElementById('elements-list');
    const listRect = listEl.getBoundingClientRect(); const containerRect = listContainer.getBoundingClientRect();
    if (listRect.top < containerRect.top || listRect.bottom > containerRect.bottom) { svgPath.style.display = 'none'; dotList.style.display = 'none'; dotImg.style.display = 'none'; return; }
    const boxRect = boxEl.getBoundingClientRect(); const x1 = listRect.left; const y1 = listRect.top + (listRect.height / 2); const x2 = boxRect.right; const y2 = boxRect.top + (boxRect.height / 2);
    const d = `M ${x1} ${y1} C ${x1 - 60} ${y1}, ${x2 + 60} ${y2}, ${x2} ${y2}`;
    svgPath.setAttribute('d', d); svgPath.style.display = 'block'; dotList.setAttribute('cx', x1); dotList.setAttribute('cy', y1); dotList.style.display = 'block'; dotImg.setAttribute('cx', x2); dotImg.setAttribute('cy', y2); dotImg.style.display = 'block';
}

// --- XML TREE RENDERING FUNCS ---
function renderXmlTree(xmlString, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const root = xmlDoc.documentElement;

    if (root) {
        const treeRoot = document.createElement('div');
        treeRoot.style.paddingLeft = '5px';
        container.appendChild(treeRoot);
        renderNode(root, treeRoot, true);
    }
}

function renderNode(node, parentElement, isRoot = false) {
    if (node.nodeType !== 1) return;

    const nodeElement = document.createElement('div');
    nodeElement.className = 'xml-node';

    const content = document.createElement('div');
    content.className = 'xml-node-content';

    const toggle = document.createElement('span');
    const hasChildren = node.children.length > 0;

    if (hasChildren) {
        toggle.innerHTML = '▼';
        toggle.className = 'xml-node-toggle';
        toggle.onclick = (e) => {
            e.stopPropagation();
            const childrenContainer = nodeElement.querySelector('.xml-children');
            if (childrenContainer) {
                childrenContainer.classList.toggle('hidden-children');
                toggle.classList.toggle('collapsed');
            }
        };
        content.appendChild(toggle);
    } else {
        toggle.innerHTML = '•';
        toggle.className = 'xml-node-toggle';
        toggle.style.color = 'transparent';
        content.appendChild(toggle);
    }

    const tag = document.createElement('span');
    tag.className = 'xml-node-tag';
    tag.textContent = `<${node.tagName}`;
    content.appendChild(tag);

    const attrs = document.createElement('span');
    attrs.className = 'xml-node-attributes';
    let attrString = '';

    const importantAttrs = ['resource-id', 'name', 'label', 'text', 'value', 'x', 'y', 'width', 'height', 'enabled', 'type', 'visible'];
    Array.from(node.attributes).forEach(attr => {
        if (importantAttrs.includes(attr.name) || attr.name.includes('-id') || attr.name.includes('desc')) {
            attrString += ` ${attr.name}="${attr.value}"`;
        }
    });
    attrs.textContent = attrString + (hasChildren ? '>' : '/>');

    content.appendChild(attrs);
    nodeElement.appendChild(content);
    parentElement.appendChild(nodeElement);

    if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'xml-children';
        nodeElement.appendChild(childrenContainer);

        Array.from(node.children).forEach(child => {
            renderNode(child, childrenContainer);
        });

        if (!isRoot) childrenContainer.classList.add('hidden-children');
        if (!isRoot) toggle.classList.add('collapsed');

    } else if (node.children.length === 0 && !attrString.endsWith('/>')) {
        const closingTag = document.createElement('div');
        closingTag.className = 'xml-node-tag';
        closingTag.textContent = `</${node.tagName}>`;
        closingTag.style.marginLeft = (nodeElement.querySelector('.xml-node-toggle').offsetWidth + 5) + 'px'; // Girinti hizalama
        parentElement.appendChild(closingTag);
    }
}