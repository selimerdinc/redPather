/**
 * XML Tree Viewer Component
 * Handles parsing and rendering of the XML source tree.
 */
class XMLTreeViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.parser = new DOMParser();

        // State değişikliklerini dinle
        if (window.appState) {
            window.appState.subscribe('ui.currentHoverIndex', (idx) => this.handleHighlight(idx));
        }
    }

    /**
     * Parse and render XML source
     * @param {string} source - Raw XML string
     */
    render(source) {
        if (!this.container) return;
        this.container.innerHTML = ''; // Temizle

        if (!source) return;

        try {
            const xmlDoc = this.parser.parseFromString(source, "text/xml");
            const rootElement = xmlDoc.documentElement;

            if (!rootElement || rootElement.nodeName === 'parsererror') {
                console.error("XML Parse Error");
                return;
            }

            const treeFragment = this.createNodeElement(rootElement, 0);
            this.container.appendChild(treeFragment);

        } catch (e) {
            console.error("Tree render error:", e);
        }
    }

    /**
     * Create a DOM element for a generic XML node (Recursive)
     * Replaces the old string concatenation method for better performance.
     */
    createNodeElement(xmlNode, depth) {
        const tagName = xmlNode.tagName;
        const children = Array.from(xmlNode.children);
        const hasChildren = children.length > 0;

        // Container Div
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'xml-node';
        nodeDiv.style.paddingLeft = `${depth * 15}px`;

        // Attributes & Metadata Extraction
        const bounds = this.parseBounds(xmlNode);
        let myIndex = -1;

        if (bounds) {
            nodeDiv.dataset.x = bounds.x;
            nodeDiv.dataset.y = bounds.y;
            nodeDiv.dataset.w = bounds.w;
            nodeDiv.dataset.h = bounds.h;

            // Global fonksiyona bağımlılığı azaltmak için state servisi kullanılabilir
            // Ama şimdilik mevcut yapıyı korumak için window fonksiyonunu çağırıyoruz
            if (window.findElementByBounds) {
                myIndex = window.findElementByBounds(bounds.x, bounds.y, bounds.w, bounds.h);
                if (myIndex !== -1) {
                    nodeDiv.id = `xml-node-${myIndex}`;
                    nodeDiv.dataset.index = myIndex;
                }
            }
        }

        // Toggle Icon (▼/►)
        const toggleSpan = document.createElement('span');
        toggleSpan.className = 'xml-node-toggle';

        if (hasChildren) {
            toggleSpan.textContent = '▼';
            toggleSpan.onclick = (e) => {
                e.stopPropagation();
                const childContainer = nodeDiv.nextElementSibling;
                if (childContainer) {
                    const isHidden = childContainer.classList.toggle('hidden-children');
                    toggleSpan.textContent = isHidden ? '►' : '▼';
                    toggleSpan.classList.toggle('collapsed', isHidden);
                }
            };
        } else {
            toggleSpan.innerHTML = '&nbsp;&nbsp;';
        }
        nodeDiv.appendChild(toggleSpan);

        // Content Wrapper
        const contentSpan = document.createElement('span');
        contentSpan.className = 'xml-node-content';

        // Tag Name
        const tagSpan = document.createElement('span');
        tagSpan.className = 'xml-node-tag';
        tagSpan.textContent = `<${tagName}`;
        contentSpan.appendChild(tagSpan);

        // Attributes
        const attrSpan = document.createElement('span');
        attrSpan.className = 'xml-node-attributes';

        let attrText = '';
        Array.from(xmlNode.attributes).forEach(attr => {
            let val = attr.value;
            if (val.length > 100) val = val.substring(0, 100) + '...';
            attrText += ` ${attr.name}="${val}"`;
        });

        if (!hasChildren) attrText += " />";
        else attrText += ">";

        attrSpan.textContent = attrText;
        contentSpan.appendChild(attrSpan);
        nodeDiv.appendChild(contentSpan);

        // Event Listener (Click)
        nodeDiv.onclick = (e) => {
            e.stopPropagation();
            if (myIndex !== -1 && window.highlightElement) {
                window.highlightElement(myIndex, true);
            }
        };

        // Fragment Assembly
        const fragment = document.createDocumentFragment();
        fragment.appendChild(nodeDiv);

        // Recursion for Children
        if (hasChildren) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'xml-children'; // Default visible

            children.forEach(child => {
                childrenContainer.appendChild(this.createNodeElement(child, depth + 1));
            });

            fragment.appendChild(childrenContainer);

            // Closing Tag
            const closeDiv = document.createElement('div');
            closeDiv.className = 'xml-node';
            closeDiv.style.paddingLeft = `${(depth * 15) + 20}px`;

            const closeTagSpan = document.createElement('span');
            closeTagSpan.className = 'xml-node-tag';
            closeTagSpan.textContent = `</${tagName}>`;

            closeDiv.appendChild(closeTagSpan);
            fragment.appendChild(closeDiv);
        }

        return fragment;
    }

    /**
     * Highlights the active node in the tree
     */
    handleHighlight(index) {
        // Eski aktifi temizle
        const oldActive = this.container.querySelector('.xml-node.active');
        if (oldActive) oldActive.classList.remove('active');

        if (index === -1) return;

        // Yeniyi seç
        const newActive = document.getElementById(`xml-node-${index}`);
        if (newActive) {
            // Ebeveynleri otomatik aç
            this.expandParents(newActive);

            newActive.classList.add('active');

            // Eğer görünürse scroll et
            if (this.container.offsetParent !== null) {
                setTimeout(() => {
                    newActive.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        }
    }

    expandParents(element) {
        let parent = element.parentElement;
        while (parent && parent !== this.container) {
            if (parent.classList.contains('xml-children') && parent.classList.contains('hidden-children')) {
                parent.classList.remove('hidden-children');

                // Toggle ikonunu güncelle
                const nodeDiv = parent.previousElementSibling;
                if (nodeDiv && nodeDiv.querySelector('.xml-node-toggle')) {
                    const toggle = nodeDiv.querySelector('.xml-node-toggle');
                    toggle.textContent = '▼';
                    toggle.classList.remove('collapsed');
                }
            }
            parent = parent.parentElement;
        }
    }

    parseBounds(element) {
        // Android
        const boundsAttr = element.getAttribute('bounds');
        if (boundsAttr) {
            const m = boundsAttr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
            if (m) return { x: parseInt(m[1]), y: parseInt(m[2]), w: parseInt(m[3]) - parseInt(m[1]), h: parseInt(m[4]) - parseInt(m[2]) };
        }
        // iOS
        if (element.hasAttribute('x') && element.hasAttribute('width')) {
            return {
                x: parseInt(element.getAttribute('x')),
                y: parseInt(element.getAttribute('y')),
                w: parseInt(element.getAttribute('width')),
                h: parseInt(element.getAttribute('height'))
            };
        }
        return null;
    }
}

// Global'e attach et (app.js kullanabilsin diye)
window.XMLTreeViewer = XMLTreeViewer;