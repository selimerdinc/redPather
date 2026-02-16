/**
 * Configuration Profiles Manager - Platform Based
 * Android ve iOS için ayrı profil yönetimi
 */

class ConfigProfiles {
    constructor() {
        this.storageKey = 'redpather_profiles_v2';
        this.profiles = [];
        this.init();
    }

    async init() {
        this.observeSettingsModal();
        await this.loadProfilesFromBackend();
        this.hookIntoScanFlow();
        window.debug?.log(`📁 Config Profiles (${this.profiles.length} profiles loaded)`);

        // ✅ YENİ: Başlangıçta profil yoksa hoşgeldin mesajı göster
        if (this.profiles.length === 0) {
            setTimeout(() => {
                window.showInfo?.(
                    "Red Pather'a Hoş Geldiniz! 👋",
                    "Henüz bir profiliniz yok. Hızlıca bir tane oluşturmak ister misiniz?",
                    { text: "Profil Ekle", onClick: "document.getElementById('configModal')?.classList.add('open')" }
                );
            }, 2000);
        }
    }

    async loadProfilesFromBackend() {
        try {
            // First check backend
            const response = await fetch('/api/profiles');
            const result = await response.json();

            // ✅ FIX: Backend returns { status: "success", data: [...] }
            if ((result.status === 'success' || result.success) && result.data && result.data.length > 0) {
                this.profiles = result.data;
                this.updateProfileUI(); // Ensure UI is updated
                return;
            }

            // If backend empty, check localStorage for migration
            window.debug?.log('Backend profiles empty, checking localStorage for migration...');
            const localProfiles = this.loadFromLocalStorage();
            if (localProfiles.length > 0) {
                this.profiles = localProfiles;
                this.updateProfileUI();
                await this.saveProfiles(); // Save to backend
            }
        } catch (e) {
            console.error('Failed to load profiles from backend:', e);
            // Fallback to local storage if backend fails
            this.profiles = this.loadFromLocalStorage();
        }
    }

    loadFromLocalStorage() {
        try {
            // Yeni storage'dan yükle
            let profiles = [];
            const newData = localStorage.getItem(this.storageKey);
            if (newData) {
                profiles = JSON.parse(newData);
            }

            // Eski storage'dan migrate et (redpather_profiles)
            const oldData = localStorage.getItem('redpather_profiles');
            if (oldData) {
                try {
                    const oldProfiles = JSON.parse(oldData);
                    oldProfiles.forEach(old => {
                        if (!profiles.some(p => p.id === old.id)) {
                            const hasIOS = old.config?.IOS_BUNDLE || old.config?.bundle;
                            const migratedProfile = {
                                id: old.id || Date.now().toString(),
                                name: old.name,
                                platform: hasIOS ? 'IOS' : 'ANDROID',
                                icon: old.icon || (hasIOS ? '🍎' : '🤖'),
                                config: hasIOS ? {
                                    bundle: old.config?.IOS_BUNDLE || old.config?.bundle || '',
                                    device: old.config?.IOS_DEVICE || old.config?.device || '',
                                    udid: old.config?.IOS_UDID || old.config?.udid || '',
                                    version: old.config?.IOS_VERSION || old.config?.version || '',
                                    orgId: old.config?.IOS_ORG || old.config?.orgId || '',
                                    signId: old.config?.IOS_SIGN || old.config?.signId || ''
                                } : {
                                    pkg: old.config?.ANDROID_PKG || old.config?.pkg || '',
                                    activity: old.config?.ANDROID_ACT || old.config?.activity || '',
                                    device: old.config?.ANDROID_DEVICE || old.config?.device || ''
                                },
                                createdAt: old.createdAt || new Date().toISOString(),
                                updatedAt: old.updatedAt || new Date().toISOString()
                            };
                            profiles.push(migratedProfile);
                        }
                    });
                } catch (e) { console.error('Migration failed:', e); }
            }
            return profiles;
        } catch (e) { return []; }
    }

    async saveProfiles() {
        // Save to backend
        try {
            await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.profiles)
            });
        } catch (e) {
            console.error('Failed to save profiles to backend:', e);
        }

        // Also keep in localStorage as double backup
        localStorage.setItem(this.storageKey, JSON.stringify(this.profiles));
    }

    getProfilesByPlatform(platform) {
        return this.profiles.filter(p => p.platform === platform);
    }

    // ============================
    // SCAN FLOW HOOK
    // ============================

    hookIntoScanFlow() {
        // Track if profile has been applied this session
        this._profileApplied = false;

        // Store reference to original scan function lazily
        this._originalScan = null;

        // Create a wrapper that captures original on first use
        const captureAndWrap = () => {
            // Lazy capture - get the real scanScreen from AppController
            if (!this._originalScan && window._appScanScreen) {
                this._originalScan = window._appScanScreen;
            }
            return this._originalScan;
        };

        window.scanScreen = async () => {
            const originalScan = captureAndWrap();

            // Eğer profil zaten uygulandıysa, direkt scan yap
            if (this._profileApplied) {
                if (originalScan) return originalScan();
                return;
            }

            const platform = window.appState?.get('ui.platform') || 'ANDROID';
            const profiles = this.getProfilesByPlatform(platform);

            if (profiles.length === 0) {
                // HATA: Hiç profil eklenmemiş! (Kullanıcı dostu mesaj)
                if (window.showError) {
                    window.showError(
                        `${platform} için tanımlı bir profil bulunamadı.`,
                        "Lütfen ayarlardan bir cihaz profili ekleyin.",
                        { text: "Ayarları Aç", onClick: "document.getElementById('configModal')?.classList.add('open')" }
                    );
                } else {
                    alert(`${platform} için tanımlı bir profil bulunamadı. Lütfen ayarlardan profil ekleyin.`);
                }

                // Modal'ı aç ki kullanıcı ekleyebilsin
                document.getElementById('configModal')?.classList.add('open');
                return;
            }

            if (profiles.length === 1) {
                // Tek profil var, otomatik uygula ve devam et
                await this.applyProfileToBackend(profiles[0]);
                this._profileApplied = true;
                if (originalScan) return originalScan();
                return;
            }

            // Birden fazla profil var, seçim modal'ı göster
            return new Promise((resolve) => {
                this.showProfileSelectModal(platform, async (selectedProfile) => {
                    if (selectedProfile) {
                        await this.applyProfileToBackend(selectedProfile);
                        this._profileApplied = true;
                        if (originalScan) resolve(originalScan());
                    } else {
                        resolve();
                    }
                });
            });
        };

        // Also set alias for backward compatibility
        window.scanPage = window.scanScreen;

        // Platform değiştiğinde profil uygulamasını sıfırla
        window.appState?.subscribe('ui.platform', () => {
            this._profileApplied = false;
        });

        // Global reset function for session quit/restart
        window.resetProfileSession = () => {
            this._profileApplied = false;
            window.debug?.log('📌 Profile session reset');
        };
    }


    async applyProfileToBackend(profile) {
        const config = profile.config;

        // Backend'e config gönder
        try {
            const payload = profile.platform === 'ANDROID'
                ? {
                    ANDROID_PKG: config.pkg,
                    ANDROID_ACT: config.activity,
                    ANDROID_DEVICE: config.device
                }
                : {
                    IOS_BUNDLE: config.bundle,
                    IOS_DEVICE: config.device,
                    IOS_UDID: config.udid,
                    IOS_PLATFORM_VER: config.version,
                    IOS_ORG_ID: config.orgId,
                    IOS_SIGN_ID: config.signId
                };

            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Form alanlarını da güncelle
            this.applyProfileToForm(profile);

            window.showSuccess?.(`"${profile.name}" profili uygulandı`);
        } catch (e) {
            console.error('Profile apply failed:', e);
            window.showError?.("Profil Uygulanamadı", e.message || "Bağlantı hatası oluştu.");
        }
    }

    applyProfileToForm(profile) {
        const config = profile.config;
        const setValue = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        if (profile.platform === 'ANDROID') {
            setValue('conf_android_pkg', config.pkg);
            setValue('conf_android_act', config.activity);
            setValue('conf_android_device', config.device);
        } else {
            setValue('conf_ios_bundle', config.bundle);
            setValue('conf_ios_device', config.device);
            setValue('conf_ios_udid', config.udid);
            setValue('conf_ios_version', config.version);
            setValue('conf_ios_org', config.orgId);
            setValue('conf_ios_sign', config.signId);
        }
    }

    // ============================
    // PROFILE SELECT MODAL
    // ============================

    showProfileSelectModal(platform, callback) {
        document.getElementById('profileSelectModal')?.remove();

        const profiles = this.getProfilesByPlatform(platform);
        const platformIcon = platform === 'ANDROID' ? '🤖' : '🍎';
        const platformName = platform === 'ANDROID' ? 'Android' : 'iOS';

        const modal = document.createElement('div');
        modal.id = 'profileSelectModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center';

        modal.innerHTML = `
            <div class="bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-2xl border border-zinc-700/50 w-96 shadow-2xl overflow-hidden">
                <div class="bg-gradient-to-r ${platform === 'ANDROID' ? 'from-emerald-500/20 to-green-500/20' : 'from-blue-500/20 to-indigo-500/20'} p-5 border-b border-zinc-700/50">
                    <div class="flex items-center gap-3">
                        <div class="text-3xl">${platformIcon}</div>
                        <div>
                            <h3 class="text-lg font-bold text-white">${platformName} Profili Seç</h3>
                            <p class="text-xs text-zinc-400">Hangi konfigürasyon ile bağlanmak istiyorsunuz?</p>
                        </div>
                    </div>
                </div>
                
                <div class="p-4 space-y-2 max-h-64 overflow-y-auto">
                    ${profiles.map(p => `
                        <button onclick="configProfiles.selectAndConnect('${p.id}', '${modal.id}')" 
                            class="w-full text-left p-4 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-zinc-600 transition-all group">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <span class="text-xl">${p.icon || platformIcon}</span>
                                    <div>
                                        <h4 class="font-bold text-white text-sm">${p.name}</h4>
                                        <p class="text-[10px] text-zinc-500">${platform === 'ANDROID' ? p.config.pkg : p.config.bundle}</p>
                                    </div>
                                </div>
                                <svg class="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                                </svg>
                            </div>
                        </button>
                    `).join('')}
                </div>
                
                <div class="p-4 bg-zinc-900/50 border-t border-zinc-700/50">
                    <button onclick="document.getElementById('profileSelectModal').remove(); configProfiles._selectCallback?.(null)" 
                        class="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl transition-colors text-sm">
                        İptal (Mevcut Ayarlarla Devam)
                    </button>
                </div>
            </div>
        `;

        this._selectCallback = callback;
        document.body.appendChild(modal);
    }

    selectAndConnect(profileId, modalId) {
        const profile = this.profiles.find(p => p.id === profileId);
        document.getElementById(modalId)?.remove();

        if (this._selectCallback) {
            this._selectCallback(profile);
            this._selectCallback = null;
        }
    }

    // ============================
    // CREATE PROFILE MODAL
    // ============================

    showCreateModal() {
        document.getElementById('createProfileModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'createProfileModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-md z-[10000] flex items-center justify-center animate-in fade-in duration-300';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="glass border border-white/10 w-[440px] rounded-[32px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden scale-in animate-in zoom-in-95 duration-300">
                <div class="bg-gradient-to-br from-indigo-500/10 to-transparent p-7 border-b border-white/5">
                    <h3 class="text-base font-black text-white uppercase tracking-wider">Yeni Profil Oluştur</h3>
                    <p class="text-xs text-zinc-500 mt-1 font-medium">Bağlantı parametrelerini tanımlayın</p>
                </div>
                
                <div class="p-7 space-y-6">
                    <!-- Platform Selection -->
                    <div>
                        <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-3 block">Platform Seçimi</label>
                        <div class="grid grid-cols-2 gap-3">
                            <button type="button" onclick="configProfiles.setPlatform('ANDROID')" id="platformAndroid"
                                class="platform-btn p-4 rounded-2xl border border-emerald-500/30 transition-all bg-emerald-500/10 text-emerald-400 group">
                                <div class="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">🤖</div>
                                <div class="text-[11px] font-black uppercase tracking-widest">Android</div>
                            </button>
                            <button type="button" onclick="configProfiles.setPlatform('IOS')" id="platformIOS"
                                class="platform-btn p-4 rounded-2xl border border-white/5 transition-all bg-white/5 text-zinc-500 hover:border-blue-500/30 group">
                                <div class="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">🍎</div>
                                <div class="text-[11px] font-black uppercase tracking-widest">iOS</div>
                            </button>
                        </div>
                        <input type="hidden" id="selectedPlatform" value="ANDROID">
                    </div>
                    
                    <!-- Profile Name -->
                    <div>
                        <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-3 block">Profil İsmi</label>
                        <input type="text" id="newProfileName" placeholder="Örn: Müşteri Deneyimi Uygulaması" 
                            class="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-2xl text-white text-[13px] focus:border-violet-500/50 focus:ring-4 focus:ring-violet-500/5 outline-none transition-all">
                    </div>
                    
                    <!-- Form Content -->
                    <div id="androidFields" class="space-y-4">
                        <div class="grid grid-cols-1 gap-4">
                            <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">📦 Uygulama Paketi</label>
                                <input type="text" id="profile_android_pkg" placeholder="com.app.example" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-emerald-500/50 outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">🎯 Başlangıç Aktivitesi</label>
                                <input type="text" id="profile_android_act" placeholder=".MainActivity" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-emerald-500/50 outline-none transition-all">
                            </div>
                             <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">📱 Cihaz Kimliği (ADB)</label>
                                <input type="text" id="profile_android_device" placeholder="emulator-5554" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-emerald-500/50 outline-none transition-all">
                            </div>
                        </div>
                    </div>
                    
                    <div id="iosFields" class="hidden space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">📦 Bundle ID</label>
                                <input type="text" id="profile_ios_bundle" placeholder="com.company.app" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-blue-500/50 outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">📱 Cihaz</label>
                                <input type="text" id="profile_ios_device" placeholder="iPhone 15" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-blue-500/50 outline-none transition-all">
                            </div>
                        </div>
                        <div>
                            <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">🔑 UDID</label>
                            <input type="text" id="profile_ios_udid" placeholder="00008110-000C14..." 
                                class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-blue-500/50 outline-none transition-all font-mono">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">📲 iOS Version</label>
                                <input type="text" id="profile_ios_version" placeholder="17.0" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-blue-500/50 outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">🏢 Xcode Org ID</label>
                                <input type="text" id="profile_ios_org" placeholder="TEAM_ID" 
                                    class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-blue-500/50 outline-none transition-all">
                            </div>
                        </div>
                        <div>
                            <label class="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-2 block">🔐 Sertifika ID</label>
                            <input type="text" id="profile_ios_sign" placeholder="Apple Development: ..." 
                                class="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-white text-xs focus:border-blue-500/50 outline-none transition-all">
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-4 p-7 bg-black/40 border-t border-white/5">
                    <button onclick="document.getElementById('createProfileModal').remove()" 
                        class="flex-1 px-4 py-3.5 bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest border border-white/5">
                        İptal
                    </button>
                    <button onclick="configProfiles.confirmCreate()" 
                        class="flex-1 px-4 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest shadow-xl shadow-violet-900/20 active:scale-[0.98]">
                        Kaydet
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('newProfileName').focus();
    }

    setPlatform(platform) {
        document.getElementById('selectedPlatform').value = platform;

        const androidBtn = document.getElementById('platformAndroid');
        const iosBtn = document.getElementById('platformIOS');
        const androidFields = document.getElementById('androidFields');
        const iosFields = document.getElementById('iosFields');

        if (platform === 'ANDROID') {
            androidBtn.className = 'platform-btn p-3 rounded-xl border-2 transition-all bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
            iosBtn.className = 'platform-btn p-3 rounded-xl border-2 transition-all bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600';
            androidFields.classList.remove('hidden');
            iosFields.classList.add('hidden');
        } else {
            iosBtn.className = 'platform-btn p-3 rounded-xl border-2 transition-all bg-blue-500/10 border-blue-500/50 text-blue-400';
            androidBtn.className = 'platform-btn p-3 rounded-xl border-2 transition-all bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600';
            iosFields.classList.remove('hidden');
            androidFields.classList.add('hidden');
        }
    }

    confirmCreate() {
        const name = document.getElementById('newProfileName')?.value.trim();
        const platform = document.getElementById('selectedPlatform')?.value;

        if (!name) {
            window.showError?.('Profil adı gerekli');
            return;
        }

        let config, icon;

        if (platform === 'ANDROID') {
            config = {
                pkg: document.getElementById('profile_android_pkg')?.value || '',
                activity: document.getElementById('profile_android_act')?.value || '',
                device: document.getElementById('profile_android_device')?.value || ''
            };
            icon = '🤖';
        } else {
            config = {
                bundle: document.getElementById('profile_ios_bundle')?.value || '',
                device: document.getElementById('profile_ios_device')?.value || '',
                udid: document.getElementById('profile_ios_udid')?.value || '',
                version: document.getElementById('profile_ios_version')?.value || '',
                orgId: document.getElementById('profile_ios_org')?.value || '',
                signId: document.getElementById('profile_ios_sign')?.value || ''
            };
            icon = '🍎';
        }

        const profile = {
            id: Date.now().toString(),
            name,
            platform,
            icon,
            config,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.profiles.push(profile);
        this.saveProfiles();

        document.getElementById('createProfileModal')?.remove();
        window.showSuccess?.(`"${name}" profili oluşturuldu`);
        this.updateProfileUI();
    }

    deleteProfile(profileId) {
        const index = this.profiles.findIndex(p => p.id === profileId);
        if (index === -1) return;

        const name = this.profiles[index].name;
        this.profiles.splice(index, 1);
        this.saveProfiles();

        window.showSuccess?.(`"${name}" silindi`);
        this.updateProfileUI();
    }

    // ============================
    // EDIT PROFILE
    // ============================

    showEditModal(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;

        document.getElementById('editProfileModal')?.remove();

        const platformIcon = profile.platform === 'ANDROID' ? '🤖' : '🍎';
        const platformName = profile.platform === 'ANDROID' ? 'Android' : 'iOS';
        const color = profile.platform === 'ANDROID' ? 'emerald' : 'blue';

        const modal = document.createElement('div');
        modal.id = 'editProfileModal';
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[10000] flex items-center justify-center';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-2xl border border-zinc-700/50 w-[420px] shadow-2xl overflow-hidden">
                <!-- Header -->
                <div class="bg-gradient-to-r ${profile.platform === 'ANDROID' ? 'from-emerald-500/20 to-green-500/20' : 'from-blue-500/20 to-indigo-500/20'} p-5 border-b border-zinc-700/50">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-${color}-500/20 border border-${color}-500/30 flex items-center justify-center text-2xl">
                            ${profile.icon || platformIcon}
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white">${profile.name}</h3>
                            <p class="text-xs text-${color}-400">${platformName} Profili</p>
                        </div>
                    </div>
                </div>
                
                <!-- Form -->
                <div class="p-5 space-y-4">
                    <div>
                        <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-2 block">Profil Adı</label>
                        <input type="text" id="edit_profile_name" value="${profile.name}"
                            class="w-full px-4 py-2.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-white text-sm focus:border-${color}-500 focus:ring-2 focus:ring-${color}-500/20 outline-none transition-all">
                    </div>
                    
                    ${profile.platform === 'ANDROID' ? `
                        <div class="space-y-3">
                            <div>
                                <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">📦 Paket Adı</label>
                                <input type="text" id="edit_android_pkg" value="${profile.config.pkg || ''}"
                                    class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">🎯 Aktivite</label>
                                <input type="text" id="edit_android_act" value="${profile.config.activity || ''}"
                                    class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-emerald-500 outline-none">
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">📱 Cihaz Adı</label>
                                <input type="text" id="edit_android_device" value="${profile.config.device || ''}"
                                    class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-emerald-500 outline-none">
                            </div>
                        </div>
                    ` : `
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">📦 Bundle ID</label>
                                    <input type="text" id="edit_ios_bundle" value="${profile.config.bundle || ''}"
                                        class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-blue-500 outline-none">
                                </div>
                                <div>
                                    <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">📱 Cihaz</label>
                                    <input type="text" id="edit_ios_device" value="${profile.config.device || ''}"
                                        class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-blue-500 outline-none">
                                </div>
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">🔑 UDID</label>
                                <input type="text" id="edit_ios_udid" value="${profile.config.udid || ''}"
                                    class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-blue-500 outline-none">
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">📲 iOS Version</label>
                                    <input type="text" id="edit_ios_version" value="${profile.config.version || ''}"
                                        class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-blue-500 outline-none">
                                </div>
                                <div>
                                    <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">🏢 Xcode Org ID</label>
                                    <input type="text" id="edit_ios_org" value="${profile.config.orgId || ''}"
                                        class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-blue-500 outline-none">
                                </div>
                            </div>
                            <div>
                                <label class="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-1 block">🔐 Sertifika ID</label>
                                <input type="text" id="edit_ios_sign" value="${profile.config.signId || ''}"
                                    class="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-700 rounded-lg text-white text-xs focus:border-blue-500 outline-none">
                            </div>
                        </div>
                    `}
                </div>
                
                <!-- Actions -->
                <div class="flex gap-2 p-4 bg-zinc-900/50 border-t border-zinc-700/50">
                    <button onclick="document.getElementById('editProfileModal').remove()" 
                        class="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors text-sm font-medium">
                        İptal
                    </button>
                    <button onclick="configProfiles.saveEdit('${profile.id}')" 
                        class="flex-1 px-4 py-2.5 bg-gradient-to-r from-${color}-500 to-${color === 'emerald' ? 'green' : 'indigo'}-600 hover:opacity-90 text-white rounded-xl transition-all text-sm font-bold shadow-lg">
                        💾 Kaydet
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    saveEdit(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;

        // Update name
        const newName = document.getElementById('edit_profile_name')?.value.trim();
        if (newName) profile.name = newName;

        // Update config based on platform
        if (profile.platform === 'ANDROID') {
            profile.config = {
                pkg: document.getElementById('edit_android_pkg')?.value || '',
                activity: document.getElementById('edit_android_act')?.value || '',
                device: document.getElementById('edit_android_device')?.value || ''
            };
        } else {
            profile.config = {
                bundle: document.getElementById('edit_ios_bundle')?.value || '',
                device: document.getElementById('edit_ios_device')?.value || '',
                udid: document.getElementById('edit_ios_udid')?.value || '',
                version: document.getElementById('edit_ios_version')?.value || '',
                orgId: document.getElementById('edit_ios_org')?.value || '',
                signId: document.getElementById('edit_ios_sign')?.value || ''
            };
        }

        profile.updatedAt = new Date().toISOString();
        this.saveProfiles();

        document.getElementById('editProfileModal')?.remove();
        window.showSuccess?.(`"${profile.name}" güncellendi`);
        this.updateProfileUI();
    }

    // ============================
    // SETTINGS MODAL UI
    // ============================

    observeSettingsModal() {
        const setupObserver = () => {
            const modal = document.getElementById('configModal');
            if (!modal) {
                setTimeout(() => setupObserver(), 500);
                return;
            }

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (modal.classList.contains('open') && !document.getElementById('profileSection')) {
                            setTimeout(() => this.injectProfileUI(), 50);
                        }
                    }
                });
            });

            observer.observe(modal, { attributes: true });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupObserver);
        } else {
            setupObserver();
        }
    }

    injectProfileUI() {
        const modalContent = document.querySelector('#configModal .modal-box > .flex');
        if (!modalContent || document.getElementById('profileSection')) return;

        const section = document.createElement('div');
        section.id = 'profileSection';
        section.className = 'mb-5';
        section.innerHTML = `
            <div class="bg-gradient-to-br from-violet-500/5 via-indigo-500/10 to-purple-500/5 rounded-2xl border border-indigo-500/20 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 bg-indigo-500/5 border-b border-indigo-500/10">
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                            </svg>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-white">Proje Profilleri</h4>
                            <p class="text-[9px] text-indigo-300/60">Platform bazlı konfigürasyonlar</p>
                        </div>
                    </div>
                    <button onclick="configProfiles.showCreateModal()" 
                        class="flex items-center gap-1.5 text-[10px] px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-all hover:scale-105 border border-indigo-500/20">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        Yeni Profil
                    </button>
                </div>
                
                <div id="profileList" class="p-3">
                    ${this.renderProfileList()}
                </div>
            </div>
        `;

        const headerDiv = modalContent.querySelector('.border-b');
        if (headerDiv && headerDiv.nextSibling) {
            headerDiv.parentNode.insertBefore(section, headerDiv.nextSibling);
        }
    }

    renderProfileList() {
        const androidProfiles = this.getProfilesByPlatform('ANDROID');
        const iosProfiles = this.getProfilesByPlatform('IOS');

        if (this.profiles.length === 0) {
            return `
                <div class="text-center py-10 px-6">
                    <div class="relative w-24 h-24 mx-auto mb-6">
                        <div class="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"></div>
                        <div class="relative w-full h-full rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center shadow-2xl">
                            <svg class="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path>
                            </svg>
                        </div>
                    </div>
                    <h5 class="text-white font-bold text-sm mb-2">Henüz Profil Tanımlanmadı</h5>
                    <p class="text-[11px] text-zinc-500 mb-6 leading-relaxed">
                        Cihaz bağlantısı kurmak ve tarama yapabilmek için en az bir profil eklemelisiniz.
                    </p>
                    <button onclick="configProfiles.showCreateModal()" 
                        class="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl transition-all text-xs font-bold shadow-lg shadow-indigo-500/25 active:scale-95">
                        İLK PROFİLİNİ OLUŞTUR
                    </button>
                </div>
            `;
        }

        let html = '';

        if (androidProfiles.length > 0) {
            html += this.renderPlatformSection('ANDROID', '🤖', 'Android', androidProfiles, 'emerald');
        }

        if (iosProfiles.length > 0) {
            if (androidProfiles.length > 0) html += '<div class="h-3"></div>';
            html += this.renderPlatformSection('IOS', '🍎', 'iOS', iosProfiles, 'blue');
        }

        return html;
    }

    renderPlatformSection(platform, icon, name, profiles, color) {
        return `
            <div class="mb-2">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm">${icon}</span>
                    <span class="text-[10px] font-bold text-${color}-400 uppercase tracking-wider">${name} (${profiles.length})</span>
                </div>
                <div class="space-y-1.5">
                    ${profiles.map(p => this.renderProfileCard(p, color)).join('')}
                </div>
            </div>
        `;
    }

    renderProfileCard(profile, color) {
        const identifier = profile.platform === 'ANDROID' ? profile.config.pkg : profile.config.bundle;

        return `
            <div class="group flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/70 border border-zinc-700/30 hover:border-${color}-500/30 transition-all">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center text-sm shrink-0">
                        ${profile.icon}
                    </div>
                    <div class="min-w-0">
                        <h5 class="text-xs font-bold text-white truncate">${profile.name}</h5>
                        <p class="text-[9px] text-zinc-500 truncate">${identifier || 'Boş'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="configProfiles.showEditModal('${profile.id}')" 
                        class="p-1.5 text-zinc-500 hover:text-yellow-400 transition-colors" title="Düzenle">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                    <button onclick="configProfiles.applyProfileToForm(configProfiles.profiles.find(p=>p.id==='${profile.id}'))" 
                        class="p-1.5 text-zinc-500 hover:text-${color}-400 transition-colors" title="Uygula">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                    </button>
                    <button onclick="configProfiles.deleteProfile('${profile.id}')" 
                        class="p-1.5 text-zinc-500 hover:text-red-400 transition-colors" title="Sil">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    updateProfileUI() {
        const list = document.getElementById('profileList');
        if (list) {
            list.innerHTML = this.renderProfileList();
        }
    }
}

// Create singleton
const configProfiles = new ConfigProfiles();
window.configProfiles = configProfiles;
