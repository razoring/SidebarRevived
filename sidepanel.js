// Establish a connection to the background script for lifecycle tracking
const port = chrome.runtime.connect({ name: 'sidepanel' });
chrome.storage.local.set({ isSidePanelOpen: true });
window.addEventListener('pagehide', () => {
    chrome.storage.local.set({ isSidePanelOpen: false });
    port.disconnect();
});

// Keep background worker completely alive while side panel is open to ensure onDisconnect fires reliably.
setInterval(() => chrome.runtime.sendMessage({ ping: true }), 25000);

let state = {
    sites: [],
    activeSiteId: null,
    currentUrls: {}
};

const iconBar = document.getElementById('icon-bar');
const contentArea = document.getElementById('content-area');

// Initial load
chrome.storage.local.get(['sites', 'activeSiteId', 'currentUrls'], (result) => {
    if (result.sites) state.sites = result.sites;
    if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
    if (result.currentUrls) state.currentUrls = result.currentUrls;
    render();
});

// Update on change
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.sites) state.sites = changes.sites.newValue;
        if (changes.activeSiteId) state.activeSiteId = changes.activeSiteId.newValue;
        if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
        render();
    }
});

function render() {
    iconBar.innerHTML = '';

    // Render site icons
    state.sites.forEach(site => {
        const icon = document.createElement('div');
        icon.className = 'edge-sidebar-icon';
        if (site.id === state.activeSiteId) {
            icon.classList.add('active-icon');
        }

        if (site.faviconUrl) {
            icon.innerHTML = `<img src="${site.faviconUrl}" style="width: 20px; height: 20px; pointer-events: none;" />`;
        } else {
            icon.innerText = site.initial || site.title.charAt(0);
        }
        icon.title = site.title;

        icon.onclick = () => {
            chrome.storage.local.set({ activeSiteId: (state.activeSiteId === site.id ? null : site.id) });
        };

        // Drag-and-drop sorting logic
        icon.draggable = true;
        icon.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', site.id);
            icon.style.opacity = '0.5';
        };
        icon.ondragend = () => { icon.style.opacity = '1'; };
        icon.ondragover = (e) => {
            e.preventDefault();
            icon.style.borderTop = '2px solid #0078D7';
        };
        icon.ondragleave = () => { icon.style.borderTop = ''; };
        icon.ondrop = (e) => {
            e.preventDefault();
            icon.style.borderTop = '';
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && draggedId !== site.id) {
                const sites = [...state.sites];
                const fromIndex = sites.findIndex(s => s.id === draggedId);
                const toIndex = sites.findIndex(s => s.id === site.id);
                const [moved] = sites.splice(fromIndex, 1);
                sites.splice(toIndex, 0, moved);
                chrome.storage.local.set({ sites });
            }
        };

        iconBar.appendChild(icon);
    });

    const divider = document.createElement('div');
    divider.className = 'edge-sidebar-divider';
    iconBar.appendChild(divider);

    const addBtn = document.createElement('div');
    addBtn.className = 'edge-sidebar-add-btn';
    addBtn.innerText = "+";
    addBtn.title = "Add a new site";
    addBtn.onclick = () => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const title = tab.title || new URL(tab.url).hostname.replace('www.', '');
                const faviconUrl = tab.favIconUrl || `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(tab.url)}`;
                const newSite = {
                    id: 'site_' + Date.now(),
                    title: title,
                    url: tab.url,
                    faviconUrl: faviconUrl,
                    color: '#f0f0f0',
                    initial: title.charAt(0).toUpperCase()
                };
                chrome.storage.local.set({ sites: [...state.sites, newSite] });
            } else {
                alert("Cannot pin browser internal pages. Please open a regular website.");
            }
        });
    };
    iconBar.appendChild(addBtn);

    // Content Area: Persistent Multi-Iframe state
    if (state.activeSiteId) {
        contentArea.classList.add('active');
        const activeSite = state.sites.find(s => s.id === state.activeSiteId);
        if (activeSite) {
            // Update browser sidepanel title
            document.title = activeSite.title;

            // Ensure iframe exists for the active site
            let targetIframe = document.getElementById('iframe-' + activeSite.id);

            // Hide all other iframes to preserve their state in background
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

            // Cleanup placeholder if it exists
            const defaultIframe = document.getElementById('app-frame');
            if (defaultIframe) defaultIframe.remove();
        }
    } else {
        contentArea.classList.remove('active');
        document.title = "Sidebar";
    }
}
