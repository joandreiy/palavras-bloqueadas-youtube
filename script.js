// ==UserScript==
// @name         YouTube Kids Pro - Sem Acentos V2.6
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Bloqueio total: ignora Maiúsculas, Minúsculas e Acentos.
// @author       Você
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const URL_DA_LISTA = "https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/palavras";
    const LOG_PREFIX = "[Bloqueador Parental]";
    let cacheBloqueados = new Set();

    // Função para remover acentos e deixar em minúsculo
    function normalizar(texto) {
        return texto.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
    }

    console.log(`${LOG_PREFIX} Iniciado com proteção de acentos.`);

    // --- 1. CSS PARA REMOÇÃO IMEDIATA ---
    const css = `
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-guide-section-renderer:has(a[href="/feed/you"]),
        ytd-guide-section-renderer:has(a[href="/feed/subscriptions"]),
        ytd-guide-section-renderer:has(a[href="/premium"]),
        ytd-guide-section-renderer:has(a[href="/account"]),
        #footer.ytd-guide-renderer,
        ytd-rich-section-renderer, ytd-reel-shelf-renderer,
        ytm-reel-shelf-renderer, grid-shelf-view-model,
        ytd-ad-slot-renderer, #player-ads {
            display: none !important;
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);

    // --- 2. ATUALIZAÇÃO COM NORMALIZAÇÃO ---
    function sincronizarLista() {
        const lastEtag = GM_getValue("lista_etag", "");
        GM_xmlhttpRequest({
            method: "GET",
            url: URL_DA_LISTA,
            headers: { "If-None-Match": lastEtag },
            onload: function(response) {
                if (response.status === 200) {
                    // Normaliza as palavras da sua lista ao baixar
                    const lista = response.responseText.split('\n')
                                   .map(p => normalizar(p.trim()))
                                   .filter(p => p.length > 0);

                    GM_setValue("listaBloqueio", JSON.stringify(lista));
                    const newEtag = response.responseHeaders.match(/etag: (.*)/i);
                    if (newEtag) GM_setValue("lista_etag", newEtag[1]);
                    console.info(`${LOG_PREFIX} Lista atualizada e sem acentos.`);
                }
            }
        });
    }

    // --- 3. FILTRO DINÂMICO ---
    function aplicarFiltro() {
        const url = window.location.href;
        const dados = GM_getValue("listaBloqueio");
        if (!dados) return;
        const termos = JSON.parse(dados);

        // A) URLs Proibidas
        if (["/shorts", "/feed/subscriptions", "/feed/history", "/feed/you"].some(p => url.includes(p))) {
            window.location.href = "https://www.youtube.com/";
            return;
        }

        // B) Vídeo aberto (Watch)
        if (url.includes("watch")) {
            // Alterado: Busca apenas no Título e Descrição para evitar bloquear por causa de comentários ou sugestões
            const titulo = document.title;
            const descricaoElemento = document.querySelector('#description-inline-expander') || document.querySelector('#description');
            const descricao = descricaoElemento ? descricaoElemento.innerText : "";
            
            const info = normalizar(titulo + " " + descricao);
            const match = termos.find(t => info.includes(t));
            
            if (match) {
                console.log(`${LOG_PREFIX} Vídeo Bloqueado! Termo encontrado: "${match}"`);
                window.location.href = "https://www.youtube.com/";
                return;
            }
        }

        // C) Estante de Notícias
        document.querySelectorAll('ytd-shelf-renderer').forEach(shelf => {
            const tituloEstante = normalizar(shelf.querySelector('#title')?.innerText || "");
            if (tituloEstante.includes("noticias") || tituloEstante.includes("news")) {
                shelf.style.setProperty('display', 'none', 'important');
            }
        });

        // D) Itens Individuais (Busca, Home, Canais)
        const seletores = [
            'ytd-video-renderer', 'ytd-channel-renderer', 'ytd-rich-item-renderer',
            'yt-lockup-view-model', 'grid-shelf-view-model', 'ytd-compact-video-renderer',
            'ytd-promoted-video-renderer', 'yt-lockup-metadata-view-model'
        ];

        document.querySelectorAll(seletores.join(',')).forEach(item => {
            const textoNormalizado = normalizar(item.innerText);
            const match = termos.find(t => textoNormalizado.includes(t));

            if (match) {
                item.style.setProperty('display', 'none', 'important');
                if (!cacheBloqueados.has(item)) {
                    console.log(`${LOG_PREFIX} Bloqueado: "${match}"`);
                    cacheBloqueados.add(item);
                }
            }
        });
    }

    sincronizarLista();
    setInterval(aplicarFiltro, 1000);
})();
