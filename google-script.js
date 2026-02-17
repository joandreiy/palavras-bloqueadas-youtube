// ==UserScript==
// @name         YouTube Kids Pro V3.3 (Google Script)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Filtro Google Search - usa funções do common.js
// @author       Você
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    if (!window.location.hostname.includes('google')) return;

    const BP = window.BloqueadorParental;
    if (!BP) { console.error('[Bloqueador Parental] common.js não carregou!'); return; }

    const { LOG_PREFIX, debug, contemTermo, estaNoWhitelist, debounce, getTermos } = BP;

    console.log(`${LOG_PREFIX} V3.3 Google Script Iniciado.`);

    // --- FILTRO GOOGLE ---

    function verificarQueryGoogle() {
        const params = new URLSearchParams(window.location.search);
        const query = params.get('q');
        if (!query) return false;

        debug(`Google: query="${query}"`);

        if (estaNoWhitelist(query)) return false;

        const match = contemTermo(query);
        if (match) {
            console.log(`${LOG_PREFIX} Query bloqueada: "${match}" na busca "${query}"`);

            const rcnt = document.getElementById('rcnt');
            if (rcnt) {
                Array.from(rcnt.children).forEach(child => {
                    if (child.id !== 'bloqueio-aviso') {
                        child.style.setProperty('display', 'none', 'important');
                    }
                });
            }

            const center = document.getElementById('center_col') || document.getElementById('rcnt');
            if (center && !document.getElementById('bloqueio-aviso')) {
                const aviso = document.createElement('div');
                aviso.id = 'bloqueio-aviso';
                aviso.style.cssText = 'padding:40px;text-align:center;color:#f28b82;font-size:20px;font-family:Arial,sans-serif;';
                aviso.textContent = '🚫 Pesquisa bloqueada pelo controle parental.';
                center.prepend(aviso);
            }
            return true;
        }
        return false;
    }

    function filtrarGoogle() {
        const termos = getTermos();
        if (termos.length === 0) {
            debug('Google: filtrarGoogle() - termos.length === 0, abortando.');
            return;
        }

        debug('Google: filtrarGoogle() chamado.');

        if (verificarQueryGoogle()) return;

        const seletores = [
            '#search .g',
            '#rso .MjjYud',
            'div.g',
            'div[data-tbnid]',
            'div.related-question-pair',
            'div[data-video-url]',
            'g-card',
            'g-inner-card',
        ];

        const itens = document.querySelectorAll(seletores.join(','));
        debug(`Google: ${itens.length} resultados encontrados.`);

        itens.forEach(item => {
            if (item.style.display === 'none') return;

            const texto = item.innerText || '';
            const textoLen = texto.length.toString();

            if (item.dataset.bloqueioChecked === textoLen) return;
            if (texto.trim().length < 3) return;

            if (estaNoWhitelist(texto)) {
                item.dataset.bloqueioChecked = textoLen;
                return;
            }

            const match = contemTermo(texto);

            if (match) {
                item.style.setProperty('display', 'none', 'important');
                console.log(`${LOG_PREFIX} Google Bloqueado: "${match}" em <${item.tagName} class="${item.className}">`);
            } else {
                item.dataset.bloqueioChecked = textoLen;
            }
        });

        const rcnt = document.getElementById('rcnt');
        if (rcnt) {
            Array.from(rcnt.querySelectorAll('div[data-hveid], section, g-section-with-header')).forEach(item => {
                if (item.style.display === 'none') return;

                const texto = item.innerText || '';
                const textoLen = texto.length.toString();

                if (item.dataset.bloqueioChecked === textoLen) return;
                if (texto.trim().length < 20) return;

                if (estaNoWhitelist(texto)) {
                    item.dataset.bloqueioChecked = textoLen;
                    return;
                }

                const match = contemTermo(texto);
                if (match) {
                    let target = item;
                    let parent = item.parentElement;
                    while (parent && parent.id !== 'rcnt' && parent.id !== 'rso' && parent.id !== 'search') {
                        if (parent.dataset && parent.dataset.hveid !== undefined) {
                            target = parent;
                        }
                        parent = parent.parentElement;
                    }
                    target.style.setProperty('display', 'none', 'important');
                    target.dataset.bloqueioChecked = textoLen;
                    console.log(`${LOG_PREFIX} Google genérico bloqueado: "${match}" em <${target.tagName} class="${target.className}">`);
                } else {
                    item.dataset.bloqueioChecked = textoLen;
                }
            });
        }
    }

    // --- MUTATION OBSERVER ---
    const filtroComDebounce = debounce(filtrarGoogle, 300);
    const observer = new MutationObserver(filtroComDebounce);

    function iniciarObservador() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });

            let lastUrl = location.href;
            new MutationObserver(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    debug('Google: URL mudou, re-aplicando filtro...');
                    setTimeout(filtrarGoogle, 500);
                }
            }).observe(document, { subtree: true, childList: true });

            filtrarGoogle();
            console.log(`${LOG_PREFIX} Observer Google iniciado com sucesso.`);
        } else {
            setTimeout(iniciarObservador, 50);
        }
    }

    iniciarObservador();
})();
