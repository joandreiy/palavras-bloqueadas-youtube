// ==UserScript==
// @name         YouTube Kids Pro V3.3 (Loader)
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Loader que busca os scripts principal do GitHub automaticamente.
// @author       Você
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://www.google.com/*
// @match        https://www.google.com.br/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/script.js
// @require      https://raw.githubusercontent.com/joandreiy/palavras-bloqueadas-youtube/main/google-script.js
// @run-at       document-start
// ==/UserScript==

// Os scripts são carregados automaticamente via @require
// script.js = YouTube | google-script.js = Google Search
