/**
 * Dockit Settings Sync Engine
 * Coordinates cloud synchronization, debouncing, lock management, and realtime sync updates.
 */

class SettingsSyncEngine {
    constructor() {
        this.syncKeys = [
            'sites',
            'autoHideEnabled',
            'showCategoryIcons',
            'scrollBlocklist',
            'sidepanelBlocklist',
            'autoHideBlocklist',
            'customTheme',
            'enableTaper',
            'sidebarWidth',
            'siteModePrefs'
        ];
        
        this.isSyncInProgress = false;
        this.debounceTimeout = null;
        this.unsubscribeRealtime = null;
        this.onUserStatusChangedCallback = null;
    }

    /**
     * Initialize synchronization loop
     */
    async init(onUserStatusChanged = null) {
        this.onUserStatusChangedCallback = onUserStatusChanged;
        
        // Initialize the base Appwrite Service
        await window.appwriteService.init();

        // Register storage watcher for local changes
        chrome.storage.onChanged.addListener(this.handleLocalStorageChanged.bind(this));

        // Start initial synchronization if logged in
        if (window.appwriteService.currentUser) {
            await this.performInitialSync();
            this.startRealtimeListener();
        }

        // Flush pending changes when the sidebar window unloads (is closed)
        window.addEventListener('pagehide', () => {
            this.flushPendingSync();
        });

        if (this.onUserStatusChangedCallback) {
            this.onUserStatusChangedCallback(window.appwriteService.currentUser);
        }
    }

    /**
     * Activate settings synchronization loop upon login
     */
    async activateSyncForUser() {
        if (!window.appwriteService.currentUser) return;
        
        console.log("🚀 [SyncEngine] Activating synchronization loop for user...");
        await this.performInitialSync();
        this.startRealtimeListener();
    }

    /**
     * Start Google or Microsoft Authentication
     */
    async login(provider) {
        try {
            if (provider === 'google') {
                window.appwriteService.loginGoogle();
            } else if (provider === 'microsoft') {
                window.appwriteService.loginMicrosoft();
            } else if (provider === 'apple') {
                window.appwriteService.loginApple();
            }
        } catch (err) {
            console.error("❌ [SyncEngine] Authentication start failed:", err);
        }
    }

    /**
     * Logout and disable syncing
     */
    async logout() {
        this.stopRealtimeListener();
        await window.appwriteService.logout();
        
        if (this.onUserStatusChangedCallback) {
            this.onUserStatusChangedCallback(null);
        }
    }

    /**
     * Run Last-Write-Wins (LWW) Initial Sync
     */
    async performInitialSync() {
        if (!window.appwriteService.currentUser || this.isSyncInProgress) return;

        this.isSyncInProgress = true;
        console.log("🔄 [SyncEngine] Starting initial synchronization...");

        try {
            // Fetch local settings state
            const localData = await this._getLocalSyncData();
            const cloudData = await window.appwriteService.fetchCloudSettings();

            if (!cloudData) {
                // Cloud is empty, push local state to initialize cloud
                console.log("☁️ [SyncEngine] Cloud is empty. Initializing cloud with local settings.");
                await window.appwriteService.pushSettingsToCloud(localData.settings);
                
                const nowIso = new Date().toISOString();
                await this._setLocalSyncTimestamps(nowIso, nowIso);
            } else {
                // Determine newer state based on Last-Write-Wins (LWW)
                const localTime = new Date(localData.lastUpdated || 0).getTime();
                const cloudTime = new Date(cloudData.updatedAt).getTime();

                if (cloudTime > localTime) {
                    console.log("📥 [SyncEngine] Cloud settings are newer. Pulling cloud changes.");
                    await this._applyCloudSettingsToLocal(cloudData.settings, cloudData.updatedAt);
                } else if (localTime > cloudTime) {
                    console.log("📤 [SyncEngine] Local settings are newer. Pushing local changes to cloud.");
                    await window.appwriteService.pushSettingsToCloud(localData.settings);
                    await this._setLocalSyncTimestamps(localData.lastUpdated, cloudData.updatedAt);
                } else {
                    console.log("✔ [SyncEngine] Local and Cloud settings are in sync.");
                    await this._setLocalSyncTimestamps(localData.lastUpdated, cloudData.updatedAt);
                }
            }
        } catch (error) {
            console.error("❌ [SyncEngine] Initial sync error:", error);
        } finally {
            this.isSyncInProgress = false;
        }
    }

    /**
     * Start WebSocket listner for instant updates from other browsers
     */
    startRealtimeListener() {
        this.stopRealtimeListener();

        if (!window.appwriteService.currentUser) return;

        console.log("📡 [SyncEngine] Activating realtime settings synchronization socket...");
        this.unsubscribeRealtime = window.appwriteService.subscribeToSettings(async (cloudData) => {
            if (this.isSyncInProgress) return;

            this.isSyncInProgress = true;
            console.log("📥 [SyncEngine] Realtime remote change received. Overwriting local storage.");
            try {
                await this._applyCloudSettingsToLocal(cloudData.settings, cloudData.updatedAt);
            } catch (err) {
                console.error("❌ [SyncEngine] Realtime sync apply error:", err);
            } finally {
                this.isSyncInProgress = false;
            }
        });
    }

    /**
     * Stop WebSocket listener
     */
    stopRealtimeListener() {
        if (this.unsubscribeRealtime) {
            this.unsubscribeRealtime();
            this.unsubscribeRealtime = null;
            console.log("📡 [SyncEngine] Stopped realtime socket listener.");
        }
    }

    /**
     * Handle local chrome.storage changes
     */
    async handleLocalStorageChanged(changes, areaName) {
        if (areaName !== 'local' || this.isSyncInProgress) return;
        if (!window.appwriteService.currentUser) return;

        // Check if any of the modified keys are in our synced set
        const hasSyncableChanges = Object.keys(changes).some(key => this.syncKeys.includes(key));
        if (!hasSyncableChanges) return;

        // Mark local settings timestamp as dirty (changed right now)
        const nowIso = new Date().toISOString();
        chrome.storage.local.set({ settings_last_updated: nowIso });

        // Debounce cloud push to prevent constant DB writes during sliding sidebar adjustments or typings
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }

        this.debounceTimeout = setTimeout(async () => {
            if (this.isSyncInProgress) return;
            this.isSyncInProgress = true;
            console.log("📤 [SyncEngine] Local change detected. Debouncing sync to cloud...");

            try {
                const localData = await this._getLocalSyncData();
                const success = await window.appwriteService.pushSettingsToCloud(localData.settings);
                if (success) {
                    const nowPushIso = new Date().toISOString();
                    await this._setLocalSyncTimestamps(nowPushIso, nowPushIso);
                }
            } catch (err) {
                console.error("❌ [SyncEngine] Debounced cloud update failed:", err);
            } finally {
                this.isSyncInProgress = false;
            }
        }, 1500); // 1.5 second debounce delay
    }

    // =========================================================================
    // Local Storage Helpers
    // =========================================================================

    /**
     * Fetch syncable keys and timestamps from chrome.storage
     */
    async _getLocalSyncData() {
        return new Promise((resolve) => {
            chrome.storage.local.get([...this.syncKeys, 'settings_last_updated'], (result) => {
                const settings = {};
                this.syncKeys.forEach(key => {
                    if (result[key] !== undefined) {
                        settings[key] = result[key];
                    }
                });
                resolve({
                    settings,
                    lastUpdated: result.settings_last_updated || null
                });
            });
        });
    }

    /**
     * Set persistent timestamp bookmarks
     */
    async _setLocalSyncTimestamps(lastUpdated, lastSynced) {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                settings_last_updated: lastUpdated,
                settings_last_synced: lastSynced
            }, resolve);
        });
    }

    /**
     * Apply pulled cloud payload directly to chrome.storage
     */
    async _applyCloudSettingsToLocal(settings, cloudUpdatedAt) {
        return new Promise((resolve) => {
            const toSet = { ...settings };
            toSet.settings_last_updated = cloudUpdatedAt;
            toSet.settings_last_synced = cloudUpdatedAt;

            chrome.storage.local.set(toSet, () => {
                console.log("✔ [SyncEngine] Local storage overwritten with remote changes.");
                resolve();
            });
        });
    }

    /**
     * Force immediate upload of any pending debounced changes
     */
    async flushPendingSync() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;

            if (this.isSyncInProgress || !window.appwriteService.currentUser) return;

            this.isSyncInProgress = true;
            console.log("📤 [SyncEngine] Flushing pending changes immediately to cloud...");

            try {
                const localData = await this._getLocalSyncData();
                const success = await window.appwriteService.pushSettingsToCloud(localData.settings);
                if (success) {
                    const nowPushIso = new Date().toISOString();
                    await this._setLocalSyncTimestamps(nowPushIso, nowPushIso);
                }
            } catch (err) {
                console.error("❌ [SyncEngine] Forced sync flush failed:", err);
            } finally {
                this.isSyncInProgress = false;
            }
        }
    }

    /**
     * Get active logged in user session
     */
    getCurrentUser() {
        return window.appwriteService.currentUser;
    }

    /**
     * Manually trigger forced settings synchronization
     */
    async triggerForceSync() {
        await this.performInitialSync();
    }
}

// Instantiate globally
window.settingsSyncEngine = new SettingsSyncEngine();
