/* Gaz service — единый трекинг: Яндекс.Метрика + скрытые уведомления о лидах.
   Плюс подстановка текста обращения в ссылки Telegram.
   Подключается на всех страницах сайта одной строкой. */
(function () {
  'use strict';

  var CID = 112092303;              // Яндекс.Метрика
  var LEAD_URL = 'https://gbo-sochi.ru/api/lead';
  var DEDUP_MIN = 30;               // не слать повторное уведомление по тому же каналу N минут

  /* ---------- 0. Иконка сайта в выдаче и во вкладке ----------
     В вёрстке ни на одной из 28 страниц нет тега <link rel="icon">,
     а /favicon.ico в корне отсутствует. Поэтому Яндекс не находил
     иконку и показывал сайт в выдаче без неё. Файл /favicon.svg лежит
     в корне — здесь на него проставляется ссылка. */
  (function () {
    try {
      if (document.querySelector('link[rel~="icon"]')) { return; }
      var head = document.head || document.getElementsByTagName('head')[0];
      if (!head) { return; }
      var svg = document.createElement('link');
      svg.rel = 'icon';
      svg.type = 'image/svg+xml';
      svg.href = '/favicon.svg';
      head.appendChild(svg);
    } catch (e) {}
  })();

  /* ---------- 1. Яндекс.Метрика ---------- */
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) { return; } }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

  /* 04.09.2026: тут стоял ssr:true — режим "ручной отправки хитов" для SPA,
     где разработчик сам вызывает ym(id,'hit',url) на каждый переход.
     Сайт обычный многостраничный, такого вызова нигде не было —
     из-за этого счётчик молча не отправлял НИ ОДНОГО визита с момента
     установки. За месяц реального трафика (клики из Директа, живые
     обращения) записался 1 визит. Убрано. */
  ym(CID, 'init', {
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

  /* ClientID забираем заранее и кладём в переменную,
     чтобы в момент клика уведомление ушло мгновенно, а не через таймаут. */
  var VISITOR = '—';
  function grabClientId(attempt) {
    try {
      ym(CID, 'getClientID', function (id) { if (id) { VISITOR = id; } });
    } catch (e) {}
    if (VISITOR === '—' && (attempt || 0) < 8) {
      setTimeout(function () { grabClientId((attempt || 0) + 1); }, 700);
    }
  }
  grabClientId(0);

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

  /* ---------- 3. Текст обращения для Telegram ----------
     Telegram официально поддерживает параметр ?text= и для ссылок вида
     t.me/+<номер>, и для t.me/<username> — он подставляет текст в поле ввода
     (core.telegram.org/api/links). Отправку клиент делает сам, это защита Telegram.
     В вёрстке этот параметр не проставлен ни на одной из 28 страниц —
     поэтому в WhatsApp текст подставлялся, а в Telegram нет. Чиним здесь,
     чтобы не переписывать 28 файлов. */
  function greetingText() {
    var label = pageLabel();
    var where = (label && label !== 'Главная') ? ', страница «' + label + '»' : '';
    return 'Здравствуйте! Пишу с сайта gbosochi.ru' + where +
           '. Промокод САЙТ — скидка 5%.\n\nМоя машина: ';
  }

  function isTelegramLink(href) {
    return /^https?:\/\/(t|telegram)\.me\//i.test(href);
  }

  function withGreeting(href) {
    if (!isTelegramLink(href) || /[?&]text=/.test(href)) { return href; }
    // не трогаем служебные ссылки Telegram
    if (/t\.me\/(share|joinchat|proxy|addstickers|socks)/i.test(href)) { return href; }
    return href + (href.indexOf('?') > -1 ? '&' : '?') +
           'text=' + encodeURIComponent(greetingText());
  }

  function patchTelegramLinks() {
    var links = document.querySelectorAll('a[href*="t.me/"], a[href*="telegram.me/"]');
    for (var i = 0; i < links.length; i++) {
      var h = links[i].getAttribute('href') || '';
      var n = withGreeting(h);
      if (n !== h) { links[i].setAttribute('href', n); }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchTelegramLinks);
  } else {
    patchTelegramLinks();
  }

  /* ---------- 4. Скрытое уведомление в Telegram ---------- */
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
    /* Уведомление уходит не напрямую в Telegram, а через свой эндпоинт
       на gbo-sochi.ru. Причина: api.telegram.org недоступен из России —
       из браузера посетителя запрос отдавал 503, и ни одно обращение
       не доходило. Заодно токен бота больше не лежит в открытом js. */
    var q = '?c=' + encodeURIComponent(channelName) +
            '&p=' + encodeURIComponent(pageLabel()) +
            '&u=' + encodeURIComponent(location.host + location.pathname) +
            '&s=' + encodeURIComponent(sourceLabel()) +
            '&d=' + encodeURIComponent(device()) +
            '&v=' + encodeURIComponent(VISITOR) +
            '&t=' + Date.now();
    try { new Image().src = LEAD_URL + q; } catch (e) {}
  }

  /* ---------- 5. Цели Метрики + уведомления ---------- */
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
    } else if (isTelegramLink(href)) {
      // подстраховка: если ссылка появилась после загрузки страницы
      var patched = withGreeting(href);
      if (patched !== href) { a.setAttribute('href', patched); }
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
