// scroll_faker.js
// Runs in the MAIN world to monkey-patch globals for scroll-independent body layouts.
(function() {
    if (window.__revivedScrollFakerActive) return;
    window.__revivedScrollFakerActive = true;
    
    function isFaking() {
        // We only fake if the sidebar is active (offsetting the layout)
        return document.documentElement.classList.contains('revived-sidebar-idle-active') || 
               document.documentElement.classList.contains('revived-sidebar-active');
    }

    function getDescriptor(obj, prop) {
        let current = obj;
        while (current) {
            let desc = Object.getOwnPropertyDescriptor(current, prop);
            if (desc) return desc;
            current = Object.getPrototypeOf(current);
        }
        return null;
    }

    const originalScrollY = getDescriptor(window, 'scrollY');
    const originalPageYOffset = getDescriptor(window, 'pageYOffset');
    const originalScrollTop = getDescriptor(Element.prototype, 'scrollTop');
    const originalInnerWidth = getDescriptor(window, 'innerWidth');
    const originalClientWidth = getDescriptor(document.documentElement, 'clientWidth');

    // IntersectionObserver patching
    if (!window.location.hostname.includes('youtube.com')) {
        const OriginalObserver = window.IntersectionObserver;
        if (OriginalObserver) {
            window.IntersectionObserver = function(callback, options) {
                if (isFaking() && (!options || !options.root)) {
                    options = options || {};
                    options.root = document.body;
                }
                return new OriginalObserver(callback, options);
            };
            window.IntersectionObserver.prototype = OriginalObserver.prototype;
        }
    }

    // Scroll positioning proxy
    Object.defineProperty(window, 'scrollY', {
        get: function() {
            if (isFaking() && document.body) return document.body.scrollTop;
            return originalScrollY ? originalScrollY.get.call(this) : (this.pageYOffset || 0);
        }
    });

    Object.defineProperty(window, 'pageYOffset', {
        get: function() {
            if (isFaking() && document.body) return document.body.scrollTop;
            return originalPageYOffset ? originalPageYOffset.get.call(this) : (this.scrollY || 0);
        }
    });

    Object.defineProperty(document.documentElement, 'scrollTop', {
        get: function() {
            if (isFaking() && document.body) return document.body.scrollTop;
            return originalScrollTop ? originalScrollTop.get.call(this) : 0;
        },
        set: function(val) {
            if (isFaking() && document.body) {
                document.body.scrollTop = val;
            } else if (originalScrollTop && originalScrollTop.set) {
                originalScrollTop.set.call(this, val);
            }
        }
    });

    // Viewport width proxy — report the real viewport width so sites like
    // Bing Images don't detect our CSS offset as a resize (preventing cw= loops).
    const getRealInnerWidth = () => {
        const rawWidth = originalInnerWidth ? originalInnerWidth.get.call(window) : window.outerWidth;
        if (isFaking()) {
            const style = getComputedStyle(document.documentElement);
            const margin = parseInt(style.marginRight) || 0;
            // Only add the width if the sidebar is actually pushing the layout (non-overlay)
            if (margin > 0) {
                const sidebarWidth = parseInt(style.getPropertyValue('--revived-sidebar-width')) || 48;
                return rawWidth + sidebarWidth;
            }
        }
        return rawWidth;
    };

    Object.defineProperty(window, 'innerWidth', {
        get: function() {
            return getRealInnerWidth();
        },
        configurable: true
    });

    // clientWidth proxies — these are what most sites (including Bing Images)
    // actually read to compute viewport-dependent parameters like cw=.
    if (originalClientWidth) {
        Object.defineProperty(document.documentElement, 'clientWidth', {
            get: function() {
                if (isFaking()) return getRealInnerWidth();
                return originalClientWidth.get.call(this);
            },
            configurable: true
        });
    }

    const patchBodyClientWidth = () => {
        if (!document.body) return;
        const bodyDesc = getDescriptor(document.body, 'clientWidth')
                      || getDescriptor(HTMLElement.prototype, 'clientWidth');
        if (bodyDesc) {
            Object.defineProperty(document.body, 'clientWidth', {
                get: function() {
                    if (isFaking()) return getRealInnerWidth();
                    return bodyDesc.get.call(this);
                },
                configurable: true
            });
        }
    };
    if (document.body) patchBodyClientWidth();
    else document.addEventListener('DOMContentLoaded', patchBodyClientWidth, { once: true });

    // Event bridging: when body scrolls, tell the window it scrolled
    document.addEventListener('scroll', function(e) {
        if (isFaking() && e.target === document.body) {
            window.dispatchEvent(new Event('scroll'));
        }
    }, { capture: true, passive: true });

})();
