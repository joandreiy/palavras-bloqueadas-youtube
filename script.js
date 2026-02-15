// ==UserScript==
// @name         YouTube Kids Pro V3.0
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Bloqueio parental inteligente com whitelist, cache e MutationObserver.
// @author       Você
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.google.com/*
// @match        https://www.google.com.br/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const URL_DA_LISTA = "https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/palavras";
    const LOG_PREFIX = "[Bloqueador Parental]";

    // --- WHITELIST: Canais/palavras que NUNCA devem ser bloqueados ---
    const WHITELIST = [
        'mundo bita',
        'galinha pintadinha',
        'patati patata',
    ];

    let termos = [];
    let cacheBloqueados = new Set();

    // Função para remover acentos, símbolos e deixar em minúsculo
    function normalizar(texto) {
        return texto.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
                    .replace(/[^a-z0-9\s]/g, " ")    // Substitui símbolos (hífen, pontuação) por espaço
                    .replace(/\s+/g, " ")            // Remove espaços duplos
                    .trim();
    }

    // Verifica se o texto contém algum termo da whitelist
    function estaNoWhitelist(texto) {
        const textoNorm = normalizar(texto);
        return WHITELIST.some(w => textoNorm.includes(normalizar(w)));
    }

    // Carrega os termos do cache (executado uma vez, não a cada mutação)
    function carregarTermos() {
        const dados = GM_getValue("listaBloqueio");
        if (dados) {
            termos = JSON.parse(dados);
            console.log(`${LOG_PREFIX} ${termos.length} termos carregados do cache.`);
        }
    }

    console.log(`${LOG_PREFIX} V3.1 Correção de Normalização Iniciada.`);

    // --- 1. CSS PARA REMOÇÃO IMEDIATA ---
    const css = `
        /* Shorts */
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        /* Menu lateral desnecessário */
        ytd-guide-section-renderer:has(a[href="/feed/you"]),
        ytd-guide-section-renderer:has(a[href="/feed/subscriptions"]),
        ytd-guide-section-renderer:has(a[href="/premium"]),
        ytd-guide-section-renderer:has(a[href="/account"]),
        #footer.ytd-guide-renderer,
        /* Shorts e Reels */
        ytd-rich-section-renderer, ytd-reel-shelf-renderer,
        ytm-reel-shelf-renderer, grid-shelf-view-model,
        /* Anúncios */
        ytd-ad-slot-renderer, #player-ads,
        /* Comentários */
        ytd-comments#comments,
        /* Chat ao vivo */
        ytd-live-chat-frame {
            display: none !important;
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);

    // --- 2. SINCRONIZAÇÃO DA LISTA ---
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

                    // Atualiza o cache em memória imediatamente
                    termos = lista;
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

    // --- 3. FILTRO DINÂMICO ---
    function filtrarGoogle() {
        const seletores = [
            'div.g',                    // Resultados de texto padrão
            'div[data-tbnid]',          // Imagens (Google Images)
            'div.related-question-pair', // "Pessoas também perguntam"
            'div[data-video-url]',      // Vídeos inline
            'div.u2tX4e',               // Carousel de vídeos
            '#rso > div',               // Blocos principais de resultado (inclui AI Overview)
            'div[data-hveid]'           // Qualquer elemento com ID de resultado do Google
        ];

        document.querySelectorAll(seletores.join(',')).forEach(item => {
            // Ignora se o elemento já foi processado ou está oculto
            if (cacheBloqueados.has(item) || item.style.display === 'none') return;

            // Verifica whitelist primeiro
            if (estaNoWhitelist(item.innerText)) return;

            const texto = normalizar(item.innerText);
            const match = termos.find(t => texto.includes(t));
            
            if (match) {
                item.style.setProperty('display', 'none', 'important');
                console.log(`${LOG_PREFIX} Google Bloqueado: "${match}" em <${item.tagName} class="${item.className}">`);
                cacheBloqueados.add(item);
            }
        });
    }

    function aplicarFiltro() {
        if (termos.length === 0) return;

        // Se for Google, usa o filtro específico
        if (window.location.hostname.includes('google')) {
            filtrarGoogle();
            return;
        }

        const url = window.location.href;

        // A) URLs Proibidas
        if (["/shorts", "/feed/subscriptions", "/feed/history", "/feed/you"].some(p => url.includes(p))) {
            window.location.href = "https://www.youtube.com/";
            return;
        }

        // B) Vídeo aberto (Watch)
        if (url.includes("watch")) {
            const titulo = document.title;
            const descricaoElemento = document.querySelector('#description-inline-expander') || document.querySelector('#description');
            const descricao = descricaoElemento ? descricaoElemento.innerText : "";

            const textoCompleto = titulo + " " + descricao;

            // Verifica whitelist antes de bloquear
            if (!estaNoWhitelist(textoCompleto)) {
                const info = normalizar(textoCompleto);
                const match = termos.find(t => info.includes(t));

                if (match) {
                    console.log(`${LOG_PREFIX} Vídeo Bloqueado! Termo: "${match}"`);
                    window.location.href = "https://www.youtube.com/";
                    return;
                }
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
            // Remoção de Ads que deixam buracos
            if (item.querySelector('ytd-ad-slot-renderer') || item.tagName.toLowerCase() === 'ytd-ad-slot-renderer') {
                const cardAd = item.closest('ytd-rich-item-renderer') || item;
                cardAd.style.setProperty('display', 'none', 'important');
                return;
            }

            const textoOriginal = item.innerText;

            // Verifica whitelist: se o card contém texto da whitelist, não bloqueia
            if (estaNoWhitelist(textoOriginal)) return;

            const textoNormalizado = normalizar(textoOriginal);
            const match = termos.find(t => textoNormalizado.includes(t));

            if (match) {
                const card = item.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer') || item;
                card.style.setProperty('display', 'none', 'important');

                // Oculta linha inteira se todos os itens estiverem ocultos
                const row = card.closest('ytd-rich-grid-row');
                if (row) {
                    const siblings = row.querySelectorAll('ytd-rich-item-renderer');
                    const allHidden = Array.from(siblings).every(sib => sib.style.display === 'none');
                    if (allHidden) {
                        row.style.setProperty('display', 'none', 'important');
                    }
                }

                if (!cacheBloqueados.has(card)) {
                    console.log(`${LOG_PREFIX} Bloqueado: "${match}" em ${card.tagName}`);
                    cacheBloqueados.add(card);
                }
            }
        });
    }

    // --- 4. MUTATION OBSERVER ---
    function debounce(fn, delay) {
        let timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    const filtroComDebounce = debounce(aplicarFiltro, 150);
    const observer = new MutationObserver(filtroComDebounce);

    function iniciarObservador() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
            aplicarFiltro();
            console.log(`${LOG_PREFIX} Observer iniciado com sucesso.`);
        } else {
            setTimeout(iniciarObservador, 50);
        }
    }

    // --- INICIALIZAÇÃO ---
    carregarTermos();   // Carrega cache imediato (sem esperar download)
    sincronizarLista(); // Baixa atualização em background
    iniciarObservador();

    // Re-verificação em navegações internas do YouTube (SPA)
    window.addEventListener('yt-navigate-finish', aplicarFiltro);
})();
