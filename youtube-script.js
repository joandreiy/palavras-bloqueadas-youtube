// ==UserScript==
// @name         YouTube Kids Pro V3.3 (YouTube Script)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Filtro YouTube - usa funções do common.js
// @author       Você
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    if (!window.location.hostname.includes('youtube')) return;

    const BP = window.BloqueadorParental;
    if (!BP) { console.error('[Bloqueador Parental] common.js não carregou!'); return; }

    const { LOG_PREFIX, debug, contemTermo, estaNoWhitelist, normalizar, debounce, getTermos } = BP;

    console.log(`${LOG_PREFIX} V3.3 YouTube Script Iniciado.`);

    // --- CSS PARA REMOÇÃO IMEDIATA ---
    const css = `
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-guide-section-renderer:has(a[href="/feed/you"]),
        ytd-guide-section-renderer:has(a[href="/feed/subscriptions"]),
        ytd-guide-section-renderer:has(a[href="/premium"]),
        ytd-guide-section-renderer:has(a[href="/account"]),
        #footer.ytd-guide-renderer,
        ytd-rich-section-renderer, ytd-reel-shelf-renderer,
        ytm-reel-shelf-renderer, grid-shelf-view-model,
        ytd-ad-slot-renderer, #player-ads,
        ytd-comments#comments,
        ytd-live-chat-frame {
            display: none !important;
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);

    // --- FILTRO YOUTUBE ---
    function aplicarFiltro() {
        const termos = getTermos();
        if (termos.length === 0) {
            debug('YouTube: aplicarFiltro() - termos.length === 0, abortando.');
            return;
        }

        const url = window.location.href;
        debug(`YouTube: aplicarFiltro() URL: ${url}`);

        // A) URLs Proibidas
        if (["/shorts", "/feed/subscriptions", "/feed/history", "/feed/you"].some(p => url.includes(p))) {
            debug('YouTube: URL proibida, redirecionando...');
            window.location.href = "https://www.youtube.com/";
            return;
        }

        // B) Vídeo aberto (Watch)
        if (url.includes("watch")) {
            const titulo = document.title;
            const descricaoElemento = document.querySelector('#description-inline-expander') || document.querySelector('#description');
            const descricao = descricaoElemento ? descricaoElemento.innerText : "";
            const textoCompleto = titulo + " " + descricao;

            debug(`YouTube: Watch page - título: "${titulo}"`);

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
        debug(`YouTube: Seletores encontraram ${todosItens.length} elementos.`);

        if (todosItens.length > 0) {
            todosItens.forEach((item, i) => {
                if (i < 3) {
                    const texto = (item.innerText || '').substring(0, 100);
                    debug(`  Item[${i}] <${item.tagName}> texto: "${texto}..."`);
                }
            });
        }

        let debugItemCount = 0;
        todosItens.forEach(item => {
            // Remoção de Ads
            if (item.querySelector('ytd-ad-slot-renderer') || item.tagName.toLowerCase() === 'ytd-ad-slot-renderer') {
                const cardAd = item.closest('ytd-rich-item-renderer') || item;
                cardAd.style.setProperty('display', 'none', 'important');
                return;
            }

            const textoOriginal = item.innerText || '';
            const textoLen = textoOriginal.length.toString();

            // Debug para os primeiros 3 itens
            if (debugItemCount < 3) {
                debugItemCount++;
                debug(`  Processando item #${debugItemCount}:`);
                debug(`    textoLen = ${textoLen}`);
                debug(`    bloqueioChecked = ${item.dataset.bloqueioChecked}`);
                debug(`    bloqueioChecked === textoLen? ${item.dataset.bloqueioChecked === textoLen}`);
            }

            if (item.dataset.bloqueioChecked === textoLen) {
                if (debugItemCount <= 3) debug(`    → SKIP: já verificado`);
                return;
            }

            if (textoOriginal.trim().length < 3) {
                if (debugItemCount <= 3) debug(`    → SKIP: texto muito curto`);
                return;
            }

            const isWhitelisted = estaNoWhitelist(textoOriginal);
            if (debugItemCount <= 3) {
                debug(`    estaNoWhitelist? ${isWhitelisted}`);
            }

            if (isWhitelisted) {
                item.dataset.bloqueioChecked = textoLen;
                if (debugItemCount <= 3) debug(`    → SKIP: whitelist`);
                return;
            }

            if (debugItemCount <= 3) {
                debug(`    → Chamando contemTermo()...`);
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

    // --- MUTATION OBSERVER ---
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

    iniciarObservador();

    window.addEventListener('yt-navigate-finish', () => {
        debug('YouTube: yt-navigate-finish disparado.');
        aplicarFiltro();
    });
})();
