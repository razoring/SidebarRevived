// sidepanel.js
let state = {
    sites: [],
    activeSiteId: null,
    currentUrls: {}
};

const iconBar = document.getElementById('icon-bar');
const contentArea = document.getElementById('content-area');
const iframe = document.getElementById('app-frame');
const headerTitle = document.getElementById('header-title');
const headerClose = document.getElementById('header-close');

headerClose.onclick = () => {
    chrome.storage.local.set({ activeSiteId: null });
};

function render() {
    iconBar.innerHTML = '';

    // Render sites
    state.sites.forEach(site => {
        const icon = document.createElement('div');
        icon.className = 'edge-sidebar-icon';
        if (site.id === state.activeSiteId) {
            icon.classList.add('active-icon');
        }
        icon.style.backgroundColor = site.color || '#333';
        icon.innerText = site.initial || site.title.charAt(0);
        icon.title = site.title;

        icon.onclick = () => {
            chrome.storage.local.set({ activeSiteId: (state.activeSiteId === site.id ? null : site.id) });
        };

        // Drag-and-drop
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
        // In a real scenario we might pop out a prompt. For simplicity, just add Bing or open a prompt.
        const url = prompt("Enter full website URL:", "https://en.wikipedia.org");
        if (url) {
            const title = url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
            const newSite = {
                id: 'site_' + Date.now(),
                title: title,
                url: url,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                initial: title.charAt(0).toUpperCase()
            };
            chrome.storage.local.set({ sites: [...state.sites, newSite] });
        }
    };
    iconBar.appendChild(addBtn);

    // Content Area
    if (state.activeSiteId) {
        contentArea.classList.add('active');
        const activeSite = state.sites.find(s => s.id === state.activeSiteId);
        if (activeSite) {
            headerTitle.innerText = activeSite.title;
            // Because this sidepanel is a single instance, we only change the IFRAME src if the site actually changed
            // or if it's the very first load.
            if (iframe.dataset.siteId !== activeSite.id) {
                iframe.dataset.siteId = activeSite.id;
                // Load the last known URL or the default URL
                const targetUrl = (state.currentUrls && state.currentUrls[activeSite.id]) ? state.currentUrls[activeSite.id] : activeSite.url;
                iframe.src = targetUrl;
            }
        }
    } else {
        contentArea.classList.remove('active');
    }
}

// Track iframe URL changes natively via message (or since it's in the same process, we could try to read it 
// but cross-origin prevents it. We still rely on declarativeNetRequest.)
// Note: Without content scripts inside the iframe, we can't easily capture the URL as it navigates 
// unless we re-inject the frame_script. However, we have a true single instance now, so navigation 
// natively happens in the background and PRESERVES state automatically! We don't even need to sync currentUrls!
// The iframe DOM persists entirely until we change iframe.src.
// What happens if we switch active sites? We replace iframe.src, which DESTROYS the state of the previous site!

// Wait, to keep VM-like state between DIFFERENT pinned websites, we should use multiple hidden iframes!
// Instead of replacing iframe.src, let's keep all active iframes in memory and just toggle their visibility.

chrome.storage.local.get(['sites', 'activeSiteId', 'currentUrls'], (result) => {
    if (result.sites) state.sites = result.sites;
    if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
    if (result.currentUrls) state.currentUrls = result.currentUrls;
    renderAdvanced(); // We will rewrite render() for multi-iframe
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.sites) state.sites = changes.sites.newValue;
        if (changes.activeSiteId) state.activeSiteId = changes.activeSiteId.newValue;
        if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
        renderAdvanced();
    }
});

function renderAdvanced() {
    iconBar.innerHTML = '';

    // Render sites
    state.sites.forEach(site => {
        const icon = document.createElement('div');
        icon.className = 'edge-sidebar-icon';
        if (site.id === state.activeSiteId) {
            icon.classList.add('active-icon');
        }
        icon.style.backgroundColor = site.color || '#333';
        icon.innerText = site.initial || site.title.charAt(0);
        icon.title = site.title;

        icon.onclick = () => {
            chrome.storage.local.set({ activeSiteId: (state.activeSiteId === site.id ? null : site.id) });
        };

        // Drag-and-drop logic
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
        const url = prompt("Enter website URL (e.g., https://en.wikipedia.org):", "https://");
        if (url && url.startsWith('http')) {
            let title = "New";
            try {
                title = new URL(url).hostname.replace('www.', '');
            } catch (e) { }
            const newSite = {
                id: 'site_' + Date.now(),
                title: title,
                url: url,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                initial: title.charAt(0).toUpperCase()
            };
            chrome.storage.local.set({ sites: [...state.sites, newSite] });
        }
    };
    iconBar.appendChild(addBtn);

    // Advanced VM-like Content Area: Hidden iframes for all sites
    if (state.activeSiteId) {
        contentArea.classList.add('active');
        const activeSite = state.sites.find(s => s.id === state.activeSiteId);
        if (activeSite) {
            headerTitle.innerText = activeSite.title;

            // Ensure iframe exists for the active site
            let targetIframe = document.getElementById('iframe-' + activeSite.id);

            // Hide all other iframes
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
                // Append it after header
                contentArea.appendChild(targetIframe);
            } else {
                targetIframe.style.display = 'block';
            }

            // We no longer use the default hardcoded #app-frame
            const defaultIframe = document.getElementById('app-frame');
            if (defaultIframe) defaultIframe.remove();
        }
    } else {
        contentArea.classList.remove('active');
    }
}
