/**
 * Dockit Cloud Integration (Amalgamated Appwrite Service & Settings Sync Engine)
 * Manages OAuth sessions, profiles, settings synchronization, Theme Store, and .env loading.
 */

// Intercept console.error to silence/redirect Appwrite SDK Realtime disconnect logs to console.warn
const originalConsoleError = console.error;
console.error = function (...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('Realtime got disconnected')) {
        console.warn(...args);
        return;
    }
    originalConsoleError.apply(console, args);
};

// Recursive helper to clean base64 data URIs from payload to prevent Appwrite size-limit 500 errors
function stripBase64FromObject(value) {
    if (typeof value === 'string' && value.startsWith('data:') && value.includes(';base64,')) {
        return "";
    }
    if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
            return value.map(item => stripBase64FromObject(item));
        } else {
            const cleaned = {};
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    cleaned[key] = stripBase64FromObject(value[key]);
                }
            }
            return cleaned;
        }
    }
    return value;
}

const APPWRITE_CONFIG = {
    endpoint: "",
    projectId: "",
    databaseId: "",
    collections: {
        profiles: "",
        userSettings: "",
        themes: "",
        themeLikes: ""
    },
    buckets: {
        themeAssets: ""
    }
};

class AppwriteService {
    constructor() {
        this.client = null;
        this.account = null;
        this.databases = null;
        this.storage = null;
        this.currentUser = null;
        this.deviceSignature = null;
        this.initialized = false;
    }

    /**
     * Load environment variables from .env file packaged in the extension
     */
    async _loadEnvConfig() {
        const fallbacks = {
            endpoint: "https://nyc.cloud.appwrite.io/v1",
            projectId: "6a0a1cc000178886bfaf",
            databaseId: "dockit_db",
            collections: {
                profiles: "profiles",
                userSettings: "user_settings",
                themes: "themes",
                themeLikes: "theme_likes"
            },
            buckets: {
                themeAssets: "theme-assets"
            }
        };

        try {
            const url = chrome.runtime.getURL('.env');
            const response = await fetch(url);
            const text = await response.text();
            
            // Parse .env format
            const env = {};
            const lines = text.split(/\r?\n/);
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) continue;
                
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    let value = parts.slice(1).join('=').trim();
                    if ((value.startsWith('"') && value.endsWith('"')) || 
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.substring(1, value.length - 1);
                    }
                    env[key] = value;
                }
            }

            // Map variables
            APPWRITE_CONFIG.endpoint = env.APPWRITE_ENDPOINT || fallbacks.endpoint;
            APPWRITE_CONFIG.projectId = env.APPWRITE_PROJECT_ID || fallbacks.projectId;
            APPWRITE_CONFIG.databaseId = env.APPWRITE_DATABASE_ID || fallbacks.databaseId;
            APPWRITE_CONFIG.collections.profiles = env.APPWRITE_COLLECTION_PROFILES || fallbacks.collections.profiles;
            APPWRITE_CONFIG.collections.userSettings = env.APPWRITE_COLLECTION_USER_SETTINGS || fallbacks.collections.userSettings;
            APPWRITE_CONFIG.collections.themes = env.APPWRITE_COLLECTION_THEMES || fallbacks.collections.themes;
            APPWRITE_CONFIG.collections.themeLikes = env.APPWRITE_COLLECTION_THEME_LIKES || fallbacks.collections.themeLikes;
            APPWRITE_CONFIG.buckets.themeAssets = env.APPWRITE_BUCKET_THEME_ASSETS || fallbacks.buckets.themeAssets;

            console.log("🔒 [AppwriteService] Environment configuration loaded from .env.");
        } catch (error) {
            console.warn("⚠️ [AppwriteService] Failed to load .env configuration, using fallbacks:", error);
            
            // Apply all fallbacks
            APPWRITE_CONFIG.endpoint = fallbacks.endpoint;
            APPWRITE_CONFIG.projectId = fallbacks.projectId;
            APPWRITE_CONFIG.databaseId = fallbacks.databaseId;
            APPWRITE_CONFIG.collections.profiles = fallbacks.collections.profiles;
            APPWRITE_CONFIG.collections.userSettings = fallbacks.collections.userSettings;
            APPWRITE_CONFIG.collections.themes = fallbacks.collections.themes;
            APPWRITE_CONFIG.collections.themeLikes = fallbacks.collections.themeLikes;
            APPWRITE_CONFIG.buckets.themeAssets = fallbacks.buckets.themeAssets;
        }
    }

    /**
     * Initialize the Appwrite Client and services
     */
    async init() {
        if (this.initialized) return;

        try {
            if (typeof window.Appwrite === 'undefined') {
                throw new Error("Appwrite SDK is not loaded. Ensure libs/appwrite.js is included before cloud.js");
            }

            // Load configuration variables from .env
            await this._loadEnvConfig();

            this.client = new window.Appwrite.Client();
            this.client
                .setEndpoint(APPWRITE_CONFIG.endpoint)
                .setProject(APPWRITE_CONFIG.projectId);

            this.account = new window.Appwrite.Account(this.client);
            this.databases = new window.Appwrite.Databases(this.client);
            this.storage = new window.Appwrite.Storage(this.client);

            // Set up or fetch unique Device Signature
            this.deviceSignature = await this._getOrCreateDeviceSignature();

            // Try to resolve current session
            await this.resolveUserSession();

            this.initialized = true;
            console.log("🚀 [AppwriteService] Successfully initialized.", {
                userId: this.currentUser ? this.currentUser.$id : "Guest",
                deviceSignature: this.deviceSignature
            });
        } catch (error) {
            console.error("❌ [AppwriteService] Initialization failed:", error);
        }
    }

    /**
     * Get or create a persistent device signature to avoid self-syncing loops
     */
    async _getOrCreateDeviceSignature() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["device_signature"], (result) => {
                if (result.device_signature) {
                    resolve(result.device_signature);
                } else {
                    const signature = "device_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
                    chrome.storage.local.set({ device_signature: signature }, () => {
                        resolve(signature);
                    });
                }
            });
        });
    }

    /**
     * Resolve active user session
     */
    async resolveUserSession() {
        try {
            this.currentUser = await this.account.get();
            // Programmatically upsert user profile doc in DB if logged in
            const profile = await this._syncUserProfile();
            if (profile) {
                this.currentUser.profile = profile;
            }
            return this.currentUser;
        } catch (error) {
            this.currentUser = null;
            return null;
        }
    }

    /**
     * Ensure user profile exists in database
     */
    async _syncUserProfile() {
        if (!this.currentUser) return null;
        const profileId = this.currentUser.$id;
        try {
            const doc = await this.databases.getDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.profiles,
                profileId
            );
            return doc;
        } catch (error) {
            // Treat 404 or authorization failures (which act as 404 due to document security) defensively
            try {
                const doc = await this.databases.createDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.profiles,
                    profileId,
                    {
                        displayName: this.currentUser.name || this.currentUser.email.split('@')[0],
                        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(profileId)}`,
                        createdAt: new Date().toISOString()
                    },
                    [
                        'read("any")',
                        `write("user:${profileId}")`
                    ]
                );
                console.log("👤 [AppwriteService] Created profile doc for user:", profileId);
                return doc;
            } catch (createErr) {
                if (createErr.code === 409) {
                    console.log("ℹ️ [AppwriteService] Profile document already exists. Resolving cleanly...");
                    try {
                        // Attempt to update the document to guarantee it's active and has proper contents
                        const updatedDoc = await this.databases.updateDocument(
                            APPWRITE_CONFIG.databaseId,
                            APPWRITE_CONFIG.collections.profiles,
                            profileId,
                            {
                                displayName: this.currentUser.name || this.currentUser.email.split('@')[0]
                            }
                        );
                        return updatedDoc;
                    } catch (updateErr) {
                        // If update fails due to read-only document security settings, return a fallback simulated profile doc
                        return {
                            displayName: this.currentUser.name || this.currentUser.email.split('@')[0],
                            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(profileId)}`,
                            createdAt: new Date().toISOString()
                        };
                    }
                }
                console.error("❌ [AppwriteService] Failed to create profile doc:", createErr);
                return null;
            }
        }
    }

    /**
     * Update user profile in database
     */
    async updateUserProfile(displayName, avatarUrl = null) {
        if (!this.currentUser) throw new Error("Authentication required to update profile.");
        const profileId = this.currentUser.$id;
        const payload = {
            displayName: displayName,
            createdAt: new Date().toISOString()
        };
        if (avatarUrl) {
            payload.avatarUrl = avatarUrl;
        }

        try {
            const doc = await this.databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.profiles,
                profileId,
                payload
            );
            if (this.currentUser) {
                this.currentUser.profile = doc;
            }
            console.log("👤 [AppwriteService] Updated profile doc:", doc);
            return doc;
        } catch (error) {
            console.error("❌ [AppwriteService] Failed to update profile:", error);
            throw error;
        }
    }

    /**
     * Start Google OAuth Flow
     */
    loginGoogle() {
        const redirectUrl = chrome.runtime.getURL("sidepanel.html?auth=success");
        const failureUrl = chrome.runtime.getURL("sidepanel.html?auth=failure");
        chrome.storage.local.set({ auth_provider: 'Google' }, () => {
            this.account.createOAuth2Session('google', redirectUrl, failureUrl);
        });
    }

    /**
     * Start Microsoft OAuth Flow
     */
    loginMicrosoft() {
        const redirectUrl = chrome.runtime.getURL("sidepanel.html?auth=success");
        const failureUrl = chrome.runtime.getURL("sidepanel.html?auth=failure");
        chrome.storage.local.set({ auth_provider: 'Microsoft' }, () => {
            this.account.createOAuth2Session('microsoft', redirectUrl, failureUrl);
        });
    }

    /**
     * Start Apple OAuth Flow
     */
    loginApple() {
        const redirectUrl = chrome.runtime.getURL("sidepanel.html?auth=success");
        const failureUrl = chrome.runtime.getURL("sidepanel.html?auth=failure");
        chrome.storage.local.set({ auth_provider: 'Apple' }, () => {
            this.account.createOAuth2Session('apple', redirectUrl, failureUrl);
        });
    }

    /**
     * Logout active user session
     */
    async logout() {
        try {
            await this.account.deleteSession('current');
            this.currentUser = null;
            console.log("👋 [AppwriteService] Successfully logged out current session.");
            return true;
        } catch (error) {
            console.error("❌ [AppwriteService] Logout failed:", error);
            return false;
        }
    }

    /**
     * Fetch settings document from the cloud
     */
    async fetchCloudSettings() {
        if (!this.currentUser) return null;
        const userId = this.currentUser.$id;

        try {
            const doc = await this.databases.getDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.userSettings,
                userId
            );
            return {
                settings: JSON.parse(doc.settingsData),
                updatedAt: doc.updatedAt,
                deviceSignature: doc.deviceSignature
            };
        } catch (error) {
            if (error.code === 404) {
                // No cloud settings found
                return null;
            }
            console.error("❌ [AppwriteService] Failed to fetch settings:", error);
            throw error;
        }
    }

    /**
     * Push current settings document to the cloud
     */
    async pushSettingsToCloud(settingsJson) {
        if (!this.currentUser) return false;
        const userId = this.currentUser.$id;

        // Deep clone to avoid mutating the local settings state
        let settingsCopy = null;
        try {
            settingsCopy = JSON.parse(JSON.stringify(settingsJson));
        } catch (e) {
            console.error("❌ [AppwriteService] Failed to serialize settings for sync:", e);
            settingsCopy = settingsJson;
        }

        // Recursively clean all base64 string attributes from the sync payload
        if (settingsCopy) {
            settingsCopy = stripBase64FromObject(settingsCopy);
        }

        const payload = {
            settingsData: JSON.stringify(settingsCopy),
            deviceSignature: this.deviceSignature,
            updatedAt: new Date().toISOString()
        };

        try {
            // Attempt to update existing doc
            await this.databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.userSettings,
                userId,
                payload
            );
            console.log("☁️ [AppwriteService] Cloud settings successfully updated.");
            return true;
        } catch (error) {
            if (error.code === 404) {
                // Create new document if it does not exist
                try {
                    await this.databases.createDocument(
                        APPWRITE_CONFIG.databaseId,
                        APPWRITE_CONFIG.collections.userSettings,
                        userId,
                        payload
                    );
                    console.log("☁️ [AppwriteService] Cloud settings document created.");
                    return true;
                } catch (createErr) {
                    console.error(`❌ [AppwriteService] Failed to create settings doc: ${createErr.message || createErr}`, {
                        code: createErr.code,
                        type: createErr.type,
                        response: typeof createErr.response === 'object' ? JSON.stringify(createErr.response) : createErr.response
                    });
                    return false;
                }
            }
            console.error(`❌ [AppwriteService] Failed to push settings: ${error.message || error}`, {
                code: error.code,
                type: error.type,
                response: typeof error.response === 'object' ? JSON.stringify(error.response) : error.response
            });
            return false;
        }
    }

    /**
     * Listen for remote setting updates in Realtime
     */
    subscribeToSettings(onUpdateCallback) {
        if (!this.currentUser || !this.client) return null;
        const userId = this.currentUser.$id;
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.userSettings}.documents.${userId}`;

        return this.client.subscribe(channel, (response) => {
            const doc = response.payload;
            if (doc.deviceSignature !== this.deviceSignature) {
                console.log("🔔 [AppwriteService] Realtime settings updated remotely.");
                try {
                    onUpdateCallback({
                        settings: JSON.parse(doc.settingsData),
                        updatedAt: doc.updatedAt,
                        deviceSignature: doc.deviceSignature
                    });
                } catch (err) {
                    console.error("❌ [AppwriteService] Error parsing realtime update payload:", err);
                }
            }
        });
    }

    // =========================================================================
    // Theme Store Services
    // =========================================================================

    async listThemes(filter = 'popular', searchQuery = '', scope = 'community', page = 1, limit = 10) {
        const cacheKey = `themes_cache_${scope}_${filter}_${page}_${limit}_${searchQuery.trim().toLowerCase()}`;
        const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24 hours

        // Helper to check local cache
        const checkCache = async () => {
            return new Promise((resolve) => {
                chrome.storage.local.get([cacheKey], (res) => {
                    if (res[cacheKey]) {
                        const { data, timestamp } = res[cacheKey];
                        resolve({ data, age: Date.now() - timestamp });
                    } else {
                        resolve(null);
                    }
                });
            });
        };

        // Check cache first
        const cache = await checkCache();
        if (cache && cache.age < ONE_DAY_MS) {
            console.log(`💾 [AppwriteService] Loaded themes from 24-hour cache for: ${cacheKey}`);
            return cache.data;
        }

        let docs = [];
        let fetchedFromDb = false;

        try {
            const queries = [];

            // Scope-specific filtering
            if (scope === 'community') {
                queries.push(window.Appwrite.Query.equal("public", true));
            } else if (scope === 'mine') {
                if (!this.currentUser) return [];
                queries.push(window.Appwrite.Query.equal("authorId", this.currentUser.$id));
            } else if (scope === 'likes') {
                if (!this.currentUser) return [];
                // First get user's liked theme IDs
                const likesList = await this.databases.listDocuments(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.themeLikes,
                    [
                        window.Appwrite.Query.equal("userId", this.currentUser.$id),
                        window.Appwrite.Query.limit(100)
                    ]
                );
                const likedThemeIds = likesList.documents.map(doc => doc.themeId);
                if (likedThemeIds.length === 0) {
                    return [];
                }
                queries.push(window.Appwrite.Query.equal("$id", likedThemeIds));
            }

            // Search query filtering
            if (searchQuery) {
                queries.push(window.Appwrite.Query.search("name", searchQuery));
            }

            // Ordering/Sorting
            if (filter === 'popular') {
                queries.push(window.Appwrite.Query.orderDesc("likesCount"));
            } else if (filter === 'newest') {
                queries.push(window.Appwrite.Query.orderDesc("createdAt"));
            }

            // Pagination
            queries.push(window.Appwrite.Query.limit(limit));
            queries.push(window.Appwrite.Query.offset((page - 1) * limit));

            console.log(`🔍 [AppwriteService] Fetching themes from Appwrite (page ${page}) with queries:`, queries);
            const list = await this.databases.listDocuments(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                queries
            );

            docs = list.documents;
            fetchedFromDb = true;
        } catch (error) {
            console.warn(`⚠️ [AppwriteService] Advanced query failed (${error.message || error}). Retrying with client-side basic query fallback.`);
            
            try {
                // Retrieve the raw first 100 documents to do client-side filtering/sorting
                const list = await this.databases.listDocuments(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.themes,
                    [window.Appwrite.Query.limit(100)]
                );
                let allDocs = list.documents;
                fetchedFromDb = true;

                // 1. Filter by public or mine
                if (scope === 'community') {
                    allDocs = allDocs.filter(d => d.public === true);
                } else if (scope === 'mine') {
                    if (this.currentUser) {
                        allDocs = allDocs.filter(d => d.authorId === this.currentUser.$id);
                    } else {
                        allDocs = [];
                    }
                } else if (scope === 'likes') {
                    if (this.currentUser) {
                        const likesList = await this.databases.listDocuments(
                            APPWRITE_CONFIG.databaseId,
                            APPWRITE_CONFIG.collections.themeLikes,
                            [
                                window.Appwrite.Query.equal("userId", this.currentUser.$id),
                                window.Appwrite.Query.limit(100)
                            ]
                        );
                        const likedThemeIds = likesList.documents.map(doc => doc.themeId);
                        allDocs = allDocs.filter(d => likedThemeIds.includes(d.$id));
                    } else {
                        allDocs = [];
                    }
                }

                // 2. Filter by search query
                if (searchQuery) {
                    const term = searchQuery.toLowerCase();
                    allDocs = allDocs.filter(d => 
                        (d.name || '').toLowerCase().includes(term) || 
                        (d.description || '').toLowerCase().includes(term)
                    );
                }

                // 3. Sorting
                if (filter === 'popular') {
                    allDocs.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
                } else if (filter === 'newest') {
                    allDocs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                }

                // 4. Client-side pagination
                const offset = (page - 1) * limit;
                docs = allDocs.slice(offset, offset + limit);
            } catch (fallbackError) {
                const responseStr = typeof fallbackError.response === 'object' ? JSON.stringify(fallbackError.response) : (fallbackError.response || '');
                console.error(`❌ [AppwriteService] Basic theme list fallback query also failed: ${fallbackError.message || fallbackError}`, {
                    code: fallbackError.code,
                    type: fallbackError.type,
                    response: responseStr
                });
                if (!cache) {
                    throw new Error(`AppwriteException: ${fallbackError.message || 'Server Error'} ${responseStr}`);
                }
            }
        }

        if (fetchedFromDb) {
            // Update cache in background
            chrome.storage.local.set({
                [cacheKey]: {
                    data: docs,
                    timestamp: Date.now()
                }
            }, () => {
                console.log(`💾 [AppwriteService] Cached query: ${cacheKey}`);
            });
            return docs;
        }

        // If fetch failed completely, look for any cache (even expired)
        if (cache) {
            console.log(`⚠️ [AppwriteService] Fetch failed completely. Loading EXPIRED cache for: ${cacheKey}`);
            return cache.data;
        }

        // Ultimate fallback to generic catalog cache
        try {
            const cachedDocs = await new Promise((resolve) => {
                chrome.storage.local.get(['community_theme_catalog'], (res) => {
                    resolve(res.community_theme_catalog || []);
                });
            });
            if (cachedDocs.length > 0) {
                console.log(`ℹ️ [AppwriteService] Loaded ${cachedDocs.length} fallback community themes from community_theme_catalog.`);
                return cachedDocs;
            }
        } catch (cacheErr) {
            console.error("❌ [AppwriteService] Failed to load legacy catalog fallback cache:", cacheErr);
        }

        return [];
    }

    /**
     * Publish custom theme to Theme Store
     */
    async publishTheme(name, description, colors, user = null) {
        const activeUser = user || this.currentUser;
        if (!activeUser) throw new Error("Authentication required to publish themes.");
        const themeId = "theme_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

        const payload = {
            name: name,
            description: description || "",
            authorId: activeUser.$id,
            authorName: activeUser.name || activeUser.email.split('@')[0],
            themeData: JSON.stringify(colors),
            previewImageId: "",
            downloadsCount: 0,
            likesCount: 0,
            price: 0,
            public: true,
            createdAt: new Date().toISOString()
        };

        try {
            const doc = await this.databases.createDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                themeId,
                payload
            );
            console.log("🎨 [AppwriteService] Successfully published theme:", doc.name);
            return doc;
        } catch (error) {
            console.error("❌ [AppwriteService] Failed to publish theme:", error);
            throw error;
        }
    }

    /**
     * Increment theme downloads count
     */
    async incrementDownloadCount(themeId) {
        try {
            const theme = await this.databases.getDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                themeId
            );
            const currentDl = theme.downloadsCount || 0;
            await this.databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                themeId,
                { downloadsCount: currentDl + 1 }
            );
        } catch (error) {
            console.error("❌ [AppwriteService] Failed to increment downloads count:", error);
        }
    }

    /**
     * Record a theme download
     */
    async recordThemeDownload(themeId, currentDownloads = 0) {
        try {
            await this.databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                themeId,
                { downloadsCount: currentDownloads + 1 }
            );
        } catch (error) {
            console.error("❌ [AppwriteService] Failed to update download count:", error);
        }
    }

    /**
     * Compatibility wrapper for likeTheme
     */
    async likeTheme(themeId, userId = null) {
        return this.toggleThemeLike(themeId);
    }

    /**
     * Upvote/Like a Theme in Theme Store
     */
    async toggleThemeLike(themeId) {
        if (!this.currentUser) throw new Error("Authentication required to upvote themes.");
        const userId = this.currentUser.$id;
        // Appwrite documentId must be ≤36 chars, only [a-zA-Z0-9_], no leading underscore.
        // Truncate each component so the composite fits exactly within 36 chars.
        const userPart = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 17);
        const themePart = themeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
        const likeId = `${userPart}_${themePart}`;

        try {
            // Check if like exists
            try {
                await this.databases.getDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.themeLikes,
                    likeId
                );

                // Document exists -> User wants to UNLIKE
                await this.databases.deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.themeLikes,
                    likeId
                );

                // Decrement theme likesCount
                await this._adjustThemeLikes(themeId, -1);
                return { liked: false };
            } catch (err) {
                if (err.code === 404) {
                    // Document doesn't exist -> User wants to LIKE
                    await this.databases.createDocument(
                        APPWRITE_CONFIG.databaseId,
                        APPWRITE_CONFIG.collections.themeLikes,
                        likeId,
                        {
                            userId: userId,
                            themeId: themeId,
                            createdAt: new Date().toISOString()
                        }
                    );

                    // Increment theme likesCount
                    await this._adjustThemeLikes(themeId, 1);
                    return { liked: true };
                }
                throw err;
            }
        } catch (error) {
            console.error("❌ [AppwriteService] Toggle theme like failed:", error);
            throw error;
        }
    }

    /**
     * Adjust likes count on theme document
     */
    async _adjustThemeLikes(themeId, offset) {
        try {
            const theme = await this.databases.getDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                themeId
            );
            const currentLikes = theme.likesCount || 0;
            const nextLikes = Math.max(0, currentLikes + offset);

            await this.databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                themeId,
                { likesCount: nextLikes }
            );
        } catch (error) {
            console.error("❌ [AppwriteService] Adjust theme likes count failed:", error);
        }
    }

    /**
     * Upload theme preview screenshot to bucket
     */
    async uploadThemePreview(fileBlob) {
        if (!this.currentUser) throw new Error("Authentication required to upload assets.");
        const fileId = "file_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        
        try {
            // Instantiate file object from blob for Appwrite
            const file = new File([fileBlob], `${fileId}.png`, { type: "image/png" });
            const response = await this.storage.createFile(
                APPWRITE_CONFIG.buckets.themeAssets,
                fileId,
                file
            );
            return response.$id;
        } catch (error) {
            console.error("❌ [AppwriteService] Asset upload failed:", error);
            throw error;
        }
    }

    /**
     * Get preview screenshot URL
     */
    getThemePreviewUrl(fileId) {
        if (!fileId) return "";
        return `${APPWRITE_CONFIG.endpoint}/storage/buckets/${APPWRITE_CONFIG.buckets.themeAssets}/files/${fileId}/view?project=${APPWRITE_CONFIG.projectId}`;
    }
}

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

    async _applyCloudSettingsToLocal(settings, cloudUpdatedAt) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['customTheme'], (result) => {
                const toSet = { ...settings };
                
                // Preserve local base64 background image data URI if cloud settings has none
                if (result.customTheme && result.customTheme.backgroundImage && result.customTheme.backgroundImage.startsWith('data:')) {
                    if (toSet.customTheme) {
                        // Keep local data URI if cloud has no background or if it's empty/not web-based
                        if (!toSet.customTheme.backgroundImage || !toSet.customTheme.backgroundImage.startsWith('http')) {
                            console.log("ℹ️ [SyncEngine] Preserving local base64 background image during cloud sync overwrite.");
                            toSet.customTheme.backgroundImage = result.customTheme.backgroundImage;
                        }
                    }
                }

                toSet.settings_last_updated = cloudUpdatedAt;
                toSet.settings_last_synced = cloudUpdatedAt;

                chrome.storage.local.set(toSet, () => {
                    console.log("✔ [SyncEngine] Local storage overwritten with remote changes.");
                    resolve();
                });
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
window.appwriteService = new AppwriteService();
window.settingsSyncEngine = new SettingsSyncEngine();
