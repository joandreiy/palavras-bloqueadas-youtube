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
            const regex = new RegExp('\\b' + escaped + '\\b', 'i');
            regexCache.set(termo, regex);
        }
        return regexCache.get(termo);
    }

    // Contador para limitar debug logs
    let contemTermoDebugCount = 0;

    function contemTermo(texto) {
        const textoNorm = normalizar(texto);

        // Debug detalhado para as primeiras 3 chamadas
        if (contemTermoDebugCount < 3) {
            contemTermoDebugCount++;
            debug(`contemTermo() chamado #${contemTermoDebugCount}`);
            debug(`  termos.length = ${termos.length}`);
            debug(`  texto (50 chars) = "${texto.substring(0, 50)}"`);
            debug(`  textoNorm (50 chars) = "${textoNorm.substring(0, 50)}"`);
            debug(`  textoNorm.includes("terror") = ${textoNorm.includes("terror")}`);
            debug(`  termos.includes("terror") = ${termos.includes("terror")}`);

            // Testa regex manual
            const testRegex = new RegExp('\\b' + 'terror' + '\\b', 'i');
            debug(`  Regex manual /\\bterror\\b/i.test(textoNorm) = ${testRegex.test(textoNorm)}`);

            // Mostra os primeiros 5 termos da lista
            debug(`  Primeiros 5 termos: ${JSON.stringify(termos.slice(0, 5))}`);

            // Testa criarRegex para "terror"
            if (termos.includes("terror")) {
                const r = criarRegex("terror");
                debug(`  criarRegex("terror") = ${r}`);
                debug(`  criarRegex("terror").test(textoNorm) = ${r.test(textoNorm)}`);
            }
        }

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
            termos = JSON.parse(dados).filter(t => t && t.trim().length > 0);
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
                                   .map(p => normalizar(p))
                                   .filter(p => p.length > 0); // Remove empty strings after normalization

                    GM_setValue("listaBloqueio", JSON.stringify(lista));
                    const newEtag = response.responseHeaders.match(/etag: (.*)/i);
                    if (newEtag) GM_setValue("lista_etag", newEtag[1]);

                    termos = lista;
                    regexCache.clear();
                    contemTermoDebugCount = 0; // Reset debug count para nova lista
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

    // AUTO-TESTE: verifica se contemTermo funciona corretamente
    if (termos.length > 0) {
        const testResult = contemTermo("Teste de terror no YouTube");
        debug(`AUTO-TESTE: contemTermo("Teste de terror no YouTube") = "${testResult}"`);
        contemTermoDebugCount = 0; // Reset para não poluir os logs seguintes
    }

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

