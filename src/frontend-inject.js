(function() {
    'use strict';
    
    let injected = false;

    function injectSidebarButton() {
        if (document.getElementById('mailconfig-nav-item')) {
            injected = true;
            return true;
        }

        const settingsLink = document.querySelector('a[href="#/settings/"]') 
                          || document.querySelector('[data-test-nav="settings"]')
                          || document.querySelector('a[href*="settings"]');
                          
        if (settingsLink) {
            const settingsLi = settingsLink.closest('li') || settingsLink.parentElement;
            if (!settingsLi || !settingsLi.parentElement) return false;

            // Fetch config to check transport status and set indicator dot color
            fetch('/ghost/mailconfig/api/config').then(r => r.json()).then(config => {
                if (document.getElementById('mailconfig-nav-item')) return;

                const hasAuth = config && config.options && config.options.auth && (config.options.auth.user || config.options.auth.pass || config.options.auth.api_key || config.options.auth.domain);
                const isConfigured = !!(config && config.transport && config.transport !== 'Direct' && hasAuth);
                const dotColor = isConfigured ? '#30cf43' : '#e24a4a';
                
                const li = document.createElement(settingsLi.tagName);
                li.id = 'mailconfig-nav-item';
                li.className = settingsLi.className;
                
                const a = document.createElement(settingsLink.tagName);
                a.id = 'mailconfig-nav-link';
                a.href = '#';
                
                // Clone classes, excluding active
                const classes = settingsLink.className.split(' ').filter(c => !c.toLowerCase().includes('active'));
                a.className = classes.join(' ');

                let iconSize = '18';
                const settingsSvg = settingsLink.querySelector('svg');
                if (settingsSvg) {
                    iconSize = settingsSvg.getAttribute('width') || settingsSvg.getAttribute('height') || '18';
                }

                a.innerHTML = `
                    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: 12px; vertical-align: middle;">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <span style="vertical-align: middle;">Mail Transport</span>
                    <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor}; margin-left: auto; display: inline-block; vertical-align: middle;"></span>
                `;
                
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.openMailConfigOverlay();
                });
                
                li.appendChild(a);
                
                // Insert before settings link
                settingsLi.parentElement.insertBefore(li, settingsLi);
                injected = true;
                console.log('[mailconfig] Injected Mail Transport button into sidebar before Settings.');
            }).catch(err => console.error('[mailconfig] config check failed', err));
            return true;
        }
        return false;
    }

    window.openMailConfigOverlay = function() {
        if (document.getElementById('mailconfig-overlay')) return;
        
        const isDark = document.documentElement.classList.contains('dark');
        
        const overlay = document.createElement('div');
        overlay.id = 'mailconfig-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(8, 9, 12, 0.4);
            backdrop-filter: blur(2px);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: mailconfigFadeIn 0.2s ease-out;
        `;
        
        overlay.innerHTML = `
            <style>
                @keyframes mailconfigFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes mailconfigFadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes mailconfigSlideIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes mailconfigSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(12px); opacity: 0; } }
            </style>
            <div id="mailconfig-modal-box" style="
                width: 90%; 
                max-width: 680px; 
                height: 85%; 
                max-height: 800px; 
                background: ${isDark ? '#15171a' : '#ffffff'}; 
                border: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; 
                border-radius: 12px; 
                overflow: hidden; 
                box-shadow: 0 20px 40px rgba(0,0,0,0.15); 
                display: flex; 
                flex-direction: column; 
                animation: mailconfigSlideIn 0.25s cubic-bezier(0.19, 1, 0.22, 1);
            ">
                <iframe src="/ghost/mailconfig/" style="width: 100%; height: 100%; border: none; background: transparent;"></iframe>
            </div>
        `;
        
        // Close when clicking outside the modal box
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                window.closeMailConfigOverlay();
            }
        });

        document.body.appendChild(overlay);
        
        // Highlight sidebar nav item
        const navLink = document.getElementById('mailconfig-nav-link');
        if (navLink) {
            navLink.classList.add('active');
        }
    };

    window.closeMailConfigOverlay = function() {
        const overlay = document.getElementById('mailconfig-overlay');
        if (overlay) {
            const box = document.getElementById('mailconfig-modal-box');
            if (box) box.style.animation = 'mailconfigSlideOut 0.2s ease-in forwards';
            overlay.style.animation = 'mailconfigFadeOut 0.2s ease-in forwards';
            
            setTimeout(() => {
                overlay.remove();
                const navLink = document.getElementById('mailconfig-nav-link');
                if (navLink) {
                    navLink.classList.remove('active');
                }
            }, 180);
        }
    };

    // Watch for theme changes on root to keep modal backdrop and box colors synchronized
    const themeObserver = new MutationObserver(() => {
        const overlay = document.getElementById('mailconfig-overlay');
        const box = document.getElementById('mailconfig-modal-box');
        if (overlay && box) {
            const isDark = document.documentElement.classList.contains('dark');
            box.style.background = isDark ? '#15171a' : '#ffffff';
            box.style.borderColor = isDark ? '#24272c' : '#f0f3f6';
        }
    });

    if (document.body) {
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(injectSidebarButton).observe(document.body, { childList: true, subtree: true });
        injectSidebarButton();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
            new MutationObserver(injectSidebarButton).observe(document.body, { childList: true, subtree: true });
            injectSidebarButton();
        });
    }
})();
