/* Чистая логика игры: расстояния, очки, выбор точек, разбор ответа Wikimedia Commons. */
(function (root) {
  'use strict';

  // Опорные точки по миру: [lat, lng]. Вокруг каждой берётся случайный сдвиг,
  // затем ищутся геотегнутые фото Wikimedia Commons в радиусе 10 км.
  var SEEDS = [
    // Европа
    [48.86, 2.35], [51.51, -0.12], [52.52, 13.40], [41.90, 12.50], [40.42, -3.70], [41.39, 2.17],
    [38.72, -9.14], [48.21, 16.37], [50.08, 14.44], [47.50, 19.04], [52.23, 21.01], [59.33, 18.07],
    [59.91, 10.75], [60.17, 24.94], [55.68, 12.57], [53.35, -6.26], [52.37, 4.90], [50.85, 4.35],
    [47.37, 8.54], [45.46, 9.19], [43.77, 11.25], [40.85, 14.27], [37.98, 23.73], [41.01, 28.98],
    [44.43, 26.10], [42.70, 23.32], [44.79, 20.45], [45.81, 15.98], [47.01, 28.86], [50.45, 30.52],
    [53.90, 27.57], [55.75, 37.62], [59.94, 30.31], [56.95, 24.11], [54.69, 25.28], [59.44, 24.75],
    [57.15, -2.09], [55.95, -3.19], [43.30, -0.37], [45.76, 4.84], [43.30, 5.37], [37.39, -5.98],
    [64.15, -21.94], [46.05, 14.51], [48.15, 17.11], [43.85, 18.41], [41.33, 19.82],
    // Азия
    [35.68, 139.69], [34.69, 135.50], [37.57, 126.98], [39.90, 116.40], [31.23, 121.47], [22.32, 114.17],
    [25.03, 121.57], [13.76, 100.50], [10.82, 106.63], [21.03, 105.85], [1.35, 103.82], [3.14, 101.69],
    [-6.20, 106.85], [14.60, 120.98], [28.61, 77.21], [19.08, 72.88], [12.97, 77.59], [13.08, 80.27],
    [27.70, 85.32], [23.81, 90.41], [6.93, 79.86], [33.69, 73.05], [31.52, 74.36], [35.69, 51.39],
    [41.30, 69.24], [43.24, 76.89], [47.92, 106.92], [55.03, 82.92], [56.84, 60.60], [43.12, 131.90],
    [41.01, 44.80], [40.41, 49.87], [32.09, 34.78], [31.77, 35.21], [33.89, 35.50], [24.71, 46.68],
    [25.20, 55.27], [41.72, 44.79], [35.01, 135.77], [26.21, 127.68],
    // Африка
    [30.04, 31.24], [33.57, -7.59], [34.02, -6.84], [36.75, 3.06], [36.81, 10.18], [6.52, 3.38],
    [5.56, -0.20], [14.69, -17.45], [9.03, 38.74], [-1.29, 36.82], [-6.79, 39.21], [0.35, 32.58],
    [-26.20, 28.05], [-33.92, 18.42], [-29.86, 31.02], [-25.97, 32.57], [-18.91, 47.54], [-22.56, 17.08],
    [15.50, 32.56], [-4.44, 15.27],
    // Северная Америка
    [40.71, -74.01], [34.05, -118.24], [41.88, -87.63], [29.76, -95.37], [25.76, -80.19], [47.61, -122.33],
    [37.77, -122.42], [39.74, -104.99], [33.45, -112.07], [38.91, -77.04], [42.36, -71.06], [33.75, -84.39],
    [43.65, -79.38], [45.50, -73.57], [49.28, -123.12], [51.05, -114.07], [61.22, -149.90], [21.31, -157.86],
    [19.43, -99.13], [20.97, -89.62], [9.93, -84.08], [8.98, -79.52], [23.13, -82.38], [18.47, -69.90],
    [64.18, -51.72],
    // Южная Америка
    [-23.55, -46.63], [-22.91, -43.17], [-34.60, -58.38], [-33.45, -70.67], [-12.05, -77.04], [4.71, -74.07],
    [-0.18, -78.47], [10.48, -66.90], [-16.50, -68.15], [-25.26, -57.58], [-34.90, -56.16], [-3.12, -60.02],
    [-13.52, -71.97], [-54.80, -68.30],
    // Океания
    [-33.87, 151.21], [-37.81, 144.96], [-27.47, 153.03], [-31.95, 115.86], [-34.93, 138.60], [-36.85, 174.76],
    [-41.29, 174.78], [-43.53, 172.64], [-17.73, 168.32], [-18.14, 178.44], [-9.44, 147.18]
  ];

  var BAD_TITLE = /logo|flag|coat[ _]of|map|diagram|plan|scan|poster|stamp|icon|chart|banner|signature|portrait|painting|drawing|sketch|manuscript|document|certificate|screenshot|interior|museum|exhibit|crest|emblem|seal|locator|gallery|\.pdf|\.tif/i;

  function toRad(d) { return d * Math.PI / 180; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Формула как в GeoGuessr для мира: 5000 * exp(-d / 1492.7)
  function scoreForDistance(km) {
    if (km < 0.05) return 5000;
    return Math.round(5000 * Math.exp(-km / 1492.7));
  }

  function formatDistance(km) {
    if (km < 1) return Math.round(km * 1000) + ' м';
    if (km < 100) return km.toFixed(1).replace('.', ',') + ' км';
    return Math.round(km).toLocaleString('ru-RU') + ' км';
  }

  function clampLat(lat) { return Math.max(-85, Math.min(85, lat)); }
  function wrapLng(lng) {
    while (lng > 180) lng -= 360;
    while (lng < -180) lng += 360;
    return lng;
  }

  // Случайная точка рядом со случайной опорной.
  function randomPoint(rng, spread) {
    rng = rng || Math.random;
    var s = SEEDS[Math.floor(rng() * SEEDS.length)];
    spread = spread || 0.8; // градусов
    var lat = clampLat(s[0] + (rng() - 0.5) * spread);
    var lng = wrapLng(s[1] + (rng() - 0.5) * spread / Math.max(0.2, Math.cos(toRad(s[0]))));
    return { lat: lat, lng: lng };
  }

  // Ответ action=query&generator=geosearch&prop=imageinfo|coordinates -> подходящие кандидаты.
  function parseCandidates(json, excludeIds) {
    excludeIds = excludeIds || [];
    var pages = json && json.query && json.query.pages;
    if (!pages) return [];
    var out = [];
    Object.keys(pages).forEach(function (k) {
      var p = pages[k];
      if (!p || !p.coordinates || !p.coordinates.length || !p.imageinfo || !p.imageinfo.length) return;
      var ii = p.imageinfo[0];
      var c = p.coordinates[0];
      if (ii.mime !== 'image/jpeg') return;
      if (!ii.thumburl) return;
      if (ii.width < 1000 || ii.height < 600) return;
      if (ii.width / ii.height < 1.0) return; // только горизонтальные
      if (BAD_TITLE.test(p.title || '')) return;
      if (typeof c.lat !== 'number' || typeof c.lon !== 'number') return;
      if (excludeIds.indexOf(p.pageid) !== -1) return;
      out.push({ id: p.pageid, lat: c.lat, lng: c.lon, img: ii.thumburl, page: ii.descriptionurl || '' });
    });
    return out;
  }

  function buildQuery(pt) {
    var params = {
      action: 'query', format: 'json', origin: '*',
      generator: 'geosearch', ggscoord: pt.lat.toFixed(5) + '|' + pt.lng.toFixed(5),
      ggsradius: '10000', ggslimit: '40', ggsnamespace: '6',
      prop: 'imageinfo|coordinates', iiprop: 'url|mime|size', iiurlwidth: '1600',
      colimit: '40'
    };
    return 'https://commons.wikimedia.org/w/api.php?' + Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
  }

  var api = {
    SEEDS: SEEDS, haversineKm: haversineKm, scoreForDistance: scoreForDistance,
    formatDistance: formatDistance, randomPoint: randomPoint,
    parseCandidates: parseCandidates, buildQuery: buildQuery
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geo = api;
})(typeof window !== 'undefined' ? window : this);
