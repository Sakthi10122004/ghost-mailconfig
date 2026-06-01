(function() {
    function injectSidebarButton() {
        if (window._mailconfigInjecting || document.getElementById('mailconfig-nav-item')) return true;

        const settingsLink = document.querySelector('a[href="#/settings/"]') 
                          || document.querySelector('[data-test-nav="settings"]')
                          || document.querySelector('a[href*="settings"]');
                          
        const targetContainer = settingsLink ? settingsLink.parentElement : 
                                document.querySelector('.gh-nav-bottom') || 
                                document.querySelector('.gh-nav-list');
                                
        if (targetContainer) {
            window._mailconfigInjecting = true;
            fetch('/ghost/mailconfig/api/config').then(r => r.json()).then(config => {
                const hasAuth = config && config.options && config.options.auth && (config.options.auth.user || config.options.auth.pass || config.options.auth.api_key || config.options.auth.domain);
                const isConfigured = !!(config && config.transport && config.transport !== 'Direct' && hasAuth);
                const dotColor = isConfigured ? '#30cf43' : '#e24a4a';
                
                const li = document.createElement('li');
                li.id = 'mailconfig-nav-item';
                li.innerHTML = `<a href="#" onclick="window.openMailConfigOverlay(event)" style="display: flex; align-items: center; padding: 8px 20px; color: #394047; text-decoration: none; font-size: 1.4rem; font-weight: 500;">
                    <svg style="width: 16px; height: 16px; margin-right: 12px; fill: currentColor;" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    Mail Transport
                    <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor}; margin-left: auto;"></span>
                </a>`;
                
                if (settingsLink && settingsLink.parentElement) {
                    settingsLink.parentElement.insertAdjacentElement('afterend', li);
                } else {
                    targetContainer.appendChild(li);
                }
                console.log('[mailconfig] Injected Mail Transport button into sidebar.');
            }).catch(err => console.error('[mailconfig] config check failed', err));
            return true;
        }

        return false;
    }

    const observer = new MutationObserver(() => {
        injectSidebarButton();
    });
    
    document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });

    window.openMailConfigOverlay = function(e) {
        if (e) e.preventDefault();
        
        if (document.getElementById('mailconfig-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'mailconfig-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(8, 9, 12, 0.75)';
        overlay.style.backdropFilter = 'blur(4px)';
        overlay.style.zIndex = '9999999';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.animation = 'fadein 0.2s ease-in-out';
        
        overlay.innerHTML = `
            <style>
                @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
            </style>
            <div style="width: 90%; max-width: 580px; height: 85%; max-height: 800px; background: #f4f8fb; border-radius: 12px; overflow: hidden; position: relative; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                <button onclick="window.closeMailConfigOverlay()" style="position: absolute; top: 12px; right: 16px; border: none; background: rgba(0,0,0,0.05); border-radius: 50%; width: 32px; height: 32px; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #15171A; z-index: 10; transition: background 0.2s;">&times;</button>
                <iframe src="/ghost/mailconfig/" style="width: 100%; height: 100%; border: none; background: transparent;"></iframe>
            </div>
        `;
        document.body.appendChild(overlay);
    };

    window.closeMailConfigOverlay = function() {
        const overlay = document.getElementById('mailconfig-overlay');
        if (overlay) overlay.remove();
    };
})();
