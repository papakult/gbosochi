/* Gaz service — единый трекинг: Яндекс.Метрика + скрытые уведомления о лидах.
   Подключается на всех страницах сайта одной строкой. */
(function () {
  'use strict';

  var CID = 112092303;              // Яндекс.Метрика
  var TG_TOKEN = '8979049073:AAHd13Bd-RQvo7lc8-igs2H1y5xs3lAnH_E';
  var TG_CHAT  = '7630274922';
  var DEDUP_MIN = 30;               // не слать повторное уведомление по тому же каналу N минут

  /* ---------- 1. Яндекс.Метрика ---------- */
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) { return; } }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

  ym(CID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true
  });

  var ns = document.createElement('noscript');
  ns.innerHTML = '<div><img src="https://mc.yandex.ru/watch/' + CID +
    '" style="position:absolute;left:-9999px" alt="" /></div>';
  document.addEventListener('DOMContentLoaded', function () {
    document.body.insertBefore(ns, document.body.firstChild);
  });

  /* ---------- 2. Контекст визита ---------- */
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function pageLabel() {
    var meta = document.querySelector('meta[name="page-label"]');
    if (meta && meta.content) { return meta.content; }
    var p = location.pathname.replace(/\/+$/, '');
    if (!p || p === '/index.html') { return 'Главная'; }
    return p;
  }

  function sourceLabel() {
    var utm = qs('utm_source');
    if (utm) {
      return utm + (qs('utm_campaign') ? ' / ' + qs('utm_campaign') : '') +
             (qs('utm_term') ? ' / «' + qs('utm_term') + '»' : '');
    }
    var r = document.referrer;
    if (!r) { return 'прямой заход или закладка'; }
    try {
      var h = new URL(r).hostname.replace(/^www\./, '');
      if (h === location.hostname) { return 'переход внутри сайта'; }
      if (/yandex\./.test(h))  { return 'Яндекс (поиск)'; }
      if (/google\./.test(h))  { return 'Google (поиск)'; }
      if (/2gis\./.test(h))    { return '2ГИС'; }
      if (/vk\.com|t\.me|telegram/.test(h)) { return 'соцсети: ' + h; }
      return h;
    } catch (e) { return r; }
  }

  function device() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'телефон' : 'компьютер';
  }

  function clientId(cb) {
    try {
      ym(CID, 'getClientID', function (id) { cb(id || '—'); });
      setTimeout(function () { cb('—'); }, 800);
    } catch (e) { cb('—'); }
  }

  /* ---------- 3. Скрытое уведомление в Telegram ---------- */
  function dedupOk(channel) {
    try {
      var key = 'gbo_lead_' + channel;
      var last = +(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < DEDUP_MIN * 60 * 1000) { return false; }
      sessionStorage.setItem(key, String(Date.now()));
      return true;
    } catch (e) { return true; }
  }

  function notify(channelName, channelKey) {
    if (!dedupOk(channelKey)) { return; }
    clientId(function (cid) {
      if (notify['done_' + channelKey]) { return; }
      notify['done_' + channelKey] = true;
      var t = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      var msg =
        '🔥 ОБРАЩЕНИЕ С САЙТА\n\n' +
        'Канал: ' + channelName + '\n' +
        'Страница: ' + pageLabel() + '\n' +
        'Адрес: ' + location.host + location.pathname + '\n' +
        'Источник: ' + sourceLabel() + '\n' +
        'Устройство: ' + device() + '\n' +
        'Время (МСК): ' + t + '\n' +
        'ID посетителя: ' + cid + '\n\n' +
        'Промокод САЙТ — спросить у мастера, дошёл ли клиент.';
      var url = 'https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage?chat_id=' +
                TG_CHAT + '&disable_web_page_preview=1&text=' + encodeURIComponent(msg);
      try { new Image().src = url; } catch (e) {}
    });
  }

  /* ---------- 4. Цели Метрики + уведомления ---------- */
  function goal(name) { try { ym(CID, 'reachGoal', name); } catch (e) {} }

  function lead(goalName, channelName, channelKey) {
    goal(goalName);
    goal('lead_any');
    notify(channelName, channelKey);
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('a') : null;
    if (!a) { return; }
    var href = a.getAttribute('href') || '';

    if (href.indexOf('wa.me') > -1 || href.indexOf('whatsapp') > -1) {
      lead('wa_click', 'WhatsApp', 'wa');
    } else if (href.indexOf('t.me/') > -1 || href.indexOf('telegram.me/') > -1) {
      lead('tg_click', 'Telegram', 'tg');
    } else if (href.indexOf('mailto:') === 0) {
      lead('mail_click', 'Почта', 'mail');
    } else if (href.indexOf('tel:') === 0) {
      lead('phone_click', 'Звонок', 'phone');
    }
  }, true);

  /* промокод */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('.promo-code, [data-promo]') : null;
    if (el) { goal('promo_copy'); }
  }, true);

  /* глубина интереса: дошёл до цен */
  document.addEventListener('DOMContentLoaded', function () {
    var sec = document.getElementById('prices');
    if (sec && 'IntersectionObserver' in window) {
      var fired = false;
      new IntersectionObserver(function (e) {
        if (e[0].isIntersecting && !fired) { fired = true; goal('view_prices'); }
      }, { threshold: 0.3 }).observe(sec);
    }
  });
})();
