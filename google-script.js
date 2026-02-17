// ==UserScript==
// @name         YouTube Kids Pro V3.3 (Google Script)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Script de filtro para Google Search - carregado via @require pelo loader
// @author       Você
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // Só executa no Google
    if (!window.location.hostname.includes('google')) return;

    const LOG_PREFIX = "[Bloqueador Parental]";
    const DEBUG = true;

    function debug(...args) {
        if (DEBUG) console.log(`${LOG_PREFIX} [DEBUG]`, ...args);
    }

    // --- WHITELIST ---
    const WHITELIST = [
        'mundo bita',
        'galinha pintadinha',
        'patati patata',
    ];

    let termos = [];

    function normalizar(texto) {
        return texto.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
    }

    let regexCache = new Map();

    function criarRegex(termo) {
        if (!regexCache.has(termo)) {
            const escaped = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regexCache.set(termo, new RegExp(`\\b${escaped}\\b`, 'i'));
        }
        return regexCache.get(termo);
    }

    function contemTermo(texto) {
        const textoNorm = normalizar(texto);
        for (const termo of termos) {
            if (criarRegex(termo).test(textoNorm)) {
                return termo;
            }
        }
        return null;
    }

    function estaNoWhitelist(texto) {
        const textoNorm = normalizar(texto);
        return WHITELIST.some(w => textoNorm.includes(normalizar(w)));
    }

    function carregarTermos() {
        const dados = GM_getValue("listaBloqueio");
        if (dados) {
            termos = JSON.parse(dados);
            console.log(`${LOG_PREFIX} Google: ${termos.length} termos carregados do cache.`);
        } else {
            console.warn(`${LOG_PREFIX} Google: Nenhum termo no cache!`);
        }
    }

    console.log(`${LOG_PREFIX} V3.3 Google Script Iniciado.`);

    // --- FILTRO GOOGLE ---

    // Verifica se a QUERY de pesquisa contém termos bloqueados
    function verificarQueryGoogle() {
        const params = new URLSearchParams(window.location.search);
        const query = params.get('q');
        if (!query) return false;

        debug(`Google query: "${query}"`);

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
        if (termos.length === 0) {
            debug('filtrarGoogle() chamado mas termos.length === 0, abortando.');
            return;
        }

        debug('filtrarGoogle() chamado.');

        // Primeiro: verifica se a query inteira é bloqueada
        if (verificarQueryGoogle()) return;

        // Segundo: filtra resultados individuais
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

        // Terceiro: varredura genérica (AI Overview, painéis dinâmicos)
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
    function debounce(fn, delay) {
        let timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    const filtroComDebounce = debounce(filtrarGoogle, 300);
    const observer = new MutationObserver(filtroComDebounce);

    function iniciarObservador() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });

            // Navegação SPA do Google
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

    // --- INICIALIZAÇÃO ---
    carregarTermos();
    iniciarObservador();
})();
