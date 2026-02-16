// ==UserScript==
// @name         YouTube Kids Pro V3.2 (Loader)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Loader que busca o script principal do GitHub automaticamente.
// @author       Você
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.google.com/*
// @match        https://www.google.com.br/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_URL = "https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/script.js";
    const CACHE_KEY = "script_cache";
    const CACHE_TIME_KEY = "script_cache_time";
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos de cache para não sobrecarregar

    function executarScript(code) {
        try {
            const fn = new Function('GM_xmlhttpRequest', 'GM_setValue', 'GM_getValue', code);
            fn(GM_xmlhttpRequest, GM_setValue, GM_getValue);
        } catch (e) {
            console.error('[Loader] Erro ao executar script:', e);
        }
    }

    function carregarScriptRemoto() {
        const cachedCode = GM_getValue(CACHE_KEY, null);
        const cachedTime = GM_getValue(CACHE_TIME_KEY, 0);
        const agora = Date.now();

        // Se tem cache válido, executa imediatamente e atualiza em background
        if (cachedCode && (agora - cachedTime) < CACHE_DURATION) {
            executarScript(cachedCode);
            return;
        }

        // Se tem cache expirado, executa o cache enquanto baixa a nova versão
        if (cachedCode) {
            executarScript(cachedCode);
        }

        // Baixa a versão mais recente do GitHub
        GM_xmlhttpRequest({
            method: "GET",
            url: SCRIPT_URL + "?t=" + agora, // Cache bust
            onload: function(response) {
                if (response.status === 200 && response.responseText) {
                    GM_setValue(CACHE_KEY, response.responseText);
                    GM_setValue(CACHE_TIME_KEY, agora);
                    console.info('[Loader] Script atualizado do GitHub.');

                    // Se não tinha cache antes, executa agora
                    if (!cachedCode) {
                        executarScript(response.responseText);
                    }
                }
            },
            onerror: function() {
                console.warn('[Loader] Falha ao baixar script. Usando cache.');
                // Se não tinha cache, não há nada a fazer
                if (!cachedCode) {
                    console.error('[Loader] Sem cache disponível. Script não executado.');
                }
            }
        });
    }

    carregarScriptRemoto();
})();
