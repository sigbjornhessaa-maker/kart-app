// gangtrafikk.js: beregner og viser gangtrafikk på campus.
//
// Slik virker det, steg for steg:
//   1. Gangnettet (data/gangnett.js) gjøres om til en GRAF: punkter (noder)
//      som er koblet sammen av strekninger (kanter) med en lengde i meter.
//   2. For hvert startpunkt finner vi korteste vei til hvert mål
//      (Dijkstras algoritme).
//   3. For hver time fordeler vi personene fra hvert startpunkt på målene
//      etter vekten deres, og legger dem til på hver strekning de går langs.
//   4. Kartet viser resultatet for valgt time som et heatmap.

// ---------- Farger ----------

// Startpunktenes farger (sjekket for fargeblindhet).
const TYPEFARGER = { holdeplass: '#eb6834', bolig: '#1baf7a', sykkel: '#4a3aa7' };
const TYPENAVN = { holdeplass: 'Holdeplass', bolig: 'Boligområde', sykkel: 'Sykkelparkering' };
const MALFARGE = '#2b2b2a';
// Heatmapet: én fargetone (blå), fra lys (få) til mørk (mange).
const VARMEFARGER = ['#cde2fb', '#86b6ef', '#3987e5', '#256abf', '#104281', '#0d366b'];

const OSM_KREDITERING = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-bidragsytere';

// ---------- 1. Kartet ----------

const kart = new maplibregl.Map({
  container: 'kart',
  style: {
    version: 8,
    sources: {
      gatekart: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: OSM_KREDITERING
      }
    },
    // Bakgrunnskartet gjøres blekt, så heatmapet synes godt.
    layers: [{ id: 'gatekart', type: 'raster', source: 'gatekart', paint: { 'raster-saturation': -0.8, 'raster-opacity': 0.75 } }]
  },
  center: [10.4025, 63.4170],
  zoom: 15,
  attributionControl: false
});
kart.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
kart.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: OSM_KREDITERING }), 'bottom-right');

// Et løfte (Promise) som blir oppfylt når kartoppsettet er klart.
const kartetErKlart = new Promise(function (ferdig) {
  kart.once('style.load', ferdig);
});

// ---------- Hjelpefunksjoner ----------

// Avstand i meter mellom to punkter [lng, lat] (haversine-formelen).
function avstand(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 8 -> "08:00–09:00"
function timeTekst(time) {
  const fra = String(time).padStart(2, '0');
  const til = String((time + 1) % 24).padStart(2, '0');
  return fra + ':00–' + til + ':00';
}

// 1234 -> "1 234" (norsk tallformat)
function tall(n) {
  return Math.round(n).toLocaleString('nb-NO');
}

// Gjør tekst trygg å sette inn i HTML.
function trygg(tekst) {
  const div = document.createElement('div');
  div.textContent = tekst == null ? '' : String(tekst);
  return div.innerHTML;
}

function personerTime(start, time) {
  return (start.personer && start.personer[time]) || 0;
}

function vektTime(mal, time) {
  return (mal.vekt && mal.vekt[time]) || 0;
}

// ---------- 2. Grafen ----------

let noder = [];   // nodene: [lng, lat]
let naboer = [];  // for hver node: liste med { til: nabonode, kant: kantnummer }
let kanter = [];  // strekningene: { a, b, lengde, navn }
let hovedNoder = []; // nodene i den største sammenhengende delen av nettet

function byggGraf(gangnett) {
  noder = [];
  naboer = [];
  kanter = [];
  const nodeNummer = new Map(); // "lng,lat" -> nodenummer

  function finnNode(punkt) {
    const nokkel = punkt[0] + ',' + punkt[1];
    if (!nodeNummer.has(nokkel)) {
      nodeNummer.set(nokkel, noder.length);
      noder.push(punkt);
      naboer.push([]);
    }
    return nodeNummer.get(nokkel);
  }

  gangnett.features.forEach(function (linje) {
    const punkter = linje.geometry.coordinates;
    for (let i = 1; i < punkter.length; i++) {
      const a = finnNode(punkter[i - 1]);
      const b = finnNode(punkter[i]);
      if (a === b) {
        continue;
      }
      const k = kanter.length;
      kanter.push({ a: a, b: b, lengde: avstand(noder[a], noder[b]), navn: linje.properties.navn || '' });
      // Man kan gå begge veier
      naboer[a].push({ til: b, kant: k });
      naboer[b].push({ til: a, kant: k });
    }
  });

  // Finn den største sammenhengende delen av nettet. Små biter som ikke
  // henger sammen med resten (f.eks. en sti inne i en bakgård) hopper vi over
  // når vi kobler startpunkter og mål til nettet.
  const del = new Int32Array(noder.length).fill(-1);
  let storsteDel = -1;
  let storsteStorrelse = 0;
  for (let n = 0; n < noder.length; n++) {
    if (del[n] !== -1) {
      continue;
    }
    const ko = [n];
    del[n] = n;
    let storrelse = 0;
    while (ko.length) {
      const x = ko.pop();
      storrelse++;
      naboer[x].forEach(function (nabo) {
        if (del[nabo.til] === -1) {
          del[nabo.til] = n;
          ko.push(nabo.til);
        }
      });
    }
    if (storrelse > storsteStorrelse) {
      storsteStorrelse = storrelse;
      storsteDel = n;
    }
  }
  hovedNoder = [];
  for (let n = 0; n < noder.length; n++) {
    if (del[n] === storsteDel) {
      hovedNoder.push(n);
    }
  }
}

// Finner noden i nettet som ligger nærmest en posisjon.
function narmesteNode(posisjon) {
  let best = -1;
  let bestAvstand = Infinity;
  hovedNoder.forEach(function (n) {
    const d = avstand(posisjon, noder[n]);
    if (d < bestAvstand) {
      bestAvstand = d;
      best = n;
    }
  });
  return { node: best, avstand: bestAvstand };
}

// Dijkstras algoritme: korteste vei fra én node til alle andre.
// Vi holder en "kø" av noder sortert etter avstand, og går alltid videre
// fra den nærmeste noden vi ikke har besøkt ennå.
function korteste(start) {
  const dist = new Float64Array(noder.length).fill(Infinity);
  const forrigeKant = new Int32Array(noder.length).fill(-1);
  const ko = new MinKo();
  dist[start] = 0;
  ko.leggTil(start, 0);
  while (ko.storrelse() > 0) {
    const { verdi: n, prioritet: d } = ko.taUt();
    if (d > dist[n]) {
      continue; // utdatert oppføring i køen
    }
    naboer[n].forEach(function (nabo) {
      const ny = d + kanter[nabo.kant].lengde;
      if (ny < dist[nabo.til]) {
        dist[nabo.til] = ny;
        forrigeKant[nabo.til] = nabo.kant;
        ko.leggTil(nabo.til, ny);
      }
    });
  }
  return { dist: dist, forrigeKant: forrigeKant };
}

// Går baklengs fra målet til starten og samler kantene på veien.
function ruteTil(sok, start, mal) {
  if (!isFinite(sok.dist[mal])) {
    return null; // ingen vei
  }
  const rute = [];
  let n = mal;
  while (n !== start) {
    const k = sok.forrigeKant[n];
    rute.push(k);
    n = kanter[k].a === n ? kanter[k].b : kanter[k].a;
  }
  return rute;
}

// En enkel prioritetskø (binær haug): taUt() gir alltid elementet med lavest prioritet.
function MinKo() {
  const haug = [];
  this.storrelse = function () { return haug.length; };
  this.leggTil = function (verdi, prioritet) {
    haug.push({ verdi: verdi, prioritet: prioritet });
    let i = haug.length - 1;
    while (i > 0) {
      const forelder = (i - 1) >> 1;
      if (haug[forelder].prioritet <= haug[i].prioritet) {
        break;
      }
      [haug[forelder], haug[i]] = [haug[i], haug[forelder]];
      i = forelder;
    }
  };
  this.taUt = function () {
    const topp = haug[0];
    const siste = haug.pop();
    if (haug.length > 0) {
      haug[0] = siste;
      let i = 0;
      for (;;) {
        const v = 2 * i + 1;
        const h = v + 1;
        let minst = i;
        if (v < haug.length && haug[v].prioritet < haug[minst].prioritet) minst = v;
        if (h < haug.length && haug[h].prioritet < haug[minst].prioritet) minst = h;
        if (minst === i) break;
        [haug[minst], haug[i]] = [haug[i], haug[minst]];
        i = minst;
      }
    }
    return topp;
  };
}

// ---------- 3. Modellen ----------

const STARTER = GANGTRAFIKK_DATA.startpunkter || [];
const MAL = GANGTRAFIKK_DATA.mal || [];

let flyt = [];            // flyt[time][kant] = personer på strekningen den timen
let maksFlyt = 1;         // største verdi gjennom hele døgnet (for fargeskalaen)
let personerPerTime = []; // sum personer fra alle startpunkter, per time
let utenRute = [];        // personer per time som ikke fikk noen rute
let tilkobling = { start: [], mal: [] }; // avstand fra hvert punkt til nettet

function beregn() {
  // Koble startpunkter og mål til nærmeste punkt i nettet.
  const startNoder = STARTER.map(function (s) { return narmesteNode(s.posisjon); });
  const malNoder = MAL.map(function (m) { return narmesteNode(m.posisjon); });
  tilkobling = { start: startNoder, mal: malNoder };

  // Korteste vei fra hvert startpunkt til hvert mål.
  const ruter = startNoder.map(function (s) {
    const sok = korteste(s.node);
    return malNoder.map(function (m) { return ruteTil(sok, s.node, m.node); });
  });

  flyt = [];
  personerPerTime = [];
  utenRute = [];
  maksFlyt = 1;
  for (let time = 0; time < 24; time++) {
    const kantFlyt = new Float64Array(kanter.length);
    const sumVekt = MAL.reduce(function (sum, m) { return sum + vektTime(m, time); }, 0);
    let sumPersoner = 0;
    let uten = 0;

    STARTER.forEach(function (start, s) {
      const personer = personerTime(start, time);
      sumPersoner += personer;
      if (personer === 0) {
        return;
      }
      if (sumVekt === 0) {
        uten += personer; // ingen mål har vekt denne timen
        return;
      }
      MAL.forEach(function (mal, m) {
        const andel = personer * vektTime(mal, time) / sumVekt;
        if (andel === 0) {
          return;
        }
        const rute = ruter[s][m];
        if (!rute) {
          uten += andel;
          return;
        }
        rute.forEach(function (k) { kantFlyt[k] += andel; });
      });
    });

    kantFlyt.forEach(function (f) {
      if (f > maksFlyt) {
        maksFlyt = f;
      }
    });
    flyt.push(kantFlyt);
    personerPerTime.push(sumPersoner);
    utenRute.push(uten);
  }
}

// ---------- 4. Vise en time i kartet ----------

const timeSlider = document.getElementById('time-slider');
const timeTekstEl = document.getElementById('time-tekst');
const timeSum = document.getElementById('time-sum');

// Lager punktene til heatmapet: ett punkt ca. hver 8. meter langs hver
// strekning med trafikk, med antall personer som vekt.
function varmepunkter(kantFlyt) {
  const punkter = [];
  kanter.forEach(function (kant, k) {
    const f = kantFlyt[k];
    if (f < 0.5) {
      return;
    }
    const a = noder[kant.a];
    const b = noder[kant.b];
    const antall = Math.max(1, Math.round(kant.lengde / 8));
    for (let i = 0; i < antall; i++) {
      const t = (i + 0.5) / antall;
      punkter.push({
        type: 'Feature',
        properties: { p: f },
        geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
      });
    }
  });
  return { type: 'FeatureCollection', features: punkter };
}

// Strekningene med trafikk som linjer (vises når du zoomer inn).
function flytlinjer(kantFlyt) {
  const linjer = [];
  kanter.forEach(function (kant, k) {
    if (kantFlyt[k] < 0.5) {
      return;
    }
    linjer.push({
      type: 'Feature',
      properties: { p: kantFlyt[k], navn: kant.navn },
      geometry: { type: 'LineString', coordinates: [noder[kant.a], noder[kant.b]] }
    });
  });
  return { type: 'FeatureCollection', features: linjer };
}

function visTime(time) {
  timeSlider.value = time;
  timeTekstEl.textContent = timeTekst(time);
  timeSum.textContent = tall(personerPerTime[time] || 0) + ' personer denne timen';
  if (kart.getSource('varme') && flyt[time]) {
    kart.getSource('varme').setData(varmepunkter(flyt[time]));
    kart.getSource('flyt').setData(flytlinjer(flyt[time]));
    // Startpunktene får størrelse etter hvor mange som går fra dem denne timen.
    kart.getSource('starter').setData(startpunktData(time));
  }
  oppdaterTabeller(time);
  oppdaterProfil(time);
}

timeSlider.addEventListener('input', function () {
  visTime(Number(timeSlider.value));
});

// Avspilling time for time
const spillKnapp = document.getElementById('spill-knapp');
let avspilling = null;
spillKnapp.addEventListener('click', function () {
  if (avspilling) {
    clearInterval(avspilling);
    avspilling = null;
    spillKnapp.textContent = '▶';
    return;
  }
  spillKnapp.textContent = '⏸';
  avspilling = setInterval(function () {
    visTime((Number(timeSlider.value) + 1) % 24);
  }, 900);
});

// ---------- 5. Startpunkter og mål i kartet ----------

function startpunktData(time) {
  return {
    type: 'FeatureCollection',
    features: STARTER.map(function (s, i) {
      return {
        type: 'Feature',
        properties: { indeks: i, navn: s.navn, type: s.type, personer: personerTime(s, time) },
        geometry: { type: 'Point', coordinates: s.posisjon }
      };
    })
  };
}

function malData() {
  return {
    type: 'FeatureCollection',
    features: MAL.map(function (m, i) {
      return { type: 'Feature', properties: { indeks: i, navn: m.navn }, geometry: { type: 'Point', coordinates: m.posisjon } };
    })
  };
}

// Legger til kilder og lag. Kalles når både kartet og beregningen er klare.
function leggTilLag() {
  const tom = { type: 'FeatureCollection', features: [] };

  // Hele gangnettet som tynne grå linjer, så man ser hvor man kan gå.
  kart.addSource('nett', { type: 'geojson', data: gangnettData, attribution: OSM_KREDITERING });
  kart.addLayer({
    id: 'nett',
    type: 'line',
    source: 'nett',
    paint: { 'line-color': '#8a8984', 'line-width': 1, 'line-opacity': 0.5 }
  });

  // Heatmapet. Vekten skaleres mot den travleste strekningen i hele døgnet,
  // så natten ser rolig ut og rushtiden sterk. Den nederste delen av skalaen
  // er forsterket litt, så også stier med lite trafikk synes.
  kart.addSource('varme', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'varme',
    type: 'heatmap',
    source: 'varme',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'p'], 0, 0, maksFlyt * 0.15, 0.35, maksFlyt, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 13, 1, 15, 1.5, 17, 2.5],
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 13, 7, 15, 14, 16, 22, 18, 50],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(205,226,251,0)',
        0.08, VARMEFARGER[0],
        0.25, VARMEFARGER[1],
        0.45, VARMEFARGER[2],
        0.65, VARMEFARGER[3],
        0.85, VARMEFARGER[4],
        1, VARMEFARGER[5]
      ],
      // Heatmapet tones ut når du zoomer helt inn; da tar linjene over.
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 16.5, 0.85, 18, 0]
    }
  });

  // Linjer med trafikk: tykkere og mørkere jo flere som går der.
  kart.addSource('flyt', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'flyt',
    type: 'line',
    source: 'flyt',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'p'], 0, VARMEFARGER[0], maksFlyt * 0.5, VARMEFARGER[3], maksFlyt, VARMEFARGER[5]],
      'line-width': ['interpolate', ['linear'], ['get', 'p'], 0, 1.5, maksFlyt, 9],
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 16, 0, 17.5, 0.9]
    }
  });

  // Målene: mørke prikker med hvit kant.
  kart.addSource('mal', { type: 'geojson', data: malData() });
  kart.addLayer({
    id: 'mal',
    type: 'circle',
    source: 'mal',
    paint: { 'circle-radius': 7, 'circle-color': MALFARGE, 'circle-stroke-color': 'white', 'circle-stroke-width': 2 }
  });

  // Startpunktene: farge etter type, større jo flere personer denne timen.
  kart.addSource('starter', { type: 'geojson', data: startpunktData(Number(timeSlider.value)) });
  kart.addLayer({
    id: 'starter',
    type: 'circle',
    source: 'starter',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'personer'], 0, 6, 500, 14],
      'circle-color': ['match', ['get', 'type'], 'holdeplass', TYPEFARGER.holdeplass, 'bolig', TYPEFARGER.bolig, 'sykkel', TYPEFARGER.sykkel, '#8a8984'],
      'circle-stroke-color': 'white',
      'circle-stroke-width': 2
    }
  });

  // Klikk: vis informasjon i en boble.
  kart.on('click', 'starter', function (e) {
    const p = e.features[0].properties;
    const time = Number(timeSlider.value);
    visBoble(e.lngLat, '<strong>' + trygg(p.navn) + '</strong><br>' + (TYPENAVN[p.type] || p.type) +
      '<br>' + tall(p.personer) + ' personer kl. ' + timeTekst(time));
  });
  kart.on('click', 'mal', function (e) {
    const m = MAL[e.features[0].properties.indeks];
    const time = Number(timeSlider.value);
    visBoble(e.lngLat, '<strong>' + trygg(m.navn) + '</strong><br>Vekt kl. ' + timeTekst(time) + ': ' + vektTime(m, time));
  });
  kart.on('click', 'flyt', function (e) {
    // Ikke vis linjeboble hvis vi klikket på et punkt (de har egne bobler)
    if (kart.queryRenderedFeatures(e.point, { layers: ['starter', 'mal'] }).length) {
      return;
    }
    const p = e.features[0].properties;
    visBoble(e.lngLat, (p.navn ? '<strong>' + trygg(p.navn) + '</strong><br>' : '') +
      'ca. ' + tall(p.p) + ' gående kl. ' + timeTekst(Number(timeSlider.value)));
  });
  ['starter', 'mal', 'flyt'].forEach(function (lag) {
    kart.on('mouseenter', lag, function () { kart.getCanvas().style.cursor = 'pointer'; });
    kart.on('mouseleave', lag, function () { kart.getCanvas().style.cursor = ''; });
  });
}

function visBoble(lngLat, html) {
  new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(lngLat).setHTML(html).addTo(kart);
}

// ---------- 6. Sidepanelet: tabeller og døgnprofil ----------

function oppdaterTabeller(time) {
  document.getElementById('tabell-tittel').textContent =
    'Kl. ' + String(time).padStart(2, '0') + '–' + String((time + 1) % 24).padStart(2, '0');

  document.getElementById('start-tabell').innerHTML = STARTER.map(function (s) {
    return '<tr><td><span class="prikk ' + trygg(s.type) + '"></span>' + trygg(s.navn) + '</td>' +
      '<td>' + tall(personerTime(s, time)) + '</td></tr>';
  }).join('');

  const sumVekt = MAL.reduce(function (sum, m) { return sum + vektTime(m, time); }, 0);
  document.getElementById('mal-tabell').innerHTML = MAL.map(function (m) {
    const andel = sumVekt ? Math.round(100 * vektTime(m, time) / sumVekt) : 0;
    return '<tr><td><span class="prikk mal"></span>' + trygg(m.navn) + '</td><td>' + andel + ' %</td></tr>';
  }).join('');

  // Advarsler: personer uten mål eller rute, og punkter langt fra nettet.
  const advarsler = [];
  if (utenRute[time] >= 1) {
    advarsler.push(tall(utenRute[time]) + ' personer denne timen har ingen mål med vekt (eller ingen vei dit), og er ikke med i heatmapet.');
  }
  tilkobling.start.forEach(function (t, i) {
    if (t.avstand > 100) {
      advarsler.push('«' + STARTER[i].navn + '» ligger ' + tall(t.avstand) + ' m fra nærmeste sti. Sjekk posisjonen.');
    }
  });
  tilkobling.mal.forEach(function (t, i) {
    if (t.avstand > 100) {
      advarsler.push('«' + MAL[i].navn + '» ligger ' + tall(t.avstand) + ' m fra nærmeste sti. Sjekk posisjonen.');
    }
  });
  const boks = document.getElementById('advarsler');
  boks.hidden = advarsler.length === 0;
  boks.innerHTML = advarsler.map(trygg).join('<br>');
}

// Døgnprofilen: én søyle per time, høyde etter antall personer.
const profil = document.getElementById('dognprofil');
const profilTips = document.getElementById('profil-tips');

function lagProfil() {
  const maks = Math.max.apply(null, personerPerTime.concat([1]));
  profil.innerHTML = '';
  personerPerTime.forEach(function (antall, time) {
    const soyle = document.createElement('button');
    soyle.className = 'soyle';
    soyle.style.setProperty('--hoyde', (100 * antall / maks) + '%');
    soyle.setAttribute('aria-label', timeTekst(time) + ': ' + tall(antall) + ' personer');
    soyle.addEventListener('click', function () { visTime(time); });
    // Verktøytips når musa er over søylen
    soyle.addEventListener('mouseenter', function () {
      profilTips.hidden = false;
      profilTips.textContent = 'Kl. ' + timeTekst(time) + ': ' + tall(antall) + ' personer';
    });
    soyle.addEventListener('mouseleave', function () { profilTips.hidden = true; });
    profil.appendChild(soyle);
  });
}

function oppdaterProfil(time) {
  Array.from(profil.children).forEach(function (soyle, i) {
    soyle.classList.toggle('valgt', i === time);
  });
}

// ---------- 7. Gangnettet: fra fil, eller hentet direkte ----------

let gangnettData = null;
const nettStatus = document.getElementById('nett-status');

function brukGangnett(gangnett) {
  gangnettData = gangnett;
  byggGraf(gangnett);
  beregn();
  lagProfil();
  nettStatus.textContent = gangnett.features.length + ' stier og veier, ' + tall(noder.length) + ' kryss og knekkpunkter.';
}

async function hentGangnettDirekte() {
  const svar = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(lagGangnettSporring()),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!svar.ok) {
    throw new Error('Overpass svarte med feilkode ' + svar.status);
  }
  return overpassTilGangnett(await svar.json());
}

// Lar brukeren laste ned gangnettet som data/gangnett.js.
function lastNedGangnett(gangnett) {
  const fil = new Blob([lagGangnettFil(gangnett, new Date().toISOString().slice(0, 10))], { type: 'text/javascript' });
  const lenke = document.createElement('a');
  lenke.href = URL.createObjectURL(fil);
  lenke.download = 'gangnett.js';
  lenke.click();
  URL.revokeObjectURL(lenke.href);
}

document.getElementById('hent-nett-knapp').addEventListener('click', async function () {
  nettStatus.textContent = 'Henter gangnett fra OpenStreetMap …';
  try {
    const gangnett = await hentGangnettDirekte();
    lastNedGangnett(gangnett);
    nettStatus.textContent = 'Hentet ' + gangnett.features.length + ' stier og veier. Fila gangnett.js er lastet ned: ' +
      'last den opp til mappa data/ på GitHub («Add file» → «Upload files») for å erstatte den gamle.';
  } catch (feil) {
    console.error(feil);
    nettStatus.textContent = 'Klarte ikke hente gangnettet (' + feil.message + '). Prøv igjen om litt.';
  }
});

async function start() {
  if (typeof GANGNETT !== 'undefined') {
    brukGangnett(GANGNETT);
  } else {
    // data/gangnett.js mangler: hent nettet direkte fra OpenStreetMap.
    nettStatus.textContent = 'Fant ikke data/gangnett.js. Henter gangnettet fra OpenStreetMap …';
    try {
      brukGangnett(await hentGangnettDirekte());
    } catch (feil) {
      console.error(feil);
      nettStatus.textContent = 'Fant ikke data/gangnett.js, og klarte ikke hente gangnettet fra OpenStreetMap (' +
        feil.message + '). Last siden på nytt for å prøve igjen.';
      return;
    }
  }
  await kartetErKlart;
  leggTilLag();
  visTime(Number(timeSlider.value));
}

start();
