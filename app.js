/* Где это? — клон GeoGuessr на фото Wikimedia Commons. Игра по очереди на одном телефоне. */
(function () {
  'use strict';

  var COLORS = ['#e74c3c', '#3498db'];
  var $ = function (id) { return document.getElementById(id); };

  var state = null;
  var guessMap = null, guessTiles = null, guessMarker = null, pendingGuess = null;
  var resultMap = null, pano = null;

  /* ---------- утилиты ---------- */
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }

  function show(name) {
    ['start', 'loading', 'game', 'pass', 'result', 'final'].forEach(function (s) {
      $('screen-' + s).classList.toggle('active', s === name);
    });
  }

  function tileLayer(labels) {
    if (labels) {
      return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '© OpenStreetMap'
      });
    }
    return L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 18, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO'
    });
  }

  function pinIcon(color, cls) {
    return L.divIcon({
      className: '', iconSize: [22, 22], iconAnchor: [11, 24],
      html: '<div class="pin ' + (cls || '') + '" style="' + (color ? 'background:' + color : '') + '"></div>'
    });
  }

  function preloadImage(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(url); };
      im.onerror = function () { reject(new Error('img')); };
      im.src = url;
    });
  }

  /* ---------- получение локаций ---------- */
  function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 12000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      if (t) clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  async function findLocation(excludeIds) {
    for (var attempt = 0; attempt < 25; attempt++) {
      var pt = Geo.randomPoint();
      var json;
      try { json = await fetchJson(Geo.buildQuery(pt)); } catch (e) { continue; }
      var cands = Geo.parseCandidates(json, excludeIds);
      if (!cands.length) continue;
      var c = cands[Math.floor(Math.random() * cands.length)];
      try { await preloadImage(c.img); } catch (e) { continue; }
      return c;
    }
    throw new Error('Не удалось найти места. Проверь интернет и попробуй ещё раз.');
  }

  function loadGoogle(key) {
    if (window.google && google.maps && google.maps.StreetViewService) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('Google Maps не загрузился. Проверь интернет.')); } }, 15000);
      window.gm_authFailure = function () {
        if (!done) { done = true; clearTimeout(timer); reject(new Error('Ключ Google не принят. Проверь ключ, включён ли Maps JavaScript API и привязана ли карта.')); }
      };
      window.__gmReady = async function () {
        try {
          if (google.maps.importLibrary) await google.maps.importLibrary('streetView');
          if (!done) { done = true; clearTimeout(timer); resolve(); }
        } catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
      };
      var sc = document.createElement('script');
      sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&callback=__gmReady';
      sc.async = true;
      sc.onerror = function () { if (!done) { done = true; clearTimeout(timer); reject(new Error('Не удалось загрузить Google Maps.')); } };
      document.head.appendChild(sc);
    });
  }

  function findStreetView(excludeIds) {
    var svc = new google.maps.StreetViewService();
    function ask(pt) {
      return new Promise(function (resolve) {
        svc.getPanorama({
          location: { lat: pt.lat, lng: pt.lng }, radius: 50000,
          preference: google.maps.StreetViewPreference.NEAREST,
          source: google.maps.StreetViewSource.OUTDOOR
        }, function (data, status) { resolve(status === 'OK' ? data : null); });
      });
    }
    return (async function () {
      for (var attempt = 0; attempt < 40; attempt++) {
        var data = await ask(Geo.randomPoint(null, 4));
        if (!data || !data.location || !data.location.pano) continue;
        if (!/google/i.test(data.copyright || '')) continue; // только официальное покрытие
        if (excludeIds.indexOf(data.location.pano) !== -1) continue;
        var ll = data.location.latLng;
        return { id: data.location.pano, pano: data.location.pano, lat: ll.lat(), lng: ll.lng() };
      }
      throw new Error('Не удалось найти панорамы. Попробуй ещё раз.');
    })();
  }

  var state_mode = 'photo';
  async function loadAllLocations(n) {
    var locs = [], ids = [];
    for (var i = 0; i < n; i++) {
      $('loading-text').textContent = 'Ищу места по миру… ' + (i + 1) + ' / ' + n;
      var loc = state_mode === 'sv' ? await findStreetView(ids) : await findLocation(ids);
      ids.push(loc.id);
      locs.push(loc);
    }
    return locs;
  }

  /* ---------- старт ---------- */
  function initStartForm() {
    $('name1').value = load('geo.name1', 'Я');
    $('name2').value = load('geo.name2', 'Жена');
    $('rounds').value = load('geo.rounds', '5');
    $('solo').checked = load('geo.solo', '0') === '1';
    $('apikey').value = load('geo.key', '');
    $('mode').value = load('geo.mode', $('apikey').value ? 'sv' : 'photo');
    $('key-label').hidden = $('mode').value !== 'sv';
    $('mode').addEventListener('change', function () { $('key-label').hidden = $('mode').value !== 'sv'; });
    $('labels').checked = load('geo.labels', '1') === '1';
    $('name2').parentElement.hidden = $('solo').checked;
    $('solo').addEventListener('change', function () { $('name2').parentElement.hidden = $('solo').checked; });
  }

  async function startGame() {
    var solo = $('solo').checked;
    var names = [($('name1').value || 'Игрок 1').trim()];
    if (!solo) names.push(($('name2').value || 'Игрок 2').trim());
    var rounds = parseInt($('rounds').value, 10);
    var labels = $('labels').checked;
    store('geo.name1', $('name1').value); store('geo.name2', $('name2').value);
    store('geo.rounds', String(rounds)); store('geo.solo', solo ? '1' : '0'); store('geo.labels', labels ? '1' : '0');

    var mode = $('mode').value;
    var key = $('apikey').value.trim();
    store('geo.mode', mode); store('geo.key', key);
    $('start-error').hidden = true;
    if (mode === 'sv' && !key) {
      $('start-error').textContent = 'Вставь ключ Google Maps API или выбери режим «Фото».';
      $('start-error').hidden = false;
      return;
    }
    show('loading');
    try {
      state_mode = mode;
      if (mode === 'sv') { $('loading-text').textContent = 'Подключаю Google Street View…'; await loadGoogle(key); }
      var locs = await loadAllLocations(rounds);
      state = {
        players: names.map(function (n, i) { return { name: n, color: COLORS[i], total: 0 }; }),
        rounds: rounds, mode: mode, round: 0, turn: 0, locs: locs, guesses: [], labels: labels, first: true
      };
      nextTurn();
    } catch (e) {
      show('start');
      $('start-error').textContent = e.message || 'Ошибка загрузки';
      $('start-error').hidden = false;
    }
  }

  /* ---------- ход ---------- */
  function nextTurn() {
    var p = state.players[state.turn];
    if (state.players.length > 1 && !state.first) {
      $('pass-name').textContent = p.name;
      show('pass');
    } else {
      beginTurn();
    }
    state.first = false;
  }

  function beginTurn() {
    var p = state.players[state.turn];
    var loc = state.locs[state.round];
    var wrap = $('photo-wrap');
    wrap.classList.remove('zoomed');
    wrap.scrollTop = 0; wrap.scrollLeft = 0;
    var sv = state.mode === 'sv';
    wrap.hidden = sv; $('pano').hidden = !sv; $('btn-zoom').hidden = sv;
    if (!sv) $('photo').src = loc.img;
    $('hud-round').textContent = 'Раунд ' + (state.round + 1) + ' / ' + state.rounds;
    $('hud-player').textContent = p.name;
    $('hud-player').style.borderLeft = '5px solid ' + p.color;
    pendingGuess = null;
    $('btn-guess').disabled = true;
    $('guess-overlay').hidden = true;
    ensureGuessMap();
    if (guessMarker) { guessMap.removeLayer(guessMarker); guessMarker = null; }
    guessMap.setView([25, 10], 2);
    show('game');
    if (sv) {
      if (!pano) {
        pano = new google.maps.StreetViewPanorama($('pano'), {
          addressControl: false, showRoadLabels: false, fullscreenControl: false,
          enableCloseButton: false, motionTracking: false, motionTrackingControl: false,
          zoomControl: true, panControl: true, linksControl: true, clickToGo: true
        });
      }
      pano.setPano(loc.pano);
      pano.setPov({ heading: Math.random() * 360, pitch: 0 });
      pano.setZoom(0);
      pano.setVisible(true);
    }
  }

  function ensureGuessMap() {
    if (guessMap) {
      if (guessTiles) guessMap.removeLayer(guessTiles);
      guessTiles = tileLayer(state.labels).addTo(guessMap);
      return;
    }
    guessMap = L.map('guess-map', { worldCopyJump: true, zoomControl: false, minZoom: 1 });
    guessTiles = tileLayer(state.labels).addTo(guessMap);
    guessMap.on('click', function (e) {
      var ll = e.latlng.wrap();
      pendingGuess = ll;
      var color = state.players[state.turn].color;
      if (guessMarker) guessMarker.setLatLng(ll);
      else guessMarker = L.marker(ll, { icon: pinIcon(color) }).addTo(guessMap);
      guessMarker.setIcon(pinIcon(color));
      $('btn-guess').disabled = false;
    });
  }

  function submitGuess() {
    if (!pendingGuess) return;
    var loc = state.locs[state.round];
    var km = Geo.haversineKm(pendingGuess.lat, pendingGuess.lng, loc.lat, loc.lng);
    var pts = Geo.scoreForDistance(km);
    state.players[state.turn].total += pts;
    state.guesses.push({
      player: state.turn, lat: pendingGuess.lat, lng: pendingGuess.lng, km: km, pts: pts
    });
    $('guess-overlay').hidden = true;
    if (state.turn < state.players.length - 1) {
      state.turn++;
      nextTurn();
    } else {
      showResult();
    }
  }

  /* ---------- результат раунда ---------- */
  function showResult() {
    var loc = state.locs[state.round];
    show('result');

    if (resultMap) { resultMap.remove(); resultMap = null; }
    resultMap = L.map('result-map', { worldCopyJump: true, zoomControl: false, minZoom: 1 });
    tileLayer(state.labels).addTo(resultMap);

    var bounds = [[loc.lat, loc.lng]];
    L.marker([loc.lat, loc.lng], { icon: pinIcon(null, 'truth') }).addTo(resultMap);

    var roundGuesses = state.guesses.filter(function (g) { return g.round === undefined; });
    var rows = '';
    var best = -1;
    roundGuesses.forEach(function (g) { if (g.pts > best) best = g.pts; });

    roundGuesses.forEach(function (g) {
      var p = state.players[g.player];
      L.marker([g.lat, g.lng], { icon: pinIcon(p.color) }).addTo(resultMap);
      L.polyline([[g.lat, g.lng], [loc.lat, loc.lng]], {
        color: p.color, weight: 3, dashArray: '6 8'
      }).addTo(resultMap);
      bounds.push([g.lat, g.lng]);
      var win = state.players.length > 1 && g.pts === best && roundGuesses.length > 1 &&
        roundGuesses.filter(function (x) { return x.pts === best; }).length === 1;
      rows += '<div class="row' + (win ? ' winner' : '') + '">' +
        '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="name">' + esc(p.name) + '</span>' +
        '<span class="dist">' + Geo.formatDistance(g.km) + '</span>' +
        '<span class="pts">+' + g.pts + '</span></div>';
      g.round = state.round; // помечаем, что результат показан
    });

    if (state.players.length > 1) {
      rows += '<div class="row"><span class="name">Всего: ' +
        state.players.map(function (p) { return esc(p.name) + ' ' + p.total; }).join(' · ') + '</span></div>';
    } else {
      rows += '<div class="row"><span class="name">Всего</span><span class="pts">' + state.players[0].total + '</span></div>';
    }
    $('result-rows').innerHTML = rows;
    $('btn-next').textContent = state.round === state.rounds - 1 ? 'Итоги' : 'Следующий раунд';

    setTimeout(function () {
      resultMap.invalidateSize();
      if (bounds.length > 1) resultMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      else resultMap.setView(bounds[0], 6);
    }, 50);
  }

  function nextRound() {
    if (state.round === state.rounds - 1) return showFinal();
    state.round++;
    state.turn = 0;
    nextTurn();
  }

  /* ---------- итоги ---------- */
  function showFinal() {
    var sorted = state.players.slice().sort(function (a, b) { return b.total - a.total; });
    var title = 'Итог';
    if (state.players.length > 1) {
      title = sorted[0].total === sorted[1].total ? 'Ничья! 🤝' : '🏆 Победитель: ' + sorted[0].name;
    }
    $('final-title').textContent = title;
    $('final-rows').innerHTML = sorted.map(function (p) {
      return '<div class="row"><span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="name">' + esc(p.name) + '</span><span class="pts">' + p.total + '</span></div>';
    }).join('') + '<p class="sub" style="margin-top:16px">Максимум: ' + (state.rounds * 5000) + '</p>';
    show('final');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- события ---------- */
  function bind() {
    $('btn-start').addEventListener('click', startGame);
    $('btn-pass-ok').addEventListener('click', beginTurn);
    $('btn-zoom').addEventListener('click', function () { $('photo-wrap').classList.toggle('zoomed'); });
    $('btn-map').addEventListener('click', function () {
      $('guess-overlay').hidden = false;
      setTimeout(function () { guessMap.invalidateSize(); }, 30);
    });
    $('btn-close-map').addEventListener('click', function () { $('guess-overlay').hidden = true; });
    $('btn-guess').addEventListener('click', submitGuess);
    $('btn-next').addEventListener('click', nextRound);
    $('btn-again').addEventListener('click', function () { show('start'); });
  }

  initStartForm();
  bind();

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
