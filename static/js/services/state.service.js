/**
 * State Service - Centralized state management with reactivity
 */

class StateService {
    constructor() {
        this.state = {
            // UI State
            ui: {
                platform: 'ANDROID',
                viewMode: 'list',
                isLoading: false,
                loadingText: 'ANALYZING...',
                navMode: false,
                currentHoverIndex: -1
            },

            // Device State
            device: {
                width: 0,
                height: 0
            },

            // Screenshot State
            screenshot: {
                base64: '',
                width: 0,
                height: 0
            },

            // Elements State
            elements: [],
            elementCount: 0,

            // XML Source
            xmlSource: '',

            // Config State
            config: {},

            // --- YENİ EKLENEN: RECORDER STATE ---
            recorder: {
                isRecording: false,
                steps: []
            }
        };

        // Subscribers map: { path: [callbacks] }
        this.subscribers = {};
    }

    /**
     * Get state value by path
     * @param {string} path - Dot notation path (e.g., 'ui.platform')
     */
    get(path) {
        return this._getByPath(this.state, path);
    }

    /**
     * Set state value by path
     * @param {string} path - Dot notation path
     * @param {*} value - New value
     */
    set(path, value) {
        const oldValue = this.get(path);

        if (oldValue === value) {
            return; // No change
        }

        this._setByPath(this.state, path, value);
        this._notify(path, value, oldValue);
    }

    /**
     * Subscribe to state changes
     * @param {string} path - Path to watch
     * @param {Function} callback - Callback function (newValue, oldValue)
     */
    subscribe(path, callback) {
        if (!this.subscribers[path]) {
            this.subscribers[path] = [];
        }

        this.subscribers[path].push(callback);

        // Return unsubscribe function
        return () => {
            this.subscribers[path] = this.subscribers[path].filter(cb => cb !== callback);
        };
    }

    /**
     * Notify subscribers of state change
     */
    _notify(path, newValue, oldValue) {
        const callbacks = this.subscribers[path] || [];
        callbacks.forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (error) {
                console.error(`Error in state subscriber for ${path}:`, error);
            }
        });
    }

    /**
     * Get nested property by path
     */
    _getByPath(obj, path) {
        const keys = path.split('.');
        let result = obj;

        for (const key of keys) {
            if (result === undefined || result === null) {
                return undefined;
            }
            result = result[key];
        }

        return result;
    }

    /**
     * Set nested property by path
     */
    _setByPath(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = obj;

        for (const key of keys) {
            if (!(key in target)) {
                target[key] = {};
            }
            target = target[key];
        }

        target[lastKey] = value;
    }

    // ====================
    // RECORDER METHODS (YENİ)
    // ====================

    /**
     * Toggle recording state
     */
    toggleRecording() {
        const isRecording = !this.get('recorder.isRecording');
        this.set('recorder.isRecording', isRecording);
        return isRecording;
    }

    /**
     * Add a recorded step
     */
    addStep(step) {
        const steps = this.get('recorder.steps');
        // Timestamp ve sıra no ekle
        const newStep = {
            ...step,
            id: Date.now(),
            order: steps.length + 1
        };
        steps.push(newStep);
        this.set('recorder.steps', steps);
        console.log("Step Recorded:", newStep);
    }

    /**
     * Clear all steps
     */
    clearSteps() {
        this.set('recorder.steps', []);
    }

    // ====================
    // CONVENIENCE METHODS
    // ====================

    /**
     * Set loading state
     */
    setLoading(isLoading, text = 'ANALYZING...') {
        this.set('ui.isLoading', isLoading);
        this.set('ui.loadingText', text);
    }

    /**
     * Set platform
     */
    setPlatform(platform) {
        this.set('ui.platform', platform);
    }

    /**
     * Set view mode
     */
    setViewMode(mode) {
        this.set('ui.viewMode', mode);
    }

    /**
     * Set nav mode
     */
    setNavMode(enabled) {
        this.set('ui.navMode', enabled);
        document.body.classList.toggle('nav-mode', enabled);
    }

    /**
     * Set hover index
     */
    setHoverIndex(index) {
        this.set('ui.currentHoverIndex', index);
    }

    /**
     * Clear hover
     */
    clearHover() {
        this.set('ui.currentHoverIndex', -1);
    }

    /**
     * Set screenshot data
     */
    setScreenshot(base64, width, height) {
        this.set('screenshot.base64', base64);
        this.set('screenshot.width', width);
        this.set('screenshot.height', height);
        this.set('device.width', width);
        this.set('device.height', height);
    }

    /**
     * Set XML source
     */
    setXmlSource(source) {
        this.set('xmlSource', source);
    }

    /**
     * Add element to state
     */
    addElement(element) {
        const elements = this.get('elements');
        elements.push(element);
        this.set('elementCount', elements.length);
    }

    /**
     * Remove element from state
     */
    removeElement(index) {
        const elements = this.get('elements');
        const element = elements.find(el => el.index === index);

        if (element) {
            element.isDeleted = true;
            this.set('elementCount', this.getActiveElements().length);
        }
    }

    /**
     * Get active (non-deleted) elements
     */
    getActiveElements() {
        const elements = this.get('elements');
        return elements.filter(el => !el.isDeleted);
    }

    /**
     * Reset state (except config)
     */
    reset() {
        this.set('elements', []);
        this.set('elementCount', 0);
        this.set('xmlSource', '');
        this.set('screenshot.base64', '');
        this.set('ui.currentHoverIndex', -1);

        // Hide copy all button
        const copyAllBtn = document.getElementById('copyAllBtn');
        if (copyAllBtn) {
            copyAllBtn.classList.add('hidden', 'opacity-0', 'scale-95');
        }
    }

    /**
     * Get full state (for debugging)
     */
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * Log current state (debug)
     */
    logState() {
        console.log('%c[State Service]', 'color: #ef4444; font-weight: bold');
        console.table(this.getState());
    }
}

// Create singleton instance
const appState = new StateService();

// Export for use in other scripts
window.appState = appState;

// Debug helper
window.debugState = () => appState.logState();