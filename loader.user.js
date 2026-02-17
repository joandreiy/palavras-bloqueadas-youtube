// ==UserScript==
// @name         YouTube Kids Pro V3.3 (Loader)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Loader que busca os scripts do GitHub automaticamente.
// @author       Você
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.google.com/*
// @match        https://www.google.com.br/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/common.js
// @require      https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/youtube-script.js
// @require      https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/google-script.js
// @run-at       document-start
// ==/UserScript==

// Scripts carregados via @require (ordem importa!):
// 1. common.js       → funções compartilhadas (window.BloqueadorParental)
// 2. youtube-script.js       → filtro YouTube
// 3. google-script.js → filtro Google Search
