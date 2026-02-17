// ==UserScript==
// @name         YouTube Kids Pro V3.3 (YouTube Script)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Script principal YouTube - carregado via @require pelo loader
// @author       Você
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // Só executa no YouTube
    if (!window.location.hostname.includes('youtube')) return;

    const URL_DA_LISTA = "https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/palavras";
    const LOG_PREFIX = "[Bloqueador Parental]";
    const DEBUG = true; // Ativar logs de debug

    function debug(...args) {
        if (DEBUG) console.log(`${LOG_PREFIX} [DEBUG]`, ...args);
    }

    // --- WHITELIST: Canais/palavras que NUNCA devem ser bloqueados ---
    const WHITELIST = [
        'mundo bita',
        'galinha pintadinha',
        'patati patata',
    ];

    let termos = [];

    // Função para remover acentos, símbolos e deixar em minúsculo
    function normalizar(texto) {
        return texto.toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
                    .replace(/[^a-z0-9\s]/g, " ")    // Substitui símbolos por espaço
                    .replace(/\s+/g, " ")            // Remove espaços duplos
                    .trim();
    }

    // Cache de RegExp para performance
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

    // Carrega os termos do cache
    function carregarTermos() {
        const dados = GM_getValue("listaBloqueio");
        if (dados) {
            termos = JSON.parse(dados);
            console.log(`${LOG_PREFIX} ${termos.length} termos carregados do cache.`);
        } else {
            console.warn(`${LOG_PREFIX} Nenhum termo no cache!`);
        }
    }

    console.log(`${LOG_PREFIX} V3.3 YouTube Script Iniciado.`);

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

    // --- 3. FILTRO YOUTUBE ---
    function aplicarFiltro() {
        if (termos.length === 0) {
            debug('aplicarFiltro() chamado mas termos.length === 0, abortando.');
            return;
        }

        const url = window.location.href;
        debug(`aplicarFiltro() chamado. URL: ${url}`);

        // A) URLs Proibidas
        if (["/shorts", "/feed/subscriptions", "/feed/history", "/feed/you"].some(p => url.includes(p))) {
            debug('URL proibida detectada, redirecionando...');
            window.location.href = "https://www.youtube.com/";
            return;
        }

        // B) Vídeo aberto (Watch)
        if (url.includes("watch")) {
            const titulo = document.title;
            const descricaoElemento = document.querySelector('#description-inline-expander') || document.querySelector('#description');
            const descricao = descricaoElemento ? descricaoElemento.innerText : "";
            const textoCompleto = titulo + " " + descricao;

            debug(`Watch page - título: "${titulo}"`);

            if (!estaNoWhitelist(textoCompleto)) {
                const match = contemTermo(textoCompleto);
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

        const todosItens = document.querySelectorAll(seletores.join(','));
        debug(`Seletores encontraram ${todosItens.length} elementos.`);

        // Log detalhado dos primeiros 3 itens encontrados
        if (todosItens.length > 0 && DEBUG) {
            todosItens.forEach((item, i) => {
                if (i < 3) {
                    const texto = (item.innerText || '').substring(0, 100);
                    debug(`  Item[${i}] <${item.tagName}> texto: "${texto}..."`);
                }
            });
        }

        todosItens.forEach(item => {
            // Remoção de Ads
            if (item.querySelector('ytd-ad-slot-renderer') || item.tagName.toLowerCase() === 'ytd-ad-slot-renderer') {
                const cardAd = item.closest('ytd-rich-item-renderer') || item;
                cardAd.style.setProperty('display', 'none', 'important');
                return;
            }

            const textoOriginal = item.innerText || '';
            const textoLen = textoOriginal.length.toString();

            // Ignora se já verificou com o mesmo conteúdo
            if (item.dataset.bloqueioChecked === textoLen) return;

            // Não marca como verificado se ainda não tem texto carregado
            if (textoOriginal.trim().length < 3) return;

            // Verifica whitelist
            if (estaNoWhitelist(textoOriginal)) {
                item.dataset.bloqueioChecked = textoLen;
                return;
            }

            const match = contemTermo(textoOriginal);

            if (match) {
                const card = item.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer') || item;
                card.style.setProperty('display', 'none', 'important');

                const row = card.closest('ytd-rich-grid-row');
                if (row) {
                    const siblings = row.querySelectorAll('ytd-rich-item-renderer');
                    const allHidden = Array.from(siblings).every(sib => sib.style.display === 'none');
                    if (allHidden) {
                        row.style.setProperty('display', 'none', 'important');
                    }
                }

                console.log(`${LOG_PREFIX} Bloqueado: "${match}" em ${card.tagName}`);
            } else {
                item.dataset.bloqueioChecked = textoLen;
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
            console.log(`${LOG_PREFIX} Observer YouTube iniciado com sucesso.`);
        } else {
            setTimeout(iniciarObservador, 50);
        }
    }

    // --- INICIALIZAÇÃO ---
    carregarTermos();
    sincronizarLista();
    iniciarObservador();

    // Re-verificação em navegações internas do YouTube (SPA)
    window.addEventListener('yt-navigate-finish', () => {
        debug('Evento yt-navigate-finish disparado.');
        aplicarFiltro();
    });
})();
