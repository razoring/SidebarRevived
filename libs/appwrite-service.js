/**
 * Dockit Appwrite Service Wrapper
 * Manages OAuth sessions, profiles, settings synchronization, and Theme Store requests.
 */

const APPWRITE_CONFIG = {
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
     * Initialize the Appwrite Client and services
     */
    async init() {
        if (this.initialized) return;

        try {
            if (typeof window.Appwrite === 'undefined') {
                throw new Error("Appwrite SDK is not loaded. Ensure libs/appwrite.js is included before appwrite-service.js");
            }

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
            if (error.code === 404) {
                // Document doesn't exist, create it
                try {
                    const doc = await this.databases.createDocument(
                        APPWRITE_CONFIG.databaseId,
                        APPWRITE_CONFIG.collections.profiles,
                        profileId,
                        {
                            displayName: this.currentUser.name || this.currentUser.email.split('@')[0],
                            avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(profileId)}`,
                            createdAt: new Date().toISOString()
                        }
                    );
                    console.log("👤 [AppwriteService] Created profile doc for user:", profileId);
                    return doc;
                } catch (createErr) {
                    console.error("❌ [AppwriteService] Failed to create profile doc:", createErr);
                    return null;
                }
            }
            return null;
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
        const payload = {
            settingsData: JSON.stringify(settingsJson),
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
                    console.error("❌ [AppwriteService] Failed to create settings doc:", createErr);
                    return false;
                }
            }
            console.error("❌ [AppwriteService] Failed to push settings:", error);
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

    /**
     * Fetch catalog of public themes
     */
    async listThemes(filter = 'popular', searchQuery = '') {
        try {
            const queries = [
                window.Appwrite.Query.equal("public", true)
            ];

            if (searchQuery) {
                queries.push(window.Appwrite.Query.search("name", searchQuery));
            }

            if (filter === 'popular') {
                queries.push(window.Appwrite.Query.orderDesc("likesCount"));
            } else if (filter === 'newest') {
                queries.push(window.Appwrite.Query.orderDesc("createdAt"));
            }

            queries.push(window.Appwrite.Query.limit(25));

            console.log("🔍 [AppwriteService] Listing themes with queries:", queries);

            const list = await this.databases.listDocuments(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.themes,
                queries
            );
            return list.documents;
        } catch (error) {
            console.error("❌ [AppwriteService] Failed to list themes:", error);
            return [];
        }
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
     * Upvote/Like a Theme in Theme Store
     */
    async toggleThemeLike(themeId) {
        if (!this.currentUser) throw new Error("Authentication required to upvote themes.");
        const userId = this.currentUser.$id;
        const likeId = `${userId}_${themeId}`; // Unique composite ID bypasses preflight

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

// Instantiate globally
window.appwriteService = new AppwriteService();
