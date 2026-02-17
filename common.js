// ==UserScript==
// @name         YouTube Kids Pro V3.3 (Common)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Funções compartilhadas entre YouTube e Google scripts
// @author       Você
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// Namespace global compartilhado
window.BloqueadorParental = (function() {
    'use strict';

    const URL_DA_LISTA = "https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/palavras";
    const LOG_PREFIX = "[Bloqueador Parental]";
    const DEBUG = true;

    const WHITELIST = [
        'mundo bita',
        'galinha pintadinha',
        'patati patata',
    ];

    let termos = [];
    let regexCache = new Map();

    function debug(...args) {
        if (DEBUG) console.log(`${LOG_PREFIX} [DEBUG]`, ...args);
    }

    function normalizar(texto) {
        return texto.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
    }

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
            console.log(`${LOG_PREFIX} ${termos.length} termos carregados do cache.`);
        } else {
            console.warn(`${LOG_PREFIX} Nenhum termo no cache!`);
        }
    }

    function sincronizarLista() {
        const lastEtag = GM_getValue("lista_etag", "");
        GM_xmlhttpRequest({
            method: "GET",
            url: URL_DA_LISTA,
            headers: { "If-None-Match": lastEtag },
            onload: function(response) {
                if (response.status === 200) {
                    const lista = response.responseText.split('\n')
                                   .map(p => p.trim())
                                   .filter(p => p.length > 0 && !p.startsWith('#'))
                                   .map(p => normalizar(p));

                    GM_setValue("listaBloqueio", JSON.stringify(lista));
                    const newEtag = response.responseHeaders.match(/etag: (.*)/i);
                    if (newEtag) GM_setValue("lista_etag", newEtag[1]);

                    termos = lista;
                    regexCache.clear();
                    console.info(`${LOG_PREFIX} Lista atualizada: ${lista.length} termos baixados.`);
                } else if (response.status === 304) {
                    console.info(`${LOG_PREFIX} Lista não modificada, usando cache.`);
                }
            },
            onerror: function() {
                console.warn(`${LOG_PREFIX} Falha ao baixar lista. Usando cache local.`);
            }
        });
    }

    function debounce(fn, delay) {
        let timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    function getTermos() {
        return termos;
    }

    // Inicialização
    console.log(`${LOG_PREFIX} V3.3 Common carregado.`);
    carregarTermos();
    sincronizarLista();

    // API pública
    return {
        LOG_PREFIX,
        DEBUG,
        debug,
        normalizar,
        contemTermo,
        estaNoWhitelist,
        debounce,
        getTermos,
    };
})();
