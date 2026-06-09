(function() {
    'use strict';

    // ── Shared Plugin Registry & Controller ───────────────────────────
    window.__ghostPlugins = window.__ghostPlugins || {
        registry: [],
        register: function(plugin) {
            if (!this.registry.some(p => p.id === plugin.id)) {
                this.registry.push(plugin);
                this.render();
            }
        },
        manage: function(id) {
            const plugin = this.registry.find(p => p.id === id);
            if (plugin && typeof plugin.action === 'function') {
                window.closePluginsDashboard();
                setTimeout(() => {
                    plugin.action();
                }, 200);
            }
        },
        render: function() {
            const overlay = document.getElementById('ghost-plugins-overlay');
            if (overlay) {
                window.closePluginsDashboard();
                window.openPluginsDashboard();
            }
        }
    };

    // ── Unified Installed Plugins Tab Injector ────────────────────────
    let pluginsTabInjected = false;

    function injectPluginsTab() {
        if (document.getElementById('ghost-plugins-nav-item')) {
            pluginsTabInjected = true;
            return true;
        }

        if (!window.__ghostPlugins || !window.__ghostPlugins.registry || window.__ghostPlugins.registry.length === 0) {
            return false;
        }

        // Ghost 6 Selector Patch
        const settingsLink = document.querySelector('[data-test-nav="settings"]')
                          || document.querySelector('a[href*="settings"]')
                          || document.querySelector('.gh-nav-bottom a');
                          
        if (settingsLink) {
            const settingsLi = settingsLink.closest('li') || settingsLink.parentElement;
            if (!settingsLi || !settingsLi.parentElement) return false;

            const li = document.createElement(settingsLi.tagName);
            li.id = 'ghost-plugins-nav-item';
            li.className = settingsLi.className;
            
            const a = document.createElement(settingsLink.tagName);
            a.id = 'ghost-plugins-nav-link';
            a.href = '#';
            
            const classes = settingsLink.className.split(' ').filter(c => !c.toLowerCase().includes('active'));
            a.className = classes.join(' ');

            const settingsSpan = settingsLink.querySelector('span');
            
            let svgHtml = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: 12px; vertical-align: middle;">
                    <rect x="3" y="3" width="7" height="9"></rect>
                    <rect x="14" y="3" width="7" height="5"></rect>
                    <rect x="14" y="12" width="7" height="9"></rect>
                    <rect x="3" y="16" width="7" height="5"></rect>
                </svg>
            `;

            let spanHtml = settingsSpan 
                ? `<span class="${settingsSpan.className}" style="vertical-align: middle;">Installed Plugins</span>`
                : `<span style="vertical-align: middle;">Installed Plugins</span>`;

            a.innerHTML = svgHtml + '\n' + spanHtml;
            
            a.addEventListener('click', (e) => {
                e.preventDefault();
                window.openPluginsDashboard();
            });
            
            li.appendChild(a);
            settingsLi.parentElement.insertBefore(li, settingsLi);
            pluginsTabInjected = true;
            console.log('[ghost-plugins] Injected Unified Plugins option tab in sidebar.');
            return true;
        }
        return false;
    }

    // ── Installed Plugins Dashboard Overlay UI ────────────────────────
    window.openPluginsDashboard = function() {
        if (document.getElementById('ghost-plugins-overlay')) return;
        
        const isDark = document.documentElement.classList.contains('dark');
        const overlay = document.createElement('div');
        overlay.id = 'ghost-plugins-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(8, 9, 12, 0.45); backdrop-filter: blur(4px);
            z-index: 999998; display: flex; justify-content: center; align-items: center;
            animation: pluginsFadeIn 0.2s ease-out;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        
        let cardsHtml = '';
        const registry = window.__ghostPlugins.registry || [];
        
        registry.forEach(plugin => {
            cardsHtml += `
                <div class="plugin-card" style="display: flex; align-items: center; padding: 18px; background: ${isDark ? '#191b1f' : '#f9fafb'}; border: 1px solid ${isDark ? '#2a2e35' : '#e5e7eb'}; border-radius: 10px; margin-bottom: 12px; transition: all 0.2s ease;">
                    <div class="plugin-icon" style="width: 42px; height: 42px; border-radius: 8px; background: ${isDark ? '#24272d' : '#f3f4f6'}; display: flex; justify-content: center; align-items: center; margin-right: 16px; color: ${isDark ? '#e1e3e6' : '#1f2937'}; flex-shrink: 0;">
                        ${plugin.icon || ''}
                    </div>
                    <div style="flex-grow: 1; min-width: 0; margin-right: 16px;">
                        <div style="display: flex; align-items: center; margin-bottom: 4px;">
                            <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: ${isDark ? '#f3f4f6' : '#111827'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${plugin.name}</h4>
                            <span style="font-size: 11px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-left: 8px; padding: 1px 6px; background: ${isDark ? '#24272d' : '#f3f4f6'}; border-radius: 4px; font-weight: 500;">v${plugin.version || '1.0.0'}</span>
                        </div>
                        <p style="margin: 0; font-size: 13px; color: ${isDark ? '#9ca3af' : '#4b5563'}; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${plugin.description || ''}</p>
                    </div>
                    <div style="display: flex; align-items: center; flex-shrink: 0;">
                        <span style="display: flex; align-items: center; margin-right: 16px; font-size: 13px; color: ${isDark ? '#34d399' : '#10b981'}; font-weight: 500;">
                            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${isDark ? '#34d399' : '#10b981'}; display: inline-block; margin-right: 6px; box-shadow: 0 0 8px ${isDark ? '#34d399' : '#10b981'};"></span>
                            Active
                        </span>
                        <button onclick="window.__ghostPlugins.manage('${plugin.id}')" style="padding: 6px 14px; font-size: 13px; font-weight: 500; border-radius: 6px; border: 1px solid ${isDark ? '#3a404a' : '#d1d5db'}; background: ${isDark ? '#24272d' : '#ffffff'}; color: ${isDark ? '#f3f4f6' : '#374151'}; cursor: pointer; transition: all 0.15s ease;">Configure</button>
                    </div>
                </div>
            `;
        });
        
        overlay.innerHTML = `
            <style>
                @keyframes pluginsFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pluginsFadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes pluginsSlideIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes pluginsSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(12px); opacity: 0; } }
            </style>
            <div id="ghost-plugins-modal-box" style="width: 90%; max-width: 680px; height: 80%; max-height: 600px; background: ${isDark ? '#15171a' : '#ffffff'}; border: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); display: flex; flex-direction: column; animation: pluginsSlideIn 0.25s cubic-bezier(0.19, 1, 0.22, 1);">
                <div style="padding: 24px; border-bottom: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: ${isDark ? '#f3f4f6' : '#111827'};">Installed Plugins</h3>
                        <p style="margin: 0; font-size: 13.5px; color: ${isDark ? '#9ca3af' : '#6b7280'};">Manage and configure your custom Ghost extensions.</p>
                    </div>
                    <button onclick="window.closePluginsDashboard()" style="background: none; border: none; color: ${isDark ? '#9ca3af' : '#6b7280'}; cursor: pointer; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div style="flex-grow: 1; overflow-y: auto; padding: 24px;">
                    ${cardsHtml || '<div style="text-align: center; padding: 48px 0; color: #6b7280;"><p style="margin: 0; font-size: 15px; font-weight: 500;">No active plugins detected.</p></div>'}
                </div>
            </div>
        `;
        
        overlay.addEventListener('click', (e) => { if (e.target === overlay) window.closePluginsDashboard(); });
        document.body.appendChild(overlay);
    };

    window.closePluginsDashboard = function() {
        const overlay = document.getElementById('ghost-plugins-overlay');
        if (overlay) {
            const box = document.getElementById('ghost-plugins-modal-box');
            if (box) box.style.animation = 'pluginsSlideOut 0.2s ease-in forwards';
            overlay.style.animation = 'pluginsFadeOut 0.2s ease-in forwards';
            setTimeout(() => { overlay.remove(); }, 180);
        }
    };

    // ── Individual Mail Transport UI Injector & Actions ────────────────
    let mailconfigInjected = false;
    let isFetchingConfig = false;

    function injectSidebarButton() {
        if (document.getElementById('mailconfig-nav-item')) {
            mailconfigInjected = true;
            return true;
        }

        // Ghost 6 Selector Patch
        const settingsLink = document.querySelector('[data-test-nav="settings"]')
                          || document.querySelector('a[href*="settings"]')
                          || document.querySelector('.gh-nav-bottom a');
                                  
        if (settingsLink && !isFetchingConfig) {
            const settingsLi = settingsLink.closest('li') || settingsLink.parentElement;
            if (!settingsLi || !settingsLi.parentElement) return false;

            isFetchingConfig = true;
            
            fetch('/ghost/mailconfig/api/config')
                .then(r => r.json())
                .then(config => {
                    isFetchingConfig = false;
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
                    
                    const classes = settingsLink.className.split(' ').filter(c => !c.toLowerCase().includes('active'));
                    a.className = classes.join(' ');

                    const settingsSpan = settingsLink.querySelector('span');
                    let spanHtml = settingsSpan 
                        ? `<span class="${settingsSpan.className}" style="vertical-align: middle;">Mail Transport</span>`
                        : `<span style="vertical-align: middle;">Mail Transport</span>`;

                    a.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-right: 12px; vertical-align: middle;">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                        ${spanHtml}
                        <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor}; margin-left: auto; display: inline-block; vertical-align: middle; margin-right: 4px;"></span>
                    `;
                    
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        window.openMailConfigOverlay();
                    });
                    
                    li.appendChild(a);
                    settingsLi.parentElement.insertBefore(li, settingsLi);
                    mailconfigInjected = true;
                    console.log('[mailconfig] Injected Mail Transport button into sidebar.');
                })
                .catch(err => {
                    isFetchingConfig = false;
                    console.error('[mailconfig] config check failed', err);
                });
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
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(8, 9, 12, 0.4); backdrop-filter: blur(2px);
            z-index: 999999; display: flex; justify-content: center; align-items: center;
            animation: mailconfigFadeIn 0.2s ease-out;
        `;
        
        overlay.innerHTML = `
            <style>
                @keyframes mailconfigFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes mailconfigFadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes mailconfigSlideIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes mailconfigSlideOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(12px); opacity: 0; } }
            </style>
            <div id="mailconfig-modal-box" style="width: 90%; max-width: 680px; height: 85%; max-height: 800px; background: ${isDark ? '#15171a' : '#ffffff'}; border: 1px solid ${isDark ? '#24272c' : '#f0f3f6'}; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; flex-direction: column; animation: mailconfigSlideIn 0.25s cubic-bezier(0.19, 1, 0.22, 1);">
                <iframe src="/ghost/mailconfig/" style="width: 100%; height: 100%; border: none; background: transparent;"></iframe>
            </div>
        `;
        
        overlay.addEventListener('click', (e) => { if (e.target === overlay) window.closeMailConfigOverlay(); });
        document.body.appendChild(overlay);
    };

    window.closeMailConfigOverlay = function() {
        const overlay = document.getElementById('mailconfig-overlay');
        if (overlay) {
            const box = document.getElementById('mailconfig-modal-box');
            if (box) box.style.animation = 'mailconfigSlideOut 0.2s ease-in forwards';
            overlay.style.animation = 'mailconfigFadeOut 0.2s ease-in forwards';
            setTimeout(() => { overlay.remove(); }, 180);
        }
    };

    // ── Self Registration and Observers ───────────────────────────────
    window.__ghostPlugins.register({
        id: 'mailconfig',
        name: 'Mail Transport',
        description: 'Configure custom mail SMTP settings, credentials, and email delivery providers natively.',
        version: '1.1.3',
        icon: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
        `,
        action: window.openMailConfigOverlay
    });

    // Theme sync listener
    const themeObserver = new MutationObserver(() => {
        const overlays = [
            { id: 'mailconfig-overlay', boxId: 'mailconfig-modal-box' },
            { id: 'ghost-plugins-overlay', boxId: 'ghost-plugins-modal-box' }
        ];
        overlays.forEach(ov => {
            const el = document.getElementById(ov.id);
            const box = document.getElementById(ov.boxId);
            if (el && box) {
                const isDark = document.documentElement.classList.contains('dark');
                box.style.background = isDark ? '#15171a' : '#ffffff';
                box.style.borderColor = isDark ? '#24272c' : '#f0f3f6';
            }
        });
    });

    function runInjection() {
        injectPluginsTab();
        injectSidebarButton();
    }

    if (document.body) {
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(runInjection).observe(document.body, { childList: true, subtree: true });
        runInjection();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
            new MutationObserver(runInjection).observe(document.body, { childList: true, subtree: true });
            runInjection();
        });
    }
})();
