(function() {
    'use strict';
    
    let injected = false;
    let mcContainer = null;

    function syncTheme() {
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('ghost-admin-theme', isDark ? 'dark' : 'light');
        if (mcContainer) {
            mcContainer.style.background = isDark ? '#101114' : '#ffffff';
        }
    }
    syncTheme();

    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

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
                if (a.tagName === 'A') {
                    a.href = '#/settings/mail-transport';
                }
                
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
                    window.location.hash = '#/settings/mail-transport';
                });
                
                li.appendChild(a);
                
                // Insert after settings link
                settingsLi.parentElement.insertBefore(li, settingsLi.nextSibling);
                injected = true;
                console.log('[mailconfig] Injected Mail Transport button into sidebar.');
                
                // Handle active state immediately if hash matches on load
                handleHashChange();
            }).catch(err => console.error('[mailconfig] config check failed', err));
            return true;
        }
        return false;
    }

    function handleHashChange() {
        const hash = window.location.hash;
        if (hash === '#/settings/mail-transport' || hash === '#/mail-transport') {
            showMailConfigView();
        } else {
            hideMailConfigView();
        }
    }

    function showMailConfigView() {
        const emberApp = document.getElementById('ember-app');
        const reactApp = document.getElementById('root');
        
        // Hide standard app shells
        if (emberApp) emberApp.style.setProperty('display', 'none', 'important');
        if (reactApp) reactApp.style.setProperty('display', 'none', 'important');

        const isDark = document.documentElement.classList.contains('dark');

        if (!mcContainer) {
            mcContainer = document.createElement('div');
            mcContainer.id = 'mailconfig-container';
            mcContainer.style.cssText = `
                position: fixed; 
                top: 0; 
                left: 0; 
                width: 100vw; 
                height: 100vh; 
                z-index: 999999; 
                background: ${isDark ? '#101114' : '#ffffff'};
            `;
            document.body.appendChild(mcContainer);
        }
        
        mcContainer.style.display = 'block';

        let iframe = mcContainer.querySelector('iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.src = '/ghost/mailconfig/';
            iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: transparent;';
            mcContainer.appendChild(iframe);
        }

        // Highlight sidebar nav item
        const navLink = document.getElementById('mailconfig-nav-link');
        if (navLink) {
            navLink.classList.add('active');
        }
    }

    function hideMailConfigView() {
        const emberApp = document.getElementById('ember-app');
        const reactApp = document.getElementById('root');
        
        if (emberApp) emberApp.style.removeProperty('display');
        if (reactApp) reactApp.style.removeProperty('display');

        if (mcContainer) {
            mcContainer.style.display = 'none';
            mcContainer.innerHTML = '';
        }

        const navLink = document.getElementById('mailconfig-nav-link');
        if (navLink) {
            navLink.classList.remove('active');
        }
    }

    window.addEventListener('hashchange', handleHashChange);

    const observer = new MutationObserver(() => {
        injectSidebarButton();
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        injectSidebarButton();
        handleHashChange();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
            injectSidebarButton();
            handleHashChange();
        });
    }
})();
