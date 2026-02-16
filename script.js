// ==UserScript==
// @name         YouTube Kids Pro V3.2 (Main Script)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Script principal - carregado via @require pelo loader
// @author       Você
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
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

    // Cache de RegExp para performance
    let regexCache = new Map();

    function criarRegex(termo) {
        if (!regexCache.has(termo)) {
            // Escapa caracteres especiais de regex e adiciona word boundaries
            const escaped = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // \b = word boundary — só faz match de palavras inteiras (suporta acentos unicode se necessário, mas aqui usaremos \b padrão para os termos normalizados)
            // Como normalizamos para remover acentos, \b funciona bem.
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
                    regexCache.clear(); // Limpa cache ao atualizar lista
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

    // Verifica se a QUERY de pesquisa do Google contém termos bloqueados
    function verificarQueryGoogle() {
        const params = new URLSearchParams(window.location.search);
        const query = params.get('q');
        if (!query) return false;

        // Verifica whitelist primeiro
        if (estaNoWhitelist(query)) return false;

        const match = contemTermo(query);
        if (match) {
            console.log(`${LOG_PREFIX} Query bloqueada: "${match}" na busca "${query}"`);

            // Oculta todo o conteúdo da página (resultados + painel lateral)
            const rso = document.getElementById('rso');
            if (rso) rso.style.setProperty('display', 'none', 'important');
            const searchDiv = document.getElementById('search');
            if (searchDiv) searchDiv.style.setProperty('display', 'none', 'important');
            const rhs = document.getElementById('rhs');
            if (rhs) rhs.style.setProperty('display', 'none', 'important');

            // Mostra aviso no corpo do resultado
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
        // Primeiro: verifica se a query inteira é bloqueada
        if (verificarQueryGoogle()) return;

        // Segundo: filtra resultados individuais
        const seletores = [
            '#search .g',               // Resultados de texto dentro do container search
            '#rso .MjjYud',             // Blocos de resultado modernos
            'div.g',                    // Resultados de texto padrão (fallback)
            'div[data-tbnid]',          // Imagens (Google Images)
            'div.related-question-pair', // "Pessoas também perguntam"
            'div[data-video-url]',      // Vídeos inline (mobile/desktop)
            'g-card',                   // Cards genéricos do Google (vídeos, carousels)
            'g-inner-card',             // Cards internos
        ];

        document.querySelectorAll(seletores.join(',')).forEach(item => {
            // Ignora se o elemento já foi processado ou está oculto
            if (item.dataset.bloqueioChecked || item.style.display === 'none') return;

            // Verifica whitelist primeiro
            if (estaNoWhitelist(item.innerText)) {
                item.dataset.bloqueioChecked = '1';
                return;
            }

            const texto = item.innerText;
            const match = contemTermo(texto);
            
            if (match) {
                item.style.setProperty('display', 'none', 'important');
                console.log(`${LOG_PREFIX} Google Bloqueado: "${match}" em <${item.tagName} class="${item.className}">`);
            } else {
                item.dataset.bloqueioChecked = '1';
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

        document.querySelectorAll(seletores.join(',')).forEach(item => {
            if (item.dataset.bloqueioChecked) return;

            // Remoção de Ads que deixam buracos
            if (item.querySelector('ytd-ad-slot-renderer') || item.tagName.toLowerCase() === 'ytd-ad-slot-renderer') {
                const cardAd = item.closest('ytd-rich-item-renderer') || item;
                cardAd.style.setProperty('display', 'none', 'important');
                return;
            }

            const textoOriginal = item.innerText;

            // Verifica whitelist: se o card contém texto da whitelist, não bloqueia
            if (estaNoWhitelist(textoOriginal)) {
                 item.dataset.bloqueioChecked = '1';
                 return;
            }

            const match = contemTermo(textoOriginal);

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

                console.log(`${LOG_PREFIX} Bloqueado: "${match}" em ${card.tagName}`);
            } else {
                 item.dataset.bloqueioChecked = '1';
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

    const delayGoogle = 300;
    const delayYouTube = 150;
    const delay = window.location.hostname.includes('google') ? delayGoogle : delayYouTube;
    
    const filtroComDebounce = debounce(aplicarFiltro, delay);
    const observer = new MutationObserver(filtroComDebounce);

    function iniciarObservador() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
            
             // Navegação SPA do Google (monitorar mudanças de title/url)
            if (window.location.hostname.includes('google')) {
                let lastUrl = location.href;
                new MutationObserver(() => {
                    const url = location.href;
                    if (url !== lastUrl) {
                        lastUrl = url;
                        setTimeout(aplicarFiltro, 500); // Re-aplica filtro após troca de página SPA
                    }
                }).observe(document, {subtree: true, childList: true}); // Google altera o DOM massivamente na navegação
            }
            
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
