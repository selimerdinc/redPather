/**
 * Settings Manager
 * Handles configuration loading, saving and modal interactions.
 */
class SettingsManager {
    constructor(api, uiManager) {
        this.api = api;
        this.ui = uiManager;
    }

    openModal() {
        document.getElementById('configModal').classList.add('open');
        this.loadConfig();
    }

    closeModal() {
        document.getElementById('configModal').classList.remove('open');
    }

    async loadConfig() {
        try {
            const data = await this.api.getConfig();

            this.setVal('conf_android_pkg', data.ANDROID_PKG);
            this.setVal('conf_android_act', data.ANDROID_ACT);
            this.setVal('conf_android_device', data.ANDROID_DEVICE || 'emulator-5554');
            this.setVal('conf_ios_bundle', data.IOS_BUNDLE);
            this.setVal('conf_ios_device', data.IOS_DEVICE || 'iPhone 14');
            this.setVal('conf_ios_udid', data.IOS_UDID);
            this.setVal('conf_ios_org', data.IOS_ORG_ID);
            this.setVal('conf_ios_sign', data.IOS_SIGN_ID || 'iPhone Developer');

        } catch (error) {
            console.error(error);
            this.ui.showToast("Error", "Failed to load config", "error");
        }
    }

    async saveConfig() {
        const config = {
            ANDROID_PKG: this.getVal('conf_android_pkg'),
            ANDROID_ACT: this.getVal('conf_android_act'),
            ANDROID_DEVICE: this.getVal('conf_android_device'),
            IOS_BUNDLE: this.getVal('conf_ios_bundle'),
            IOS_DEVICE: this.getVal('conf_ios_device'),
            IOS_UDID: this.getVal('conf_ios_udid'),
            IOS_ORG_ID: this.getVal('conf_ios_org'),
            IOS_SIGN_ID: this.getVal('conf_ios_sign'),
        };

        try {
            await this.api.saveConfig(config);
            this.closeModal();
            this.ui.showToast("Saved", "Configuration updated", 'success');
        } catch (error) {
            console.error(error);
            this.ui.showToast("Error", "Failed to save config", "error");
        }
    }

    // Helpers
    setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    }

    getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }
}

window.SettingsManager = SettingsManager;