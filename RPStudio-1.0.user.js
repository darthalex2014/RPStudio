// ==UserScript==
// @name         RPStudio
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Full rework of BTStudio/Studio.lab with a native UI integration for Google AI Studio.
// @author       RPStudio
// @match        https://aistudio.google.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=aistudio.google.com
// @grant        unsafeWindow
// @run-at       document-start
// @supportURL   https://boosty.to/wyccstreams
// @license      MIT; The original code is based on BTStudio/Studio.lab by OurPrince (astierdoriana).
// ==/UserScript==

/*
The MIT License (MIT)

Copyright (c) 2026 OurPrince

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

(function () {
    'use strict';

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // =========================================================================
    // 0. TRUSTED TYPES BYPASS
    // =========================================================================
    const TT = win.trustedTypes && win.trustedTypes.createPolicy ?
               win.trustedTypes.createPolicy('rpstudio-policy', { createHTML: s => s }) :
               { createHTML: s => s };

    // =========================================================================
    // 1. STATE & STORAGE
    // =========================================================================
    const TM_STORAGE_KEY = 'rpstudio_tm_state';
    const RP_STATE = {
        bypassEnabled: true, bypassMode: 'angular',
        optimizerEnabled: false, optimizerMode: 'smart', keepLast: 15, autoKeep: true,
        scrollBottomEnabled: true, wordCounterEnabled: true, bannerRemoverEnabled: true, mediaViewEnabled: true
    };

    try {
        const stored = localStorage.getItem(TM_STORAGE_KEY);
        if (stored) Object.assign(RP_STATE, JSON.parse(stored));
    } catch (e) {}

    function saveState(patch) {
        Object.assign(RP_STATE, patch);
        try { localStorage.setItem(TM_STORAGE_KEY, JSON.stringify(RP_STATE)); } catch(e) {}
    }

    // =========================================================================
    // 2. NETWORK INTERCEPTOR (Bypass)
    // =========================================================================
    const _origOpen = win.XMLHttpRequest.prototype.open;
    const _origSend = win.XMLHttpRequest.prototype.send;
    const _nativeRT = Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype, 'responseText')?.get;
    const _nativeR = Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype, 'response')?.get;

    win.XMLHttpRequest.prototype.open = function (method, url) {
        this.__aisuUrl = typeof url === 'string' ? url : '';
        this.__aisuIsGen = this.__aisuUrl.includes('GenerateContent');
        return _origOpen.apply(this, arguments);
    };

    win.XMLHttpRequest.prototype.send = function () {
        if (!this.__aisuIsGen) return _origSend.apply(this, arguments);

        const xhr = this;
        let snap = '';

        xhr.abort = function () { return; };

        if (_nativeRT) {
            Object.defineProperty(xhr, 'responseText', {
                get: function () {
                    const raw = _nativeRT.call(this);
                    if (!raw || !RP_STATE.bypassEnabled || RP_STATE.bypassMode !== 'angular') return raw;
                    return _sanitize(raw);
                }, configurable: true
            });
        }

        if (_nativeR) {
            Object.defineProperty(xhr, 'response', {
                get: function () {
                    const rt = this.responseType;
                    if (!rt || rt === 'text') {
                        const raw = _nativeR.call(this);
                        if (!RP_STATE.bypassEnabled || RP_STATE.bypassMode !== 'angular') return raw;
                        return (raw && typeof raw === 'string') ? _sanitize(raw) : raw;
                    }
                    return _nativeR.call(this);
                }, configurable: true
            });
        }

        xhr.addEventListener('readystatechange', function () {
            if (this.readyState === 3) {
                const raw = _nativeRT ? _nativeRT.call(this) : '';
                if (raw && raw.length > snap.length) snap = raw;
            }
            if (this.readyState === 4) {
                const raw = _nativeRT ? _nativeRT.call(this) : snap;
                if (raw || snap) window.dispatchEvent(new CustomEvent('__aisu_xhrCapture', { detail: { text: _extractText(raw || snap) } }));
            }
        });

        return _origSend.apply(this, arguments);
    };

    function _sanitize(s) {
        s = s.replace(/\[\],\d+/g, '[],1').replace(/\[null,\d+\]/g, '[null,1]');
        s = s.replace(/"The model output could not be generated[^"]*"/g, 'null');
        s = s.replace(/"SAFETY"|"RECITATION"|"PROHIBITED_CONTENT"|"IMAGE_SAFETY"|"SPII"|"BLOCKLIST"/g, '"STOP"');
        s = s.replace(/"blocked"\s*:\s*true/g, '"blocked":false');
        return s;
    }

    function _extractText(raw) {
        try {
            const matches = [...raw.matchAll(/null,"((?:[^"\\]|\\.)*)"/g)];
            if (matches.length) return matches.map(m => m[1]).filter(s => !/^v\d+_/.test(s) && !s.includes('could not be generated')).map(s => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')).join('');
        } catch (_) {}
        return raw ? raw.slice(0, 50000) : '';
    }

    // =========================================================================
    // 3. UI INJECTION & LOGIC
    // =========================================================================
    const CSS = `
    /* GUI Modal Styles */
    .rp-overlay { position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px); animation: rp-fade 0.15s ease-out; }
    @keyframes rp-fade { from { opacity: 0; } to { opacity: 1; } }
    .rp-dialog { background: var(--color-v3-surface-container, #1e1e1e); border: 1px solid #333; border-radius: 12px; width: 340px; font-family: Inter, sans-serif; color: #d4d4d4; box-shadow: 0 12px 32px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; max-height: 90vh; }
    .rp-header { padding: 16px 20px; font-size: 16px; font-weight: 600; color: #87a9ff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
    .rp-close-btn { background: transparent; border: none; color: #8c8c8c; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 50%; transition: 0.15s; line-height: 1; }
    .rp-close-btn:hover { background: #333; color: #fff; }

    .rp-body { display: flex; flex-direction: column; overflow-y: auto; padding: 12px 20px 20px; gap: 16px; }

    .rp-section { display: flex; flex-direction: column; gap: 10px; padding-bottom: 16px; border-bottom: 1px solid #333; }
    .rp-section:last-child { border-bottom: none; padding-bottom: 0; }
    .rp-sec-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #8c8c8c; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }

    .rp-row { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; color: #e3e3e3; }
    .rp-row input[type="checkbox"] { cursor: pointer; accent-color: #87a9ff; width: 16px; height: 16px; margin: 0; }
    .rp-row select { background: #2a2a2a; color: #d4d4d4; border: 1px solid #444; border-radius: 6px; padding: 4px 8px; font-size: 13px; flex: 1; cursor: pointer; outline: none; }
    .rp-row input[type="range"] { flex: 1; accent-color: #87a9ff; cursor: pointer; }

    /* Module Injected Styles */
    .rp-scroll-bottom-btn { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); width: 36px; height: 36px; border-radius: 50%; background: #252525; border: 1px solid #444; color: #d4d4d4; display: none; align-items: center; justify-content: center; cursor: pointer; z-index: 9999; }
    .rp-scroll-bottom-btn.visible { display: flex; }
    .rp-scroll-bottom-btn:hover { background: #333; }
    .rp-word-counter { margin-left: 8px; color: #8c8c8c; font-size: 11px; font-weight: 400; }
    .rp-load-banner { display: flex; justify-content: center; padding: 16px 0; }
    .rp-load-banner button { background: #1a1a1a; color: #fff; border: 1px solid #444; padding: 6px 16px; border-radius: 12px; cursor: pointer; font-size: 12px; }

    /* Media Grid Strict CSS */
    .rp-media-active .cdk-virtual-scroll-content-wrapper, .rp-media-active .chat-session-content { display: grid !important; grid-template-columns: repeat(12, 1fr) !important; gap: 4px !important; align-content: flex-start !important; justify-items: stretch !important; }
    .rp-media-active .cdk-virtual-scroll-content-wrapper > ms-chat-turn, .rp-media-active .chat-session-content > ms-chat-turn { grid-column: 1 / -1 !important; width: 100% !important; display: block !important; box-sizing: border-box !important; }
    .rp-media-active .cdk-virtual-scroll-content-wrapper > ms-chat-turn:has(ms-image-chunk), .rp-media-active .chat-session-content > ms-chat-turn:has(ms-image-chunk) { grid-column: span 2 !important; }
    .rp-media-active .cdk-virtual-scroll-content-wrapper > ms-chat-turn:has(ms-file-chunk), .rp-media-active .chat-session-content > ms-chat-turn:has(ms-file-chunk) { grid-column: span 4 !important; }
    `;

    const MODAL_HTML = `
    <div class="rp-dialog">
        <div class="rp-header">
            <span>★ RPStudio</span>
            <button class="rp-close-btn" id="rp-close-btn">×</button>
        </div>
        <div class="rp-body">
            <div class="rp-section">
                <div class="rp-sec-title">Content Bypass</div>
                <label class="rp-row"><input type="checkbox" id="cb-bypass"> Enable Bypass</label>
                <div class="rp-row">
                    Mode:
                    <select id="sel-bypass">
                        <option value="angular">Native (Network)</option>
                        <option value="dom">Legacy (Auto-Edit)</option>
                    </select>
                </div>
            </div>

            <div class="rp-section">
                <div class="rp-sec-title"><span>Chat Optimizer</span> <span style="color:#87a9ff; font-weight:normal;">Turns: <b id="rp-live-turns">0</b></span></div>
                <label class="rp-row"><input type="checkbox" id="cb-opti"> Enable Optimizer</label>
                <div class="rp-row">
                    Mode:
                    <select id="sel-opti">
                        <option value="smart">Smart (Hide & Restore)</option>
                        <option value="hard">Hard (Delete from RAM)</option>
                    </select>
                </div>
                <div id="rp-opti-opts" style="display:none; flex-direction:column; gap:10px; margin-top:4px; padding-top:12px; border-top:1px dashed #333;">
                    <label class="rp-row"><input type="checkbox" id="cb-autokeep"> Auto-limit (15 turns)</label>
                    <div class="rp-row">Keep: <input type="range" id="rng-keep" min="2" max="50"> <b id="lbl-keep">15</b></div>
                </div>
            </div>

            <div class="rp-section">
                <div class="rp-sec-title">UI Modules</div>
                <label class="rp-row"><input type="checkbox" id="cb-scroll"> Scroll to Bottom btn</label>
                <label class="rp-row"><input type="checkbox" id="cb-words"> Word Counter</label>
                <label class="rp-row"><input type="checkbox" id="cb-banners"> Hide Banners & Disclaimers</label>
                <label class="rp-row"><input type="checkbox" id="cb-media"> Native Media Grid</label>
            </div>

            <a href="https://boosty.to/wyccstreams" target="_blank" style="text-align:center; color:#8c8c8c; font-size:12px; text-decoration:none; margin-top:8px;">
                ☕ Support RPStudio Project
            </a>
        </div>
    </div>
    `;

    // ── Inject Main CSS ──
    document.head.insertAdjacentHTML('beforeend', TT.createHTML(`<style id="rp-main-css">${CSS}</style>`));

    // ── Ensure Toolbar Button ──
    function ensureToolbarButton() {
        const toolbarRight = document.querySelector('.toolbar-right');
        if (toolbarRight && !document.getElementById('rp-toolbar-btn')) {
            const btn = document.createElement('button');
            btn.id = 'rp-toolbar-btn';
            btn.className = 'mat-mdc-tooltip-trigger ms-button-borderless ms-button-icon';
            btn.setAttribute('aria-label', 'RPStudio Settings');
            btn.innerHTML = TT.createHTML(`<span class="material-symbols-outlined notranslate ms-button-icon-symbol" aria-hidden="true">★</span>`);
            btn.onclick = openModal;
            toolbarRight.prepend(btn);
        }
    }
    setInterval(ensureToolbarButton, 1000);

    // ── Modal Logic ──
    let modalOverlay = null;

    function openModal() {
        if (modalOverlay) modalOverlay.remove();

        modalOverlay = document.createElement('div');
        modalOverlay.className = 'rp-overlay';
        modalOverlay.id = 'rp-overlay';
        modalOverlay.innerHTML = TT.createHTML(MODAL_HTML);
        document.body.appendChild(modalOverlay);

        modalOverlay.onmousedown = (e) => { if (e.target === modalOverlay) modalOverlay.remove(); };
        document.getElementById('rp-close-btn').onclick = () => modalOverlay.remove();

        const bindCb = (id, key, callback) => {
            const cb = document.getElementById(id);
            cb.checked = !!RP_STATE[key];
            cb.onchange = () => { saveState({ [key]: cb.checked }); if (callback) callback(); };
        };
        const bindSel = (id, key, callback) => {
            const sel = document.getElementById(id);
            sel.value = RP_STATE[key];
            sel.onchange = () => { saveState({ [key]: sel.value }); if (callback) callback(); };
        };

        bindCb('cb-bypass', 'bypassEnabled');
        bindSel('sel-bypass', 'bypassMode');

        const updateOptiUI = () => {
            document.getElementById('rp-opti-opts').style.display = RP_STATE.optimizerEnabled ? 'flex' : 'none';
            document.getElementById('rng-keep').disabled = RP_STATE.autoKeep;
            document.getElementById('rng-keep').value = RP_STATE.autoKeep ? 15 : RP_STATE.keepLast;
            document.getElementById('lbl-keep').textContent = document.getElementById('rng-keep').value;
        };

        bindCb('cb-opti', 'optimizerEnabled', () => { opti_sync(); updateOptiUI(); });
        bindSel('sel-opti', 'optimizerMode', () => { opti_sync(); updateOptiUI(); });
        bindCb('cb-autokeep', 'autoKeep', updateOptiUI);

        document.getElementById('rng-keep').oninput = (e) => {
            saveState({ keepLast: parseInt(e.target.value) });
            updateOptiUI();
        };

        bindCb('cb-scroll', 'scrollBottomEnabled');
        bindCb('cb-words', 'wordCounterEnabled', wordCounter_update);
        bindCb('cb-banners', 'bannerRemoverEnabled', banner_update);
        bindCb('cb-media', 'mediaViewEnabled', media_update);

        updateOptiUI();

        setInterval(() => {
            const c = document.getElementById('rp-live-turns');
            if (c) c.textContent = document.querySelectorAll('ms-chat-turn').length;
        }, 1000);
    }

    // =========================================================================
    // 4. MODULES LOGIC
    // =========================================================================

    // --- Optimizer Logic ---
    let opti_detached = [], opti_parent = null, opti_int = null;
    let opti_paused = false, opti_lastCount = 0;

    function opti_sync() {
        if (RP_STATE.optimizerEnabled) {
            if (!opti_int) opti_int = setInterval(opti_apply, 600);
        } else {
            if (opti_int) { clearInterval(opti_int); opti_int = null; }
            if (RP_STATE.optimizerMode === 'smart') opti_restoreAll();
        }
    }

    function opti_apply() {
        const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
        if (!turns.length) return;

        if (turns.length > opti_lastCount) {
            opti_paused = false;
        } else if (turns.length < opti_lastCount && turns.length > RP_STATE.keepLast) {
            opti_lastCount = turns.length;
        }
        if (!opti_paused) opti_lastCount = turns.length;

        const keep = RP_STATE.autoKeep ? 15 : parseInt(RP_STATE.keepLast);
        if (turns.length <= keep) return;

        const scroller = document.querySelector('ms-autoscroll-container div') || document.querySelector('ms-autoscroll-container');
        const isAtBottom = scroller && ((scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 600);

        if (RP_STATE.optimizerMode === 'hard') {
            if (isAtBottom) {
                const cutoff = turns.length - keep;
                for (let i = 0; i < cutoff; i++) turns[i].remove();
                opti_lastCount = document.querySelectorAll('ms-chat-turn').length;
            }
            return;
        }

        if (opti_paused || !isAtBottom) return;

        if (!opti_parent && turns[0].parentNode) opti_parent = turns[0].parentNode;

        const cutoff = turns.length - keep;
        for (let i = 0; i < cutoff; i++) { opti_detached.push(turns[i]); turns[i].remove(); }

        if (cutoff > 0) {
            opti_lastCount = document.querySelectorAll('ms-chat-turn').length;
            let banner = document.querySelector('.rp-load-banner');
            if (!banner) {
                banner = document.createElement('div'); banner.className = 'rp-load-banner';
                opti_parent.insertBefore(banner, opti_parent.firstChild);
            }
            banner.innerHTML = TT.createHTML(`<button type="button">Restore Everything (${opti_detached.length} hidden)</button>`);
            banner.querySelector('button').onclick = opti_restoreAll;
        }
    }

    function opti_restoreAll() {
        opti_paused = true;
        const anchor = opti_parent ? opti_parent.querySelector('ms-chat-turn') : null;
        opti_detached.forEach(turn => {
            if (anchor) opti_parent.insertBefore(turn, anchor);
            else if (opti_parent) opti_parent.appendChild(turn);
        });
        opti_detached = [];
        const banner = document.querySelector('.rp-load-banner');
        if (banner) banner.remove();
        opti_lastCount = document.querySelectorAll('ms-chat-turn').length;
    }
    opti_sync();

    // --- Legacy DOM Bypass ---
    let oldBypassLast = '', oldBypassSave = 0, oldBypassRestoring = false, oldBypassSse = '', oldBypassSseSave = 0;
    window.addEventListener('__aisu_xhrCapture', (e) => { oldBypassSse = e.detail?.text || ''; oldBypassSseSave = Date.now(); });
    new MutationObserver(() => {
        if (!RP_STATE.bypassEnabled || RP_STATE.bypassMode !== 'dom' || oldBypassRestoring) return;
        const turns = document.querySelectorAll('.turn-content');
        if (!turns.length) return;
        const currentTurn = turns[turns.length - 1];
        if (currentTurn.querySelector('span.material-symbols-outlined')?.textContent.includes('warning')) {
            const now = Date.now();
            const md = (oldBypassSse && now - oldBypassSseSave < 15000) ? oldBypassSse : ((oldBypassLast && now - oldBypassSave < 15000) ? oldBypassLast : null);
            if (!md) return;
            oldBypassRestoring = true;
            const btn = currentTurn.closest('.chat-turn-container')?.querySelector('button.toggle-edit-button');
            if (btn) {
                btn.click();
                setTimeout(() => {
                    const txt = currentTurn.closest('.chat-turn-container')?.querySelector('textarea');
                    if (txt) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(txt, md); txt.dispatchEvent(new Event('input', {bubbles:true})); }
                    setTimeout(() => { currentTurn.closest('.chat-turn-container')?.querySelector('button.toggle-edit-button')?.click(); oldBypassRestoring = false; }, 500);
                }, 150);
            }
        } else {
            const chunk = currentTurn.querySelector('.text-chunk');
            if (chunk && chunk.querySelector('ms-cmark-node')) {
                oldBypassLast = Array.from(chunk.childNodes).map(n=>n.textContent).join('');
                oldBypassSave = Date.now();
            }
        }
    }).observe(document.documentElement, {childList: true, subtree: true, characterData: true});

    // --- Scroll Bottom ---
    let sb_scroller = null;
    setInterval(() => {
        if (!RP_STATE.scrollBottomEnabled) { document.querySelector('.rp-scroll-bottom-btn')?.classList.remove('visible'); return; }
        let btn = document.querySelector('.rp-scroll-bottom-btn');
        if (!btn && document.querySelector('ms-prompt-box')) {
            btn = document.createElement('div'); btn.className = 'rp-scroll-bottom-btn';
            btn.innerHTML = TT.createHTML(`<svg width="18" height="18" viewBox="0 0 24 24"><path d="M11 4v12l-5.6-5.6L4 12l8 8 8-8-1.4-1.4-5.6 5.6V4h-2z" fill="currentColor"/></svg>`);
            btn.onclick = () => { if(sb_scroller) sb_scroller.scrollTo({top: sb_scroller.scrollHeight, behavior: 'smooth'}); };
            document.querySelector('ms-prompt-box').appendChild(btn);
        }
        let scr = document.querySelector('ms-autoscroll-container div') || document.querySelector('ms-autoscroll-container');
        const turns = document.querySelectorAll('ms-chat-turn');
        if (turns.length > 0) {
            let n = turns[turns.length-1].parentElement;
            while(n && n !== document.body) { if(n.scrollHeight > n.clientHeight + 20) { scr = n; break; } n = n.parentElement; }
        }
        if (scr && scr !== sb_scroller) {
            if(sb_scroller) sb_scroller.onscroll = null;
            sb_scroller = scr;
            sb_scroller.onscroll = () => { if(btn) btn.classList.toggle('visible', (sb_scroller.scrollHeight - sb_scroller.scrollTop - sb_scroller.clientHeight) > 40); };
        }
        if(sb_scroller && btn) btn.classList.toggle('visible', (sb_scroller.scrollHeight - sb_scroller.scrollTop - sb_scroller.clientHeight) > 40);
    }, 1000);

    // --- Word Counter ---
    function wordCounter_update() {
        if (!RP_STATE.wordCounterEnabled) { document.querySelectorAll('.rp-word-counter').forEach(e=>e.remove()); return; }
        document.querySelectorAll('ms-chat-turn').forEach(turn => {
            let hdr = turn.querySelector('.author-label') || (turn.previousElementSibling?.tagName === 'MS-CHAT-TURN' ? turn.previousElementSibling.querySelector('.author-label') : null);
            if (!hdr) return;
            const txt = Array.from(turn.querySelectorAll('ms-text-chunk')).map(c=>c.innerText).join('\n').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            if(!txt) return;
            let b = hdr.querySelector('.rp-word-counter');
            if(!b) { b = document.createElement('span'); b.className = 'rp-word-counter'; hdr.appendChild(b); }
            b.textContent = `${txt.split(/\s+/).length} words • ${txt.length} chars`;
        });
    }
    new MutationObserver(() => { if(RP_STATE.wordCounterEnabled) wordCounter_update(); }).observe(document.documentElement, {childList: true, subtree: true, characterData: true});

    // --- Banners Remover ---
    function banner_update() {
        let s = document.getElementById('rp-banner-remover');
        if (RP_STATE.bannerRemoverEnabled) {
            if(!s) { document.head.insertAdjacentHTML('beforeend', TT.createHTML(`<style id="rp-banner-remover">ms-navbar-upgrade-card, ms-hallucinations-disclaimer, ms-chat-session ms-opaque-container-485387979-1, ms-navbar-v2 ms-opaque-container-485387979, .quota-exceeded-container { display: none !important; }</style>`)); }
        } else { if(s) s.remove(); }
    }
    banner_update();

    // --- Media View ---
    function media_update() {
        if (RP_STATE.mediaViewEnabled) {
            document.body.classList.add('rp-media-active');
        } else {
            document.body.classList.remove('rp-media-active');
        }
    }
    media_update();
    new MutationObserver(media_update).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

})();