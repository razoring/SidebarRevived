// Establish a connection to the background script for lifecycle tracking
const port = chrome.runtime.connect({ name: 'sidepanel' });


// Keep background worker completely alive while side panel is open to ensure onDisconnect fires reliably.
setInterval(() => chrome.runtime.sendMessage({ ping: true }), 25000);

let state = {
    sites: [],
    tempSites: [],
    activeSiteId: null,
    currentUrls: {},
    customTheme: null,
    isSettingsOpen: false,
    scrollBlocklist: [],
    sidepanelBlocklist: [],
    autoHideBlocklist: [],
    activeSiteOwner: null,
    collapsedSections: JSON.parse(localStorage.getItem('collapsedSections') || '{}'),
    autoHideEnabled: false,
    showCategoryIcons: false,
    isAddPageOpen: false,
    _loaded: false
};

async function searchSites(query) {
    if (!query || query.length < 2) return [];
    try {
        const response = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data.map(item => ({
            title: item.name,
            url: 'https://' + item.domain,
            faviconUrl: item.logo || `https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`
        }));
    } catch (err) {
        console.error('Search failed', err);
        return [];
    }
}

const { createSiteFromTab, applyThemeStyles, getThemeDefaults } = __SidebarRevived;

const iconBar = document.getElementById('icon-bar');
const contentArea = document.getElementById('content-area');

iconBar.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};
iconBar.ondragenter = (e) => {
    e.preventDefault();
};

// Initial load
chrome.storage.local.get(['sites', 'tempSites', 'activeSiteId', 'currentUrls', 'customTheme', 'isSettingsOpen', 'isAddPageOpen', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled', 'activeSiteOwner'], async (result) => {
    if (state._loaded) { 
        await __SidebarRevived.svgReady;
        render(); 
        return; 
    }
    state._loaded = true;
    if (result.sites) state.sites = result.sites;
    if (result.tempSites) state.tempSites = result.tempSites;
    if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
    if (result.currentUrls) state.currentUrls = result.currentUrls;
    if (result.customTheme) state.customTheme = result.customTheme;
    if (result.isSettingsOpen !== undefined) state.isSettingsOpen = result.isSettingsOpen;
    if (result.isAddPageOpen !== undefined) state.isAddPageOpen = result.isAddPageOpen;
    if (result.scrollBlocklist) state.scrollBlocklist = result.scrollBlocklist;
    if (result.sidepanelBlocklist) state.sidepanelBlocklist = result.sidepanelBlocklist;
    if (result.autoHideBlocklist) state.autoHideBlocklist = result.autoHideBlocklist;
    if (result.autoHideEnabled !== undefined) state.autoHideEnabled = result.autoHideEnabled;
    if (result.showCategoryIcons !== undefined) state.showCategoryIcons = result.showCategoryIcons;
    if (result.activeSiteOwner !== undefined) state.activeSiteOwner = result.activeSiteOwner;
    
    applyTheme();
    await __SidebarRevived.svgReady;
    // Always render, even if sites is empty - this ensures settings opens on first click
    render();
    // If settings was set to open before storage loaded, ensure it shows
    if (state.isSettingsOpen) {
        document.getElementById('icon-bar').style.display = 'none';
        document.getElementById('content-area').style.display = 'none';
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        state._loaded = true;
        if (changes.sites) state.sites = changes.sites.newValue;
        if (changes.tempSites) state.tempSites = changes.tempSites.newValue;
        if (changes.activeSiteId !== undefined) {
            state.activeSiteId = changes.activeSiteId.newValue;
        }
        if (changes.activeSiteOwner !== undefined) {
            state.activeSiteOwner = changes.activeSiteOwner.newValue;
        }
        if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
        if (changes.customTheme) {
            state.customTheme = changes.customTheme.newValue;
            applyTheme();
            updateSettingsUI();
        }
        if (changes.isSettingsOpen !== undefined) {
            state.isSettingsOpen = changes.isSettingsOpen.newValue;
        }
        if (changes.isAddPageOpen !== undefined) {
            state.isAddPageOpen = changes.isAddPageOpen.newValue;
        }
        if (changes.scrollBlocklist) {
            state.scrollBlocklist = changes.scrollBlocklist.newValue;
            updateSettingsUI();
        }
        if (changes.sidepanelBlocklist) state.sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
        if (changes.autoHideBlocklist) state.autoHideBlocklist = changes.autoHideBlocklist.newValue;
        if (changes.autoHideEnabled) {
            state.autoHideEnabled = changes.autoHideEnabled.newValue;
            updateSettingsUI();
        }
        if (changes.showCategoryIcons) {
            state.showCategoryIcons = changes.showCategoryIcons.newValue;
            updateSettingsUI();
        }
        render();
    }
});

function applyTheme() {
    const defaults = __SidebarRevived.getThemeDefaults();
    const theme = state.customTheme ? { ...defaults, ...state.customTheme } : defaults;
    applyThemeStyles(document.documentElement, theme);
}

async function render() {
    const sp = document.getElementById('settings-panel');
    const ap = document.getElementById('add-page-panel');
    const note = document.getElementById('inpage-sidebar-note');

    if (state.isSettingsOpen) {
        // Update UI state first to prevent flash of unstyled content
        updateSettingsUI();
        initCollapsibleSections();
        
        iconBar.style.display = 'none';
        contentArea.style.display = 'none';
        if (note) note.style.display = 'none';
        if (ap) ap.style.display = 'none';
        if (sp) sp.style.display = 'flex';
        return; // Settings panel still hides everything else
    }

    // Handle Add Page visibility but don't return early
    if (state.isAddPageOpen) {
        await updateAddPageUI();
        iconBar.style.display = 'flex';
        contentArea.style.display = 'none';
        if (note) note.style.display = 'none';
        if (sp) sp.style.display = 'none';
        if (ap) ap.style.display = 'flex';
    } else {
        iconBar.style.display = 'flex';
        if (sp) sp.style.display = 'none';
        if (ap) ap.style.display = 'none';

        const inPageActive = state.activeSiteOwner === 'inpage';
        if (note) note.style.display = inPageActive ? 'flex' : 'none';
        contentArea.style.display = (!inPageActive && state.activeSiteId) ? 'flex' : 'none';

        if (state.activeSiteId && !inPageActive) {
            contentArea.classList.add('active');
            const activeSite = state.sites.find(s => s.id === state.activeSiteId) || (state.tempSites && state.tempSites.find(s => s.id === state.activeSiteId));
            if (activeSite) {
                document.title = activeSite.title;

                let targetIframe = document.getElementById('iframe-' + activeSite.id);

                const allIframes = document.querySelectorAll('.app-frame-instance');
                allIframes.forEach(f => f.style.display = 'none');

                if (!targetIframe) {
                    targetIframe = document.createElement('iframe');
                    targetIframe.id = 'iframe-' + activeSite.id;
                    targetIframe.className = 'app-frame-instance';
                    targetIframe.style.flex = '1';
                    targetIframe.style.border = 'none';
                    targetIframe.style.width = '100%';
                    targetIframe.style.height = '100%';
                    targetIframe.allow = "camera; microphone; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen";
                    targetIframe.src = activeSite.url;
                    contentArea.appendChild(targetIframe);
                } else {
                    targetIframe.style.display = 'block';
                }

                const defaultIframe = document.getElementById('app-frame');
                if (defaultIframe) defaultIframe.remove();
            }
        } else if (!inPageActive) {
            contentArea.classList.remove('active');
            document.title = "Sidebar";
        }
    }

    const iconBarOptions = {
        sites: state.sites,
        tempSites: state.tempSites || [],
        activeSiteId: state.activeSiteId,
        getSites: () => state.sites,
        getTempSites: () => state.tempSites,
        onSiteClick: (siteId, site) => {
            const newId = state.activeSiteId === siteId ? null : siteId;
            chrome.storage.local.set({ activeSiteId: newId, activeSiteOwner: newId ? 'sidepanel' : null, isSettingsOpen: false, isAddPageOpen: false });
            if (!state.currentUrls[siteId]) {
                state.currentUrls[siteId] = site.url;
                chrome.storage.local.set({ currentUrls: state.currentUrls });
            }
        },
        onAddSite: () => {
            const searchInput = document.getElementById('site-search-input');
            if (searchInput) {
                searchInput.value = '';
                renderSearchResults('');
            }
            chrome.storage.local.set({ isAddPageOpen: true, isSettingsOpen: false });
        },
        onSettingsClick: () => {
            chrome.storage.local.set({ isSettingsOpen: true, isAddPageOpen: false });
        },
        showCategoryIcons: state.showCategoryIcons,
        getIconOpacity: (site) => (site.id === state.activeSiteId || document.getElementById('iframe-' + site.id)) ? '1' : '0.5'
    };

    // Now populate icons (this might be async if SVGs are still fetching)
    await __SidebarRevived.renderIconBar(iconBar, iconBarOptions);
}

function initCollapsibleSections() {
    document.querySelectorAll('.settings-category-header.collapsible').forEach(header => {
        const targetId = header.dataset.target;
        const isCollapsed = state.collapsedSections[targetId];
        const body = document.getElementById(targetId);
        if (body) {
            body.style.display = isCollapsed ? 'none' : 'block';
            header.querySelector('.collapse-arrow').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        }
        header.onclick = () => {
            const nowCollapsed = body.style.display !== 'none';
            body.style.display = nowCollapsed ? 'none' : 'block';
            header.querySelector('.collapse-arrow').style.transform = nowCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            state.collapsedSections[targetId] = nowCollapsed;
            localStorage.setItem('collapsedSections', JSON.stringify(state.collapsedSections));
        };
    });
}

let currentTabInfo = null;

function refreshCurrentTab() {
    const faviconImg = document.getElementById('current-tab-favicon');
    const titleSpan = document.getElementById('current-tab-title');
    const urlSpan = document.getElementById('current-tab-url');
    const tabItem = document.getElementById('add-current-tab-item');
    if (!faviconImg || !titleSpan) return;

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.startsWith('http')) {
            currentTabInfo = tab;
            
            let cleanedUrl = tab.url;
            try {
                const u = new URL(tab.url);
                cleanedUrl = u.origin + u.pathname;
            } catch (e) { }
            // No longer stripping parameters as per user request to allow exact pages
            faviconImg.src = tab.favIconUrl || 'assets/pin_icon.svg';
            titleSpan.innerText = tab.title;
            if (urlSpan) urlSpan.innerText = cleanedUrl;
            
            if (tabItem) { 
                tabItem.style.opacity = '1'; 
                tabItem.style.pointerEvents = ''; 
            }
        } else {
            currentTabInfo = null;
            faviconImg.src = 'assets/pin_icon.svg';
            titleSpan.innerText = 'Internal Page (Cannot Add)';
            if (urlSpan) urlSpan.innerText = '';
            if (tabItem) { 
                tabItem.style.opacity = '0.4'; 
                tabItem.style.pointerEvents = 'none'; 
            }
        }
    });
}

// Refresh the current-tab row whenever the user switches tabs (while panel is open)
chrome.tabs.onActivated.addListener(() => {
    if (state.isAddPageOpen) refreshCurrentTab();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (state.isAddPageOpen && changeInfo.status === 'complete') refreshCurrentTab();
});

async function updateAddPageUI() {
    await __SidebarRevived.svgReady;
    const tabItem = document.getElementById('add-current-tab-item');

    refreshCurrentTab();

    // Wire the whole row as the click target (idempotent)
    if (tabItem && !tabItem.dataset.clickBound) {
        tabItem.dataset.clickBound = '1';
        tabItem.onclick = () => {
            if (currentTabInfo) {
                const newSite = createSiteFromTab(currentTabInfo);
                chrome.storage.local.set({ sites: [...state.sites, newSite] });
            }
        };
    }

    // Inject add icon (right-aligned, accent coloured)
    const rowIcon = document.getElementById('add-current-tab-icon');
    if (rowIcon && !rowIcon.dataset.iconLoaded) {
        rowIcon.innerHTML = __SidebarRevived.ADD_ICON_SVG;
        rowIcon.dataset.iconLoaded = '1';
    }

    // Render Pinned Apps grid
    const pinnedGrid = document.getElementById('pinned-apps-grid');
    const pinnedTrash = document.getElementById('pinned-apps-trash');
    
    if (pinnedTrash && !pinnedTrash.dataset.iconLoaded) {
        pinnedTrash.innerHTML = __SidebarRevived.TRASH_ICON_SVG;
        pinnedTrash.dataset.iconLoaded = '1';
        
        pinnedTrash.ondragover = (e) => {
            e.preventDefault();
            pinnedTrash.classList.add('trash-hover');
        };
        pinnedTrash.ondragleave = () => {
            pinnedTrash.classList.remove('trash-hover');
        };
        pinnedTrash.ondrop = (e) => {
            e.preventDefault();
            pinnedTrash.classList.remove('trash-hover');
            pinnedTrash.classList.remove('visible');
            const siteId = e.dataTransfer.getData('text/plain');
            if (siteId) {
                const newSites = state.sites.filter(s => s.id !== siteId);
                chrome.storage.local.set({ sites: newSites });
            }
        };
    }

    if (pinnedGrid) {
        const oldRects = new Map();
        const gridRect = pinnedGrid.getBoundingClientRect();
        
        // Only capture positions if the grid was already visible (prevents animation on open)
        if (gridRect.width > 0 && gridRect.height > 0) {
            pinnedGrid.querySelectorAll('.pinned-app-item').forEach(el => {
                if (el.dataset.id) oldRects.set(el.dataset.id, el.getBoundingClientRect());
            });
        }

        pinnedGrid.innerHTML = '';
        if (state.sites.length === 0) {
            pinnedGrid.innerHTML = '<div class="empty-state">No pinned apps</div>';
        } else {
            state.sites.forEach((site) => {
                const item = document.createElement('div');
                item.className = 'pinned-app-item';
                item.draggable = true;
                item.dataset.id = site.id;
                item.innerHTML = `<img src="${site.faviconUrl}" alt="${site.title}" title="${site.title}" />`;
                
                item.ondragstart = (e) => {
                    e.dataTransfer.setData('text/plain', site.id);
                    item.classList.add('dragging');
                    if (pinnedTrash) pinnedTrash.classList.add('visible');
                };
                
                item.ondragend = () => {
                    item.classList.remove('dragging');
                    if (pinnedTrash) {
                        pinnedTrash.classList.remove('visible');
                        pinnedTrash.classList.remove('trash-hover');
                    }
                    pinnedGrid.querySelectorAll('.drop-target-left, .drop-target-right').forEach(el => {
                        el.classList.remove('drop-target-left', 'drop-target-right');
                    });
                };

                pinnedGrid.appendChild(item);
            });
        }

        pinnedGrid.ondragover = (e) => {
            e.preventDefault();
            const draggables = [...pinnedGrid.querySelectorAll('.pinned-app-item:not(.dragging)')];
            if (draggables.length === 0) return;

            let closest = { offset: Number.POSITIVE_INFINITY, element: null, side: 'left' };
            draggables.forEach(child => {
                const box = child.getBoundingClientRect();
                const centerX = box.left + box.width / 2;
                const centerY = box.top + box.height / 2;
                const distance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
                if (distance < closest.offset) {
                    const side = e.clientX > centerX ? 'right' : 'left';
                    closest = { offset: distance, element: child, side: side };
                }
            });

            pinnedGrid.querySelectorAll('.drop-target-left, .drop-target-right').forEach(el => {
                el.classList.remove('drop-target-left', 'drop-target-right');
            });

            if (closest.element) {
                closest.element.classList.add(closest.side === 'left' ? 'drop-target-left' : 'drop-target-right');
            }
        };

        pinnedGrid.ondragleave = (e) => {
            if (e.target === pinnedGrid) {
                pinnedGrid.querySelectorAll('.drop-target-left, .drop-target-right').forEach(el => {
                    el.classList.remove('drop-target-left', 'drop-target-right');
                });
            }
        };

        pinnedGrid.ondrop = (e) => {
            e.preventDefault();
            const siteId = e.dataTransfer.getData('text/plain');
            const targetEl = pinnedGrid.querySelector('.drop-target-left, .drop-target-right');
            if (!siteId || !targetEl) return;

            const isLeft = targetEl.classList.contains('drop-target-left');
            const targetId = targetEl.dataset.id;
            
            const sites = [...state.sites];
            const fromIndex = sites.findIndex(s => s.id === siteId);
            if (fromIndex === -1) return;
            const [moved] = sites.splice(fromIndex, 1);
            
            let toIndex = sites.findIndex(s => s.id === targetId);
            if (!isLeft) toIndex++;
            
            sites.splice(toIndex, 0, moved);
            chrome.storage.local.set({ sites });
        };

        // Animate icons into position
        if (oldRects.size > 0) {
            requestAnimationFrame(() => {
                const items = pinnedGrid.querySelectorAll('.pinned-app-item');
                items.forEach(item => {
                    const id = item.dataset.id;
                    if (!id || !oldRects.has(id)) return;
                    const oldRect = oldRects.get(id);
                    const newRect = item.getBoundingClientRect();
                    const dx = oldRect.left - newRect.left;
                    const dy = oldRect.top - newRect.top;
                    if (dx || dy) {
                        item.style.transition = 'none';
                        item.style.transform = `translate(${dx}px, ${dy}px)`;
                        item.offsetHeight; // force reflow
                        item.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0, 1)';
                        item.style.transform = '';
                    }
                });
            });
        }
    }

    renderMostVisited();

    // Load close_icon.svg for back button (same as settings panel)
    const backBtn = document.getElementById('add-page-back-btn');
    if (backBtn && !backBtn.dataset.iconLoaded) {
        fetch(chrome.runtime.getURL('assets/close_icon.svg'))
            .then(r => r.text())
            .then(svg => { backBtn.innerHTML = svg; backBtn.dataset.iconLoaded = '1'; })
            .catch(() => { backBtn.innerHTML = '✕'; });
    }

    // (Search reset is now handled only when the panel is explicitly opened)
}

function isValidUrl(str) {
    try {
        const urlToTest = str.includes('://') ? str : 'https://' + str;
        const u = new URL(urlToTest);
        return u.hostname.includes('.') && u.hostname.replace('www.', '').length >= 3;
    } catch (e) {
        return false;
    }
}

function normaliseUrl(str) {
    if (str.includes('://')) return str;
    return 'https://' + str;
}

async function renderSearchResults(query) {
    const container = document.getElementById('search-results');
    if (!container) return;
    
    if (!query || query.length < 2) {
        container.innerHTML = '';
        container.classList.remove('visible');
        return;
    }

    container.innerHTML = '<div class="search-status">Searching...</div>';

    const results = await searchSites(query);
    container.innerHTML = '';

    results.forEach(app => {
        const domain = app.url.replace('https://', '').replace('http://', '');
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
            <img src="${app.faviconUrl}" alt="" />
            <span class="result-title">${app.title}</span>
            <span class="result-domain">${domain}</span>
            <div class="result-add-btn"></div>
        `;
        const addBtn = item.querySelector('.result-add-btn');
        addBtn.innerHTML = __SidebarRevived.ADD_ICON_SVG;

        item.onclick = () => {
            const site = {
                id: 'site-' + Date.now() + Math.random().toString(36).substr(2, 5),
                title: app.title,
                url: app.url,
                faviconUrl: app.faviconUrl,
                initial: app.title.charAt(0)
            };
            chrome.storage.local.set({ sites: [...state.sites, site] });
        };
        container.appendChild(item);
    });

    // Append direct-URL entry if the query looks like a valid URL or domain
    if (isValidUrl(query)) {
        const url = normaliseUrl(query);
        let displayTitle = query;
        let faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
        
        try {
            const u = new URL(url);
            displayTitle = u.hostname.replace('www.', '');
        } catch(e) {}

        const item = document.createElement('div');
        item.className = 'search-result-item search-result-direct';
        item.innerHTML = `
            <img src="${faviconUrl}" alt="" />
            <div style="display:flex; flex-direction:column; min-width:0; flex:1;">
                <span class="result-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>
                <span class="result-domain" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; opacity:0.7;">${url}</span>
            </div>
            <div class="result-add-btn"></div>
        `;
        const addBtn = item.querySelector('.result-add-btn');
        addBtn.innerHTML = __SidebarRevived.ADD_ICON_SVG;

        item.onclick = () => {
            const site = {
                id: 'site-' + Date.now() + Math.random().toString(36).substr(2, 5),
                title: displayTitle,
                url,
                faviconUrl,
                initial: displayTitle.charAt(0).toUpperCase()
            };
            chrome.storage.local.set({ sites: [...state.sites, site] });
        };
        container.appendChild(item);
    }

    if (container.children.length === 0) {
        container.innerHTML = '<div class="search-status">No results found</div>';
    }

    container.classList.add('visible');
}

let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('add-page-back-btn');
    if (backBtn) {
        backBtn.onclick = () => {
            chrome.storage.local.set({ isAddPageOpen: false });
        };
    }


    const searchInput = document.getElementById('site-search-input');
    if (searchInput) {
        searchInput.oninput = (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            searchTimeout = setTimeout(() => {
                renderSearchResults(query);
            }, 300);
        };
        // Hide overlay when focus leaves, restore if query present
        searchInput.onblur = () => {
            setTimeout(() => {
                const container = document.getElementById('search-results');
                if (container) container.classList.remove('visible');
            }, 150); // small delay so clicks on results register
        };
        searchInput.onfocus = () => {
            if (searchInput.value.trim().length >= 2) {
                const container = document.getElementById('search-results');
                if (container && container.children.length) container.classList.add('visible');
            }
        };
    }
});

function updateSettingsUI() {
    const defaults = __SidebarRevived.getThemeDefaults();
    const theme = state.customTheme ? { ...defaults, ...state.customTheme } : defaults;
    
    const fields = [
        { input: 'theme-font-color', hex: 'hex-font-color', key: 'fontColor' },
        { input: 'theme-sidebar-bg', hex: 'hex-sidebar-bg', key: 'sidebarBackground' },
        { input: 'theme-divider-bg', hex: 'hex-divider-bg', key: 'dividerBackground' },
        { input: 'theme-midtone-bg', hex: 'hex-midtone-bg', key: 'midtoneBackground' },
        { input: 'theme-accent-color', hex: 'hex-accent-color', key: 'accentColor' }
    ];

    fields.forEach(f => {
        const inp = document.getElementById(f.input);
        const hex = document.getElementById(f.hex);
        const val = theme[f.key];
        if (inp) inp.value = val;
        if (hex && document.activeElement !== hex) hex.value = val;
    });

    const opacitySlider = document.getElementById('theme-panel-opacity');
    const opacityVal = document.getElementById('val-panel-opacity');
    const opacity = theme.panelOpacity !== undefined ? theme.panelOpacity : 1;
    if (opacitySlider) opacitySlider.value = opacity;
    if (opacityVal) opacityVal.textContent = Math.round(opacity * 100) + '%';

    const blurSlider = document.getElementById('theme-panel-blur');
    const blurVal = document.getElementById('val-panel-blur');
    const blur = theme.panelBlur !== undefined ? theme.panelBlur : 0;
    if (blurSlider) blurSlider.value = blur;
    if (blurVal) blurVal.textContent = blur + 'px';

    const scrollInp = document.getElementById('settings-scroll-blocklist');
    if (scrollInp && document.activeElement !== scrollInp) {
        scrollInp.value = (state.scrollBlocklist || []).join('\n');
    }

    const sideInp = document.getElementById('settings-sidepanel-blocklist');
    if (sideInp && document.activeElement !== sideInp) {
        sideInp.value = (state.sidepanelBlocklist || []).join('\n');
    }

    const autoInp = document.getElementById('settings-autohide-blocklist');
    if (autoInp && document.activeElement !== autoInp) {
        autoInp.value = (state.autoHideBlocklist || []).join('\n');
    }

    const addBtn = document.getElementById('add-to-blocklist-btn');
    if (addBtn) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const hostname = new URL(tab.url).hostname;
                const currentList = state.scrollBlocklist || [];
                addBtn.textContent = currentList.includes(hostname)
                    ? 'Remove Current Site from Blocklist'
                    : 'Add Current Site to Blocklist';
            }
        });
    }

    const sideBtn = document.getElementById('add-to-sidepanel-blocklist-btn');
    if (sideBtn) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const hostname = new URL(tab.url).hostname;
                const currentList = state.sidepanelBlocklist || [];
                sideBtn.textContent = currentList.includes(hostname)
                    ? 'Remove Current Site from Blocklist'
                    : 'Add Current Site to Blocklist';
            }
        });
    }

    const autoBtn = document.getElementById('add-to-autohide-blocklist-btn');
    if (autoBtn) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const hostname = new URL(tab.url).hostname;
                const currentList = state.autoHideBlocklist || [];
                autoBtn.textContent = currentList.includes(hostname)
                    ? 'Remove Current Site from Blocklist'
                    : 'Add Current Site to Blocklist';
            }
        });
    }

    const autoHideChk = document.getElementById('settings-auto-hide');
    if (autoHideChk) autoHideChk.checked = state.autoHideEnabled;

    const showCatChk = document.getElementById('settings-show-category-drag');
    if (showCatChk) showCatChk.checked = state.showCategoryIcons;
}

// Collapsible section toggle
document.getElementById('settings-panel').addEventListener('click', (e) => {
    const header = e.target.closest('.settings-category-header.collapsible');
    if (!header) return;
    const targetId = header.dataset.target;
    header.classList.toggle('collapsed');
    state.collapsedSections[targetId] = header.classList.contains('collapsed');
    localStorage.setItem('collapsedSections', JSON.stringify(state.collapsedSections));
});

fetch(chrome.runtime.getURL('assets/close_icon.svg'))
    .then(r => r.text())
    .then(svg => {
        const btn = document.getElementById('settings-back-btn');
        if (btn) btn.innerHTML = svg;
    });

document.getElementById('settings-back-btn').addEventListener('click', () => {
    chrome.storage.local.set({ isSettingsOpen: false, isAddPageOpen: false });
});

function debounceThemeUpdate() {
    const opacitySlider = document.getElementById('theme-panel-opacity');
    const blurSlider = document.getElementById('theme-panel-blur');
    const newTheme = {
        fontColor: document.getElementById('theme-font-color').value,
        sidebarBackground: document.getElementById('theme-sidebar-bg').value,
        dividerBackground: document.getElementById('theme-divider-bg').value,
        midtoneBackground: document.getElementById('theme-midtone-bg').value,
        accentColor: document.getElementById('theme-accent-color').value,
        panelOpacity: opacitySlider ? parseFloat(opacitySlider.value) : 1,
        panelBlur: blurSlider ? parseInt(blurSlider.value, 10) : 0
    };
    chrome.storage.local.set({ customTheme: newTheme });
}

function updateSwatchFromInput(inputId, hexId) {
    const inp = document.getElementById(inputId);
    const hex = document.getElementById(hexId);
    if (inp && hex) hex.value = inp.value;
    debounceThemeUpdate();
}

const colorFields = [
    { input: 'theme-font-color', hex: 'hex-font-color' },
    { input: 'theme-sidebar-bg', hex: 'hex-sidebar-bg' },
    { input: 'theme-divider-bg', hex: 'hex-divider-bg' },
    { input: 'theme-midtone-bg', hex: 'hex-midtone-bg' },
    { input: 'theme-accent-color', hex: 'hex-accent-color' }
];

colorFields.forEach(f => {
    document.getElementById(f.input).addEventListener('input', () => {
        updateSwatchFromInput(f.input, f.hex);
    });
    document.getElementById(f.hex).addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            const inp = document.getElementById(f.input);
            if (inp) inp.value = val;
            debounceThemeUpdate();
        }
    });
    document.getElementById(f.hex).addEventListener('blur', (e) => {
        const val = e.target.value.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(val)) {
            const inp = document.getElementById(f.input);
            if (inp) e.target.value = inp ? inp.value : '';
        }
    });
});

document.getElementById('theme-panel-opacity').addEventListener('input', (e) => {
    const val = document.getElementById('val-panel-opacity');
    const pct = Math.round(parseFloat(e.target.value) * 100);
    if (val) val.textContent = pct + '%';
    debounceThemeUpdate();
});

document.getElementById('theme-panel-blur').addEventListener('input', (e) => {
    const val = document.getElementById('val-panel-blur');
    const px = parseInt(e.target.value, 10);
    if (val) val.textContent = px + 'px';
    debounceThemeUpdate();
});

document.getElementById('settings-auto-hide').addEventListener('change', (e) => {
    state.autoHideEnabled = e.target.checked;
    chrome.storage.local.set({ autoHideEnabled: state.autoHideEnabled });
});

document.getElementById('settings-show-category-drag').addEventListener('change', (e) => {
    state.showCategoryIcons = e.target.checked;
    chrome.storage.local.set({ showCategoryIcons: state.showCategoryIcons });
});

document.getElementById('settings-scroll-blocklist').addEventListener('input', (e) => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    chrome.storage.local.set({ scrollBlocklist: list });
});

document.getElementById('add-to-blocklist-btn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.startsWith('http')) {
            const hostname = new URL(tab.url).hostname;
            const currentList = state.scrollBlocklist || [];
            if (!currentList.includes(hostname)) {
                chrome.storage.local.set({ scrollBlocklist: [...currentList, hostname] });
            } else {
                chrome.storage.local.set({ scrollBlocklist: currentList.filter(d => d !== hostname) });
            }
        }
    });
});

document.getElementById('settings-sidepanel-blocklist').addEventListener('input', (e) => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    chrome.storage.local.set({ sidepanelBlocklist: list });
});

document.getElementById('add-to-sidepanel-blocklist-btn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.startsWith('http')) {
            const hostname = new URL(tab.url).hostname;
            const currentList = state.sidepanelBlocklist || [];
            if (!currentList.includes(hostname)) {
                chrome.storage.local.set({ sidepanelBlocklist: [...currentList, hostname] });
            } else {
                chrome.storage.local.set({ sidepanelBlocklist: currentList.filter(d => d !== hostname) });
            }
        }
    });
});

document.getElementById('settings-autohide-blocklist').addEventListener('input', (e) => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    chrome.storage.local.set({ autoHideBlocklist: list });
});

document.getElementById('add-to-autohide-blocklist-btn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.startsWith('http')) {
            const hostname = new URL(tab.url).hostname;
            const currentList = state.autoHideBlocklist || [];
            if (!currentList.includes(hostname)) {
                chrome.storage.local.set({ autoHideBlocklist: [...currentList, hostname] });
            } else {
                chrome.storage.local.set({ autoHideBlocklist: currentList.filter(d => d !== hostname) });
            }
        }
    });
});

document.getElementById('export-theme-btn').addEventListener('click', () => {
    const themeStr = JSON.stringify(state.customTheme || {}, null, 2);
    const blob = new Blob([themeStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "sidebar_theme.json";
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-theme-btn').addEventListener('click', () => {
    document.getElementById('import-theme-file').click();
});

document.getElementById('import-theme-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            chrome.storage.local.set({ customTheme: parsed });
        } catch (err) {
            alert("Invalid Theme JSON");
        }
    };
    reader.readAsText(file);
});

document.getElementById('reset-theme-btn').addEventListener('click', () => {
    chrome.storage.local.set({ customTheme: getThemeDefaults() });
});

function renderMostVisited() {
    const list = document.getElementById('most-visited-list');
    if (!list) return;

    chrome.topSites.get((topSites) => {
        if (!topSites || topSites.length === 0) {
            list.innerHTML = '<div class="search-status">No frequent sites found</div>';
            return;
        }
        list.innerHTML = '';
        topSites.slice(0, 10).forEach(site => {
            const item = document.createElement('div');
            item.className = 'search-result-item'; 
            const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;
            const displayTitle = site.title || new URL(site.url).hostname.replace('www.', '');

            item.innerHTML = `
                <img src="${faviconUrl}" alt="" />
                <div style="display:flex; flex-direction:column; min-width:0; flex:1;">
                    <span class="result-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>
                    <span class="result-domain" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; opacity:0.7;">${site.url}</span>
                </div>
                <div class="result-add-btn"></div>
            `;
            const addBtn = item.querySelector('.result-add-btn');
            addBtn.innerHTML = __SidebarRevived.ADD_ICON_SVG;

            item.onclick = () => {
                const newSite = {
                    id: 'site-' + Date.now() + Math.random().toString(36).substr(2, 5),
                    title: displayTitle,
                    url: site.url,
                    faviconUrl,
                    initial: displayTitle.charAt(0).toUpperCase()
                };
                chrome.storage.local.set({ sites: [...state.sites, newSite] });
            };
            list.appendChild(item);
        });
    });
}

document.getElementById('export-all-btn').addEventListener('click', () => {
    chrome.storage.local.get(null, (allData) => {
        const dataStr = JSON.stringify(allData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "sidebar_backup.json";
        a.click();
        URL.revokeObjectURL(url);
    });
});

document.getElementById('import-all-btn').addEventListener('click', () => {
    document.getElementById('import-all-file').click();
});

document.getElementById('import-all-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            chrome.storage.local.set(parsed, () => {
                window.location.reload();
            });
        } catch (err) {
            alert("Invalid Backup JSON");
        }
    };
    reader.readAsText(file);
});

document.getElementById('clear-all-data-btn').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear ALL data? This will reset your pinned sites, theme, and all settings. This action cannot be undone.")) {
        chrome.storage.local.clear(() => {
            window.location.reload();
        });
    }
});
