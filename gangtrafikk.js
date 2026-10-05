// gangtrafikk.js: beregner og viser trafikken til campus.
//
// Slik virker det:
//   1. Gangnettet (data/gangnett.js) + snarveiene dine blir en GRAF:
//      punkter (noder) koblet sammen av strekninger (kanter) med lengde.
//   2. Fra hvert mål finner vi korteste vei til alle punkter i nettet
//      (Dijkstras algoritme). Én gang for gående, én gang for sykkel og
//      elsparkesykkel (de kan ikke ta trapper eller snarveier).
//   3. For hver time fordeles personene fra hvert startpunkt på reisemåter
//      og mål. Gående/syklende følger korteste vei fra startpunktet.
//      Bussreisende går av på holdeplassen på campus som er nærmest målet
//      (blant linjene som går forbi startpunktet), og går derfra.
//   4. Kartet viser resultatet for valgt time som et heatmap.

// ---------- Innstillinger ----------

const REISEMIDLER = ['gange', 'sykkel', 'buss', 'sparkesykkel'];
const REISEMIDDEL_NAVN = { gange: 'Gange', sykkel: 'Sykkel', buss: 'Buss', sparkesykkel: 'Elsparkesykkel' };

// Holdeplasser innenfor dette området regnes som "campusholdeplasser",
// der bussreisende går av og fortsetter til fots.
const CAMPUS_SONE = { sor: 63.4065, vest: 10.3880, nord: 63.4265, ost: 10.4165 };

// Hvor langt man er villig til å gå til en holdeplass hjemme (meter).
const GANGAVSTAND_TIL_HOLDEPLASS = 700;

// Farger. Heatmapet bruker én fargetone (blå) fra lys (få) til mørk (mange).
const VARMEFARGER = ['#cde2fb', '#86b6ef', '#3987e5', '#256abf', '#104281', '#0d366b'];
const STARTFARGE = '#eb6834';
const MALFARGE = '#2b2b2a';
const BUSSFARGE = '#4a3aa7';
const SNARVEIFARGE = '#1baf7a';

const OSM_KREDITERING = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-bidragsytere';

// Dataene du kan redigere (fra gangtrafikk-data.js). Lister som mangler blir tomme.
const DATA = GANGTRAFIKK_DATA;
DATA.startpunkter = DATA.startpunkter || [];
DATA.mal = DATA.mal || [];
DATA.snarveier = DATA.snarveier || [];

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
  zoom: 14.5,
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

// (innenfor(punkt, område) ligger i kartdata-henting.js)

// 8 -> "08:00–09:00"
function timeTekst(time) {
  return String(time).padStart(2, '0') + ':00–' + String((time + 1) % 24).padStart(2, '0') + ':00';
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

// Andelen av et startpunkt som bruker hver reisemåte (summerer til 1).
function andeler(start) {
  const r = start.reisemiddel || { gange: 100 };
  const sum = REISEMIDLER.reduce(function (s, m) { return s + (Number(r[m]) || 0); }, 0);
  const resultat = {};
  REISEMIDLER.forEach(function (m) { resultat[m] = sum ? (Number(r[m]) || 0) / sum : 0; });
  return resultat;
}

// ---------- 2. Grafen ----------

let noder = [];        // [lng, lat] for hver node
let kanter = [];       // { a, b, lengde, navn, ikkeSykkel, snarvei }
let hovedNoder = [];   // nodene i den største sammenhengende delen av nettet
// Naboliste i "kompakt" form (raskere for store nett): naboene til node n er
// naboTil[naboStart[n]] ... naboTil[naboStart[n + 1] - 1], via kant naboKant[...].
let naboStart, naboTil, naboKant;

function byggGraf(gangnett, snarveier) {
  noder = [];
  kanter = [];
  const nodeNummer = new Map(); // "lng,lat" -> nodenummer

  function finnNode(punkt) {
    const nokkel = punkt[0] + ',' + punkt[1];
    if (!nodeNummer.has(nokkel)) {
      nodeNummer.set(nokkel, noder.length);
      noder.push(punkt);
    }
    return nodeNummer.get(nokkel);
  }

  function leggTilKant(a, b, egenskaper) {
    if (a === b) {
      return;
    }
    kanter.push({
      a: a,
      b: b,
      lengde: avstand(noder[a], noder[b]),
      navn: egenskaper.navn || '',
      ikkeSykkel: !!egenskaper.ikkeSykkel,
      snarvei: !!egenskaper.snarvei
    });
  }

  gangnett.features.forEach(function (linje) {
    const p = linje.properties;
    const punkter = linje.geometry.coordinates;
    // Trapper markeres i eldre filer bare med type 'steps'.
    const egenskaper = { navn: p.navn, ikkeSykkel: p.ikkeSykkel || p.type === 'steps' };
    for (let i = 1; i < punkter.length; i++) {
      leggTilKant(finnNode(punkter[i - 1]), finnNode(punkter[i]), egenskaper);
    }
  });

  // Snarveiene: hvert endepunkt kobles til nærmeste node i nettet.
  const nettNoder = noder.length;
  snarveier.forEach(function (snarvei) {
    const punkter = snarvei.linje;
    if (!punkter || punkter.length < 2) {
      return;
    }
    const idListe = punkter.map(function (punkt, i) {
      const node = finnNode([punkt[0], punkt[1]]);
      if (i === 0 || i === punkter.length - 1) {
        const n = narmesteIListe(punkt, nettNoder);
        if (n.node >= 0 && n.node !== node) {
          // Koble endepunktet til nettet med en kort strekning.
          leggTilKant(node, n.node, { snarvei: true, navn: snarvei.navn });
        }
      }
      return node;
    });
    for (let i = 1; i < idListe.length; i++) {
      leggTilKant(idListe[i - 1], idListe[i], { snarvei: true, navn: snarvei.navn });
    }
  });

  // Bygg den kompakte nabolisten.
  const antall = new Int32Array(noder.length + 1);
  kanter.forEach(function (k) { antall[k.a + 1]++; antall[k.b + 1]++; });
  for (let n = 0; n < noder.length; n++) {
    antall[n + 1] += antall[n];
  }
  naboStart = antall;
  naboTil = new Int32Array(kanter.length * 2);
  naboKant = new Int32Array(kanter.length * 2);
  const fylt = naboStart.slice(0, noder.length);
  kanter.forEach(function (k, i) {
    naboTil[fylt[k.a]] = k.b; naboKant[fylt[k.a]++] = i;
    naboTil[fylt[k.b]] = k.a; naboKant[fylt[k.b]++] = i;
  });

  // Finn den største sammenhengende delen av nettet. Små løsrevne biter
  // hopper vi over når vi kobler punkter til nettet.
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
      for (let j = naboStart[x]; j < naboStart[x + 1]; j++) {
        if (del[naboTil[j]] === -1) {
          del[naboTil[j]] = n;
          ko.push(naboTil[j]);
        }
      }
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

// Rask tilnærmet avstand (god nok for å finne nærmeste punkt).
function raskAvstand2(a, b) {
  const x = (b[0] - a[0]) * 0.4477; // cos(63.4°): grader øst er kortere her nord
  const y = b[1] - a[1];
  return x * x + y * y;
}

// Nærmeste node blant de første "antall" nodene (brukes mens grafen bygges).
function narmesteIListe(posisjon, antall) {
  let best = -1;
  let bestD = Infinity;
  for (let n = 0; n < antall; n++) {
    const d = raskAvstand2(posisjon, noder[n]);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return { node: best, avstand: best >= 0 ? avstand(posisjon, noder[best]) : Infinity };
}

// Nærmeste node i hoveddelen av nettet.
function narmesteNode(posisjon) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < hovedNoder.length; i++) {
    const d = raskAvstand2(posisjon, noder[hovedNoder[i]]);
    if (d < bestD) {
      bestD = d;
      best = hovedNoder[i];
    }
  }
  return { node: best, avstand: best >= 0 ? avstand(posisjon, noder[best]) : Infinity };
}

// Dijkstras algoritme fra én node. hjul = true betyr sykkel/elsparkesykkel,
// som ikke kan ta trapper eller snarveier. Resultatet er et "tre": fra hvilken
// som helst node kan vi følge forrigeKant tilbake til startnoden.
function korteste(start, hjul) {
  const dist = new Float64Array(noder.length).fill(Infinity);
  const forrigeKant = new Int32Array(noder.length).fill(-1);
  const ko = new MinKo();
  dist[start] = 0;
  ko.leggTil(start, 0);
  while (ko.storrelse() > 0) {
    const n = ko.toppVerdi();
    const d = ko.toppPrioritet();
    ko.fjernTopp();
    if (d > dist[n]) {
      continue; // utdatert oppføring i køen
    }
    for (let j = naboStart[n]; j < naboStart[n + 1]; j++) {
      const k = kanter[naboKant[j]];
      if (hjul && (k.ikkeSykkel || k.snarvei)) {
        continue;
      }
      const ny = d + k.lengde;
      const til = naboTil[j];
      if (ny < dist[til]) {
        dist[til] = ny;
        forrigeKant[til] = naboKant[j];
        ko.leggTil(til, ny);
      }
    }
  }
  return { start: start, dist: dist, forrigeKant: forrigeKant };
}

// Følger treet fra en node tilbake til roten (målet) og kaller
// gjorMed(kant) for hver strekning på veien. Svarer false hvis det ikke finnes vei.
function folgRute(tre, fra, gjorMed) {
  if (fra < 0 || !isFinite(tre.dist[fra])) {
    return false;
  }
  let n = fra;
  while (n !== tre.start) {
    const k = tre.forrigeKant[n];
    gjorMed(k);
    n = kanter[k].a === n ? kanter[k].b : kanter[k].a;
  }
  return true;
}

// En prioritetskø (binær haug) med tall i typed arrays: rask for store nett.
function MinKo() {
  let verdier = new Int32Array(1024);
  let prioriteter = new Float64Array(1024);
  let lengde = 0;
  this.storrelse = function () { return lengde; };
  this.toppVerdi = function () { return verdier[0]; };
  this.toppPrioritet = function () { return prioriteter[0]; };
  this.leggTil = function (verdi, prioritet) {
    if (lengde === verdier.length) {
      const v = new Int32Array(lengde * 2); v.set(verdier); verdier = v;
      const p = new Float64Array(lengde * 2); p.set(prioriteter); prioriteter = p;
    }
    let i = lengde++;
    while (i > 0) {
      const forelder = (i - 1) >> 1;
      if (prioriteter[forelder] <= prioritet) {
        break;
      }
      verdier[i] = verdier[forelder];
      prioriteter[i] = prioriteter[forelder];
      i = forelder;
    }
    verdier[i] = verdi;
    prioriteter[i] = prioritet;
  };
  this.fjernTopp = function () {
    lengde--;
    if (lengde === 0) {
      return;
    }
    const verdi = verdier[lengde];
    const prioritet = prioriteter[lengde];
    let i = 0;
    for (;;) {
      let barn = 2 * i + 1;
      if (barn >= lengde) break;
      if (barn + 1 < lengde && prioriteter[barn + 1] < prioriteter[barn]) barn++;
      if (prioriteter[barn] >= prioritet) break;
      verdier[i] = verdier[barn];
      prioriteter[i] = prioriteter[barn];
      i = barn;
    }
    verdier[i] = verdi;
    prioriteter[i] = prioritet;
  };
}

// ---------- 3. Buss ----------

let bussLinjer = [];   // fra data/bussruter.js
let holdeplasser = []; // holdeplasser på campus: { posisjon, node, linjer: [linjenummer] }

function forberedBuss(bussruter) {
  bussLinjer = bussruter ? bussruter.linjer : [];
  holdeplasser = [];
  const funnet = new Map();
  bussLinjer.forEach(function (linje, li) {
    linje.stopp.forEach(function (p) {
      if (!innenfor(p, CAMPUS_SONE)) {
        return;
      }
      const nokkel = p[0].toFixed(5) + ',' + p[1].toFixed(5);
      if (!funnet.has(nokkel)) {
        funnet.set(nokkel, holdeplasser.length);
        holdeplasser.push({ posisjon: p, linjer: [] });
      }
      const hp = holdeplasser[funnet.get(nokkel)];
      if (hp.linjer.indexOf(li) < 0) {
        hp.linjer.push(li);
      }
    });
  });
  holdeplasser.forEach(function (hp) {
    hp.node = narmesteNode(hp.posisjon).node;
    hp.nokkel = hp.posisjon[0].toFixed(5) + ',' + hp.posisjon[1].toFixed(5);
  });
}

// Finner holdeplassene på campus man kan nå med buss fra en posisjon:
// linjer med en holdeplass innen gangavstand (utenfor campus), som senere i
// rekkefølgen stopper på campus (da går bussen riktig vei).
function bussValg(posisjon) {
  const valg = new Map(); // holdeplassnummer -> linjenummer
  bussLinjer.forEach(function (linje, li) {
    let forste = -1;
    for (let i = 0; i < linje.stopp.length; i++) {
      if (!innenfor(linje.stopp[i], CAMPUS_SONE) && avstand(posisjon, linje.stopp[i]) <= GANGAVSTAND_TIL_HOLDEPLASS) {
        forste = i;
        break;
      }
    }
    if (forste < 0) {
      return;
    }
    for (let j = forste + 1; j < linje.stopp.length; j++) {
      const p = linje.stopp[j];
      if (!innenfor(p, CAMPUS_SONE)) {
        continue;
      }
      const nokkel = p[0].toFixed(5) + ',' + p[1].toFixed(5);
      const hi = holdeplasser.findIndex(function (hp) { return hp.nokkel === nokkel; });
      if (hi >= 0 && !valg.has(hi)) {
        valg.set(hi, li);
      }
    }
  });
  if (valg.size > 0) {
    return { direkte: true, valg: valg };
  }
  // Ingen direkte linje: anta bytte, og la dem gå av på hvilken som helst campusholdeplass.
  const alle = new Map();
  holdeplasser.forEach(function (hp, hi) { alle.set(hi, -1); });
  return { direkte: false, valg: alle };
}

// ---------- 4. Modellen ----------

let malTraer = [];   // for hvert mål: { gange: tre, hjul: tre }
let startInfo = [];  // for hvert startpunkt: { node, avstand, buss }
let malInfo = [];    // for hvert mål: { node, avstand }

// Regner ut det som trengs. hva = 'alt' (grafen er endret), 'mal' (et mål er
// flyttet), 'start' (et startpunkt er flyttet) eller 'tall' (bare tall er endret).
function oppdaterModell(hva) {
  if (hva === 'alt') {
    byggGraf(gangnettData, DATA.snarveier);
    forberedBuss(typeof BUSSRUTER !== 'undefined' ? BUSSRUTER : bussData);
  }
  if (hva === 'alt' || hva === 'mal') {
    malInfo = DATA.mal.map(function (m) { return narmesteNode(m.posisjon); });
    malTraer = malInfo.map(function (m) {
      return { gange: korteste(m.node, false), hjul: korteste(m.node, true) };
    });
  }
  if (hva === 'alt' || hva === 'mal' || hva === 'start') {
    startInfo = DATA.startpunkter.map(function (s) {
      const n = narmesteNode(s.posisjon);
      return { node: n.node, avstand: n.avstand, buss: bussValg(s.posisjon) };
    });
  }
  beregnSkala();
}

// Beregner trafikken én time. Gir flyt per strekning for hver reisemåte,
// bussreisende per linje og holdeplass, og personer som ikke fikk rute.
function beregnTime(time) {
  const flyt = {
    gange: new Float32Array(kanter.length),
    sykkel: new Float32Array(kanter.length),
    sparkesykkel: new Float32Array(kanter.length)
  };
  const bussPerLinje = new Map();
  const bussPerHoldeplass = new Float32Array(holdeplasser.length);
  const perReisemiddel = { gange: 0, sykkel: 0, buss: 0, sparkesykkel: 0 };
  let uten = 0;
  const sumVekt = DATA.mal.reduce(function (s, m) { return s + vektTime(m, time); }, 0);

  DATA.startpunkter.forEach(function (start, si) {
    const personer = personerTime(start, time);
    if (personer === 0) {
      return;
    }
    if (sumVekt === 0) {
      uten += personer;
      return;
    }
    const info = startInfo[si];
    const andel = andeler(start);
    REISEMIDLER.forEach(function (modus) {
      const pm = personer * andel[modus];
      if (pm === 0) {
        return;
      }
      perReisemiddel[modus] += pm;
      DATA.mal.forEach(function (mal, mi) {
        const n = pm * vektTime(mal, time) / sumVekt;
        if (n === 0) {
          return;
        }
        const tre = malTraer[mi];
        let ok;
        if (modus === 'buss') {
          // Velg holdeplassen med kortest gangvei til målet.
          let bestHp = -1;
          let bestLinje = -1;
          let bestD = Infinity;
          info.buss.valg.forEach(function (linje, hi) {
            const d = tre.gange.dist[holdeplasser[hi].node];
            if (d < bestD) {
              bestD = d;
              bestHp = hi;
              bestLinje = linje;
            }
          });
          ok = bestHp >= 0 && folgRute(tre.gange, holdeplasser[bestHp].node, function (k) { flyt.gange[k] += n; });
          if (ok) {
            bussPerHoldeplass[bestHp] += n;
            bussPerLinje.set(bestLinje, (bussPerLinje.get(bestLinje) || 0) + n);
          }
        } else {
          const t = modus === 'gange' ? tre.gange : tre.hjul;
          ok = folgRute(t, info.node, function (k) { flyt[modus][k] += n; });
        }
        if (!ok) {
          uten += n;
        }
      });
    });
  });
  return { flyt: flyt, bussPerLinje: bussPerLinje, bussPerHoldeplass: bussPerHoldeplass, perReisemiddel: perReisemiddel, uten: uten };
}

// ---------- 5. Visning ----------

const timeSlider = document.getElementById('time-slider');
const timeTekstEl = document.getElementById('time-tekst');
const timeSum = document.getElementById('time-sum');
const visBokser = {
  gange: document.getElementById('vis-gange'),
  sykkel: document.getElementById('vis-sykkel'),
  sparkesykkel: document.getElementById('vis-sparkesykkel')
};
const visBussBoks = document.getElementById('vis-buss');

let maksFlyt = 1;
let personerPerTime = [];

// Summen av flyten for reisemåtene som er huket av.
function valgtFlyt(resultat) {
  const sum = new Float32Array(kanter.length);
  Object.keys(visBokser).forEach(function (m) {
    if (visBokser[m].checked) {
      const f = resultat.flyt[m];
      for (let k = 0; k < sum.length; k++) {
        sum[k] += f[k];
      }
    }
  });
  return sum;
}

// Finner den travleste strekningen i hele døgnet (for fargeskalaen) og
// personer per time (for døgnprofilen).
function beregnSkala() {
  maksFlyt = 1;
  personerPerTime = [];
  for (let t = 0; t < 24; t++) {
    const r = beregnTime(t);
    const f = valgtFlyt(r);
    for (let k = 0; k < f.length; k++) {
      if (f[k] > maksFlyt) {
        maksFlyt = f[k];
      }
    }
    personerPerTime.push(DATA.startpunkter.reduce(function (s, st) { return s + personerTime(st, t); }, 0));
  }
  if (kart.getLayer('varme')) {
    settSkala();
  }
  lagProfil();
}

function settSkala() {
  kart.setPaintProperty('varme', 'heatmap-weight', ['interpolate', ['linear'], ['get', 'p'], 0, 0, maksFlyt * 0.15, 0.35, maksFlyt, 1]);
  kart.setPaintProperty('flyt', 'line-color', ['interpolate', ['linear'], ['get', 'p'], 0, VARMEFARGER[0], maksFlyt * 0.5, VARMEFARGER[3], maksFlyt, VARMEFARGER[5]]);
  kart.setPaintProperty('flyt', 'line-width', ['interpolate', ['linear'], ['get', 'p'], 0, 1.5, maksFlyt, 9]);
}

// Punktene til heatmapet: ett punkt ca. hver 8. meter langs strekninger med trafikk.
function varmepunkter(flyt) {
  const punkter = [];
  kanter.forEach(function (kant, k) {
    const f = flyt[k];
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

function flytlinjer(flyt) {
  const linjer = [];
  kanter.forEach(function (kant, k) {
    if (flyt[k] < 0.5) {
      return;
    }
    linjer.push({
      type: 'Feature',
      properties: { p: flyt[k], navn: kant.navn },
      geometry: { type: 'LineString', coordinates: [noder[kant.a], noder[kant.b]] }
    });
  });
  return { type: 'FeatureCollection', features: linjer };
}

function startpunktData(time) {
  return {
    type: 'FeatureCollection',
    features: DATA.startpunkter.map(function (s, i) {
      return {
        type: 'Feature',
        properties: { indeks: i, navn: s.navn, personer: personerTime(s, time) },
        geometry: { type: 'Point', coordinates: s.posisjon }
      };
    })
  };
}

function malData() {
  return {
    type: 'FeatureCollection',
    features: DATA.mal.map(function (m, i) {
      return { type: 'Feature', properties: { indeks: i, navn: m.navn }, geometry: { type: 'Point', coordinates: m.posisjon } };
    })
  };
}

function snarveiData() {
  return {
    type: 'FeatureCollection',
    features: DATA.snarveier.filter(function (s) { return s.linje && s.linje.length >= 2; }).map(function (s) {
      return { type: 'Feature', properties: { indeks: DATA.snarveier.indexOf(s), navn: s.navn }, geometry: { type: 'LineString', coordinates: s.linje } };
    })
  };
}

// Stiplede linjer fra startpunkter som ligger utenfor nettet til der de kommer inn.
function tilforselData() {
  return {
    type: 'FeatureCollection',
    features: DATA.startpunkter.map(function (s, i) {
      const info = startInfo[i];
      if (!info || info.node < 0 || info.avstand < 50) {
        return null;
      }
      return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [s.posisjon, noder[info.node]] } };
    }).filter(Boolean)
  };
}

function bussLinjeData(resultat) {
  return {
    type: 'FeatureCollection',
    features: bussLinjer.map(function (linje, li) {
      return {
        type: 'Feature',
        properties: { indeks: li, ref: linje.ref, navn: linje.navn, passasjerer: resultat ? (resultat.bussPerLinje.get(li) || 0) : 0 },
        geometry: { type: 'MultiLineString', coordinates: linje.strek }
      };
    })
  };
}

function holdeplassData(resultat) {
  return {
    type: 'FeatureCollection',
    features: holdeplasser.map(function (hp, hi) {
      return {
        type: 'Feature',
        properties: { indeks: hi, avstigende: resultat ? resultat.bussPerHoldeplass[hi] : 0 },
        geometry: { type: 'Point', coordinates: hp.posisjon }
      };
    })
  };
}

let sisteResultat = null;

function visTime(time) {
  timeSlider.value = time;
  timeTekstEl.textContent = timeTekst(time);
  timeSum.textContent = tall(personerPerTime[time] || 0) + ' personer denne timen';
  const resultat = beregnTime(time);
  sisteResultat = resultat;
  if (kart.getSource('varme')) {
    const flyt = valgtFlyt(resultat);
    kart.getSource('varme').setData(varmepunkter(flyt));
    kart.getSource('flyt').setData(flytlinjer(flyt));
    kart.getSource('starter').setData(startpunktData(time));
    kart.getSource('mal').setData(malData());
    kart.getSource('snarveier').setData(snarveiData());
    kart.getSource('tilforsel').setData(tilforselData());
    kart.getSource('buss').setData(bussLinjeData(resultat));
    kart.getSource('holdeplasser').setData(holdeplassData(resultat));
  }
  oppdaterTabeller(time, resultat);
  oppdaterProfil(time);
}

// Tegner alt på nytt for timen som er valgt nå (brukes av redigeringen).
function tegnPaNytt() {
  visTime(Number(timeSlider.value));
}

timeSlider.addEventListener('input', tegnPaNytt);

Object.keys(visBokser).forEach(function (m) {
  visBokser[m].addEventListener('change', function () {
    beregnSkala();
    tegnPaNytt();
  });
});

visBussBoks.addEventListener('change', function () {
  const synlig = visBussBoks.checked ? 'visible' : 'none';
  ['buss', 'holdeplasser'].forEach(function (id) { kart.setLayoutProperty(id, 'visibility', synlig); });
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

// ---------- 6. Kartlagene ----------

function leggTilLag() {
  const tom = { type: 'FeatureCollection', features: [] };

  // Hele gangnettet som tynne grå linjer.
  kart.addSource('nett', { type: 'geojson', data: gangnettData, attribution: OSM_KREDITERING });
  kart.addLayer({ id: 'nett', type: 'line', source: 'nett', paint: { 'line-color': '#8a8984', 'line-width': 0.8, 'line-opacity': 0.45 } });

  // Bussrutene: tykkere jo flere av våre studenter som tar linja denne timen.
  kart.addSource('buss', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'buss',
    type: 'line',
    source: 'buss',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': BUSSFARGE,
      'line-width': ['interpolate', ['linear'], ['get', 'passasjerer'], 0, 1, 300, 8],
      'line-opacity': ['case', ['>', ['get', 'passasjerer'], 0.5], 0.75, 0.25]
    }
  });

  // Stiplede tilførselslinjer fra startpunkter utenfor nettet.
  kart.addSource('tilforsel', { type: 'geojson', data: tom });
  kart.addLayer({ id: 'tilforsel', type: 'line', source: 'tilforsel', paint: { 'line-color': '#52514e', 'line-width': 1.5, 'line-dasharray': [1, 2] } });

  // Heatmapet. Den nederste delen av skalaen er forsterket litt, så også
  // stier med lite trafikk synes.
  kart.addSource('varme', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'varme',
    type: 'heatmap',
    source: 'varme',
    paint: {
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 13, 1, 15, 1.5, 17, 2.5],
      'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 4, 13, 7, 15, 14, 16, 22, 18, 50],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(205,226,251,0)',
        0.08, VARMEFARGER[0], 0.25, VARMEFARGER[1], 0.45, VARMEFARGER[2],
        0.65, VARMEFARGER[3], 0.85, VARMEFARGER[4], 1, VARMEFARGER[5]
      ],
      // Heatmapet tones ut når du zoomer helt inn; da tar linjene over.
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 16.5, 0.85, 18, 0]
    }
  });

  kart.addSource('flyt', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'flyt',
    type: 'line',
    source: 'flyt',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 16, 0, 17.5, 0.9] }
  });

  // Snarveiene: grønne stiplede linjer.
  kart.addSource('snarveier', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'snarveier',
    type: 'line',
    source: 'snarveier',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': SNARVEIFARGE, 'line-width': 3.5, 'line-dasharray': [2, 1.5] }
  });

  // Holdeplasser på campus: hvite rundinger med lilla kant, større jo flere som går av.
  kart.addSource('holdeplasser', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'holdeplasser',
    type: 'circle',
    source: 'holdeplasser',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'avstigende'], 0, 4, 300, 11],
      'circle-color': 'white',
      'circle-stroke-color': BUSSFARGE,
      'circle-stroke-width': 2.5
    }
  });

  kart.addSource('mal', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'mal',
    type: 'circle',
    source: 'mal',
    paint: { 'circle-radius': 7, 'circle-color': MALFARGE, 'circle-stroke-color': 'white', 'circle-stroke-width': 2 }
  });

  kart.addSource('starter', { type: 'geojson', data: tom });
  kart.addLayer({
    id: 'starter',
    type: 'circle',
    source: 'starter',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'personer'], 0, 6, 400, 14],
      'circle-color': STARTFARGE,
      'circle-stroke-color': 'white',
      'circle-stroke-width': 2
    }
  });

  settSkala();

  // Klikk: vis informasjon i en boble (ikke mens vi redigerer).
  kart.on('click', function (e) {
    if (typeof redigererScenario !== 'undefined' && redigererScenario) {
      return;
    }
    const time = Number(timeSlider.value);
    const treff = kart.queryRenderedFeatures(e.point, { layers: ['starter', 'mal', 'holdeplasser', 'snarveier', 'flyt', 'buss'] });
    if (!treff.length) {
      return;
    }
    const f = treff[0];
    const p = f.properties;
    let html = '';
    if (f.layer.id === 'starter') {
      const s = DATA.startpunkter[p.indeks];
      const a = andeler(s);
      html = '<strong>' + trygg(s.navn) + '</strong><br>' + tall(personerTime(s, time)) + ' personer kl. ' + timeTekst(time) + '<br>' +
        REISEMIDLER.map(function (m) { return REISEMIDDEL_NAVN[m] + ' ' + Math.round(a[m] * 100) + ' %'; }).join(', ');
      if (a.buss > 0 && startInfo[p.indeks] && !startInfo[p.indeks].buss.direkte) {
        html += '<br><em>Fant ingen direkte bussforbindelse til campus – antar bytte.</em>';
      }
    } else if (f.layer.id === 'mal') {
      const m = DATA.mal[p.indeks];
      html = '<strong>' + trygg(m.navn) + '</strong><br>Vekt kl. ' + timeTekst(time) + ': ' + vektTime(m, time);
    } else if (f.layer.id === 'holdeplasser') {
      const hp = holdeplasser[p.indeks];
      html = '<strong>Holdeplass</strong><br>Linjer: ' + trygg(hp.linjer.map(function (li) { return bussLinjer[li].ref; }).filter(Boolean).join(', ')) +
        '<br>' + tall(p.avstigende) + ' av våre går av her kl. ' + timeTekst(time);
    } else if (f.layer.id === 'snarveier') {
      html = '<strong>Snarvei</strong><br>' + trygg(p.navn);
    } else if (f.layer.id === 'flyt') {
      html = (p.navn ? '<strong>' + trygg(p.navn) + '</strong><br>' : '') + 'ca. ' + tall(p.p) + ' personer kl. ' + timeTekst(time);
    } else if (f.layer.id === 'buss') {
      html = '<strong>Linje ' + trygg(p.ref) + '</strong><br>' + trygg(p.navn) + '<br>' + tall(p.passasjerer) + ' av våre studenter kl. ' + timeTekst(time);
    }
    new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(html).addTo(kart);
  });
  ['starter', 'mal', 'holdeplasser', 'snarveier', 'flyt', 'buss'].forEach(function (lag) {
    kart.on('mouseenter', lag, function () {
      if (!(typeof redigererScenario !== 'undefined' && redigererScenario)) {
        kart.getCanvas().style.cursor = 'pointer';
      }
    });
    kart.on('mouseleave', lag, function () {
      if (!(typeof redigererScenario !== 'undefined' && redigererScenario)) {
        kart.getCanvas().style.cursor = '';
      }
    });
  });
}

// ---------- 7. Sidepanelet: tabeller og døgnprofil ----------

function oppdaterTabeller(time, resultat) {
  document.getElementById('tabell-tittel').textContent =
    'Kl. ' + String(time).padStart(2, '0') + '–' + String((time + 1) % 24).padStart(2, '0');

  // Reisemåter totalt denne timen
  const totalt = REISEMIDLER.reduce(function (s, m) { return s + resultat.perReisemiddel[m]; }, 0);
  document.getElementById('reisemiddel-tabell').innerHTML = REISEMIDLER.map(function (m) {
    const n = resultat.perReisemiddel[m];
    return '<tr><td>' + REISEMIDDEL_NAVN[m] + '</td><td>' + tall(n) + '</td><td>' + (totalt ? Math.round(100 * n / totalt) : 0) + ' %</td></tr>';
  }).join('');

  document.getElementById('start-tabell').innerHTML = DATA.startpunkter.map(function (s) {
    return '<tr><td><span class="prikk start"></span>' + trygg(s.navn) + '</td><td>' + tall(personerTime(s, time)) + '</td></tr>';
  }).join('');

  // Bussreisende per linjenummer (begge retninger sammen), flest øverst
  const perRef = new Map();
  resultat.bussPerLinje.forEach(function (n, li) {
    const navn = li >= 0 ? 'Linje ' + (bussLinjer[li].ref || '?') : 'Med bytte';
    perRef.set(navn, (perRef.get(navn) || 0) + n);
  });
  const linjer = Array.from(perRef.entries())
    .filter(function (e) { return e[1] >= 0.5; })
    .sort(function (a, b) { return b[1] - a[1]; });
  document.getElementById('buss-tabell').innerHTML = linjer.length
    ? linjer.map(function (e) {
      return '<tr><td>' + trygg(e[0]) + '</td><td>' + tall(e[1]) + '</td></tr>';
    }).join('')
    : '<tr><td colspan="2" class="hjelp">Ingen bussreisende denne timen</td></tr>';

  const sumVekt = DATA.mal.reduce(function (sum, m) { return sum + vektTime(m, time); }, 0);
  document.getElementById('mal-tabell').innerHTML = DATA.mal.map(function (m) {
    const andel = sumVekt ? Math.round(100 * vektTime(m, time) / sumVekt) : 0;
    return '<tr><td><span class="prikk mal"></span>' + trygg(m.navn) + '</td><td>' + andel + ' %</td></tr>';
  }).join('');

  // Advarsler
  const advarsler = [];
  if (resultat.uten >= 1) {
    advarsler.push(tall(resultat.uten) + ' personer denne timen har ingen mål med vekt eller ingen vei dit, og er ikke med i heatmapet.');
  }
  DATA.startpunkter.forEach(function (s, i) {
    const a = andeler(s);
    const info = startInfo[i];
    if (!info) {
      return;
    }
    if (a.buss > 0 && bussLinjer.length === 0) {
      advarsler.push('«' + s.navn + '»: bussrutene er ikke lastet, så bussreisende er ikke med.');
    } else if (a.buss > 0 && !info.buss.direkte) {
      advarsler.push('«' + s.navn + '»: ingen buss innen ' + GANGAVSTAND_TIL_HOLDEPLASS + ' m går direkte til campus. Antar bytte.');
    }
    if ((a.gange > 0 || a.sykkel > 0 || a.sparkesykkel > 0) && info.avstand > 300) {
      advarsler.push('«' + s.navn + '» ligger ' + tall(info.avstand) + ' m utenfor gangnettet. Gående og syklende starter der den stiplede linja treffer nettet.');
    }
  });
  DATA.mal.forEach(function (m, i) {
    if (malInfo[i] && malInfo[i].avstand > 100) {
      advarsler.push('Målet «' + m.navn + '» ligger ' + tall(malInfo[i].avstand) + ' m fra nærmeste sti. Sjekk posisjonen.');
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
    soyle.addEventListener('mouseenter', function () {
      profilTips.hidden = false;
      profilTips.textContent = 'Kl. ' + timeTekst(time) + ': ' + tall(antall) + ' personer';
    });
    soyle.addEventListener('mouseleave', function () { profilTips.hidden = true; });
    profil.appendChild(soyle);
  });
  oppdaterProfil(Number(timeSlider.value));
}

function oppdaterProfil(time) {
  Array.from(profil.children).forEach(function (soyle, i) {
    soyle.classList.toggle('valgt', i === time);
  });
}

// ---------- 8. Kartdata: fra fil, eller hentet direkte ----------

let gangnettData = null;
let bussData = null;
const nettStatus = document.getElementById('nett-status');
const bussStatus = document.getElementById('buss-status');

function lastNed(innhold, filnavn) {
  const fil = new Blob([innhold], { type: 'text/javascript' });
  const lenke = document.createElement('a');
  lenke.href = URL.createObjectURL(fil);
  lenke.download = filnavn;
  lenke.click();
  URL.revokeObjectURL(lenke.href);
}

function dagensDato() {
  return new Date().toISOString().slice(0, 10);
}

function nettBeskrivelse() {
  let tekst = gangnettData.features.length + ' stier og veier, ' + tall(noder.length) + ' kryss og knekkpunkter.';
  if (!gangnettData.bbox) {
    tekst += ' Fila dekker et mindre område enn analyseområdet: trykk «Hent gangnett på nytt» og last opp den nye fila.';
  }
  return tekst;
}

document.getElementById('hent-nett-knapp').addEventListener('click', async function () {
  nettStatus.textContent = 'Henter gangnett fra OpenStreetMap … (kan ta et halvt minutt)';
  try {
    const gangnett = await hentGangnett();
    lastNed(lagGangnettFil(gangnett, dagensDato()), 'gangnett.js');
    nettStatus.textContent = 'Hentet ' + gangnett.features.length + ' stier og veier. Fila gangnett.js er lastet ned: ' +
      'last den opp til mappa data/ på GitHub for å erstatte den gamle.';
  } catch (feil) {
    console.error(feil);
    nettStatus.textContent = 'Klarte ikke hente gangnettet (' + feil.message + '). Prøv igjen om litt.';
  }
});

document.getElementById('hent-buss-knapp').addEventListener('click', async function () {
  bussStatus.textContent = 'Henter bussruter fra OpenStreetMap … (kan ta et minutt)';
  try {
    const bussruter = await hentBussruter();
    lastNed(lagBussruterFil(bussruter, dagensDato()), 'bussruter.js');
    bussStatus.textContent = 'Hentet ' + bussruter.linjer.length + ' bussruter. Fila bussruter.js er lastet ned: ' +
      'last den opp til mappa data/ på GitHub.';
  } catch (feil) {
    console.error(feil);
    bussStatus.textContent = 'Klarte ikke hente bussrutene (' + feil.message + '). Prøv igjen om litt.';
  }
});

async function start() {
  // Gangnettet
  if (typeof GANGNETT !== 'undefined') {
    gangnettData = GANGNETT;
  } else {
    nettStatus.textContent = 'Fant ikke data/gangnett.js. Henter gangnettet fra OpenStreetMap …';
    try {
      gangnettData = await hentGangnett();
    } catch (feil) {
      console.error(feil);
      nettStatus.textContent = 'Fant ikke data/gangnett.js, og klarte ikke hente gangnettet fra OpenStreetMap (' +
        feil.message + '). Last siden på nytt for å prøve igjen.';
      return;
    }
  }

  // Bussrutene (siden virker uten, men da er bussreisende ikke med)
  if (typeof BUSSRUTER === 'undefined') {
    bussStatus.textContent = 'Fant ikke data/bussruter.js. Henter bussrutene fra OpenStreetMap …';
    try {
      bussData = await hentBussruter();
    } catch (feil) {
      console.error(feil);
      bussStatus.textContent = 'Klarte ikke hente bussrutene (' + feil.message + '). Bussreisende er ikke med.';
    }
  }

  oppdaterModell('alt');
  nettStatus.textContent = nettBeskrivelse();
  if (bussLinjer.length) {
    bussStatus.textContent = bussLinjer.length + ' bussruter, ' + holdeplasser.length + ' holdeplasser på campus.' +
      (typeof BUSSRUTER === 'undefined' ? ' Hentet direkte: trykk «Hent bussruter på nytt» og last opp fila for raskere lasting.' : '');
  }

  await kartetErKlart;
  leggTilLag();
  tegnPaNytt();
  // Si fra til redigeringen (gangtrafikk-rediger.js) at alt er klart.
  document.dispatchEvent(new Event('gangtrafikk-klar'));
}

// Start når hele siden er lastet, så redigeringen (gangtrafikk-rediger.js)
// rekker å hente utkastet ditt før kartet regnes ut første gang.
document.addEventListener('DOMContentLoaded', start);
