/**
 * Frontend Constants
 */

export const API = {
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 2,
    RETRY_DELAY: 1000
};

export const UI = {
    TOAST_DURATION: 3500,
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 150
};

export const CACHE = {
    MAX_SIZE: 10,
    SCREENSHOT_QUALITY: 60
};

export const ELEMENT = {
    BOUNDS_TOLERANCE: 15,
    MIN_WIDTH: 10,
    MIN_HEIGHT: 10
};

export const PLATFORM = {
    ANDROID: 'ANDROID',
    IOS: 'IOS'
};

export const VIEW_MODE = {
    LIST: 'list',
    SOURCE: 'source'
};

export const STRATEGY_COLORS = {
    ID: 'bg-blue-900/30 text-blue-400 border-blue-800',
    ACC_ID: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
    ANCHOR: 'bg-pink-900/30 text-pink-400 border-pink-800',
    TEXT: 'bg-purple-900/30 text-purple-400 border-purple-800',
    DEFAULT: 'bg-gray-800 text-gray-400 border-gray-700'
};

export const TOAST_ICONS = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
};

export const KEYBOARD_SHORTCUTS = {
    SCAN: 'KeyS',
    BACK: 'KeyB',
    REFRESH: 'KeyR',
    COPY_ALL: 'KeyC',
    TOGGLE_NAV: 'KeyN',
    ESCAPE: 'Escape',
    ENTER: 'Enter'
};