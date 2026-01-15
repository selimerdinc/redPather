/**
 * Frontend Constants
 * Global window object üzerinden erişilebilir
 */

const API = {
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 2,
    RETRY_DELAY: 1000
};

const UI = {
    TOAST_DURATION: 3500,
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 150,
    DEBUG: false // Set to true for development logging
};

// Debounce utility function
function debounce(fn, delay) {
    let timerId;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Debug-aware console.log wrapper
const debug = {
    log: (...args) => { if (UI.DEBUG) console.log(...args); },
    warn: (...args) => { if (UI.DEBUG) console.warn(...args); },
    error: (...args) => console.error(...args) // Always show errors
};

const CACHE = {
    MAX_SIZE: 10,
    SCREENSHOT_QUALITY: 60
};

const ELEMENT = {
    BOUNDS_TOLERANCE: 15,
    MIN_WIDTH: 10,
    MIN_HEIGHT: 10
};

const PLATFORM = {
    ANDROID: 'ANDROID',
    IOS: 'IOS'
};

const VIEW_MODE = {
    LIST: 'list',
    SOURCE: 'source'
};

const STRATEGY_COLORS = {
    ID: 'bg-blue-900/30 text-blue-400 border-blue-800',
    ACC_ID: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
    ANCHOR: 'bg-pink-900/30 text-pink-400 border-pink-800',
    TEXT: 'bg-purple-900/30 text-purple-400 border-purple-800',
    DEFAULT: 'bg-gray-800 text-gray-400 border-gray-700'
};

const TOAST_ICONS = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
};

// Global erişim için window nesnesine ekle
window.CONSTANTS = {
    API,
    UI,
    CACHE,
    ELEMENT,
    PLATFORM,
    VIEW_MODE,
    STRATEGY_COLORS,
    TOAST_ICONS
};

// Export utilities globally
window.debounce = debounce;
window.debug = debug;