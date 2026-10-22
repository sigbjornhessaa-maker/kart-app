// kartdata-henting.js: henter kartdata fra OpenStreetMap til gangtrafikksiden.
//
//   1. Gang- og sykkelnettet i analyseområdet  -> data/gangnett.js
//   2. Bussrutene i hele Trondheim              -> data/bussruter.js
// og inneholder den felles, robuste hentingen fra Overpass (brukes også av
// 3D-bygningene på forsiden).
//
// Brukes på to måter:
//   - Av gangtrafikk.js: mangler en av filene, henter siden dataene selv, og
//     knappene «Hent ... på nytt» lar deg laste ned filene.
//   - Av verktoy/hent-kartdata.js (kjøres med Node) for å lage filene direkte.

// Overpass-tjenestene vi prøver, i rekkefølge. Den første er hovedtjenesten.
// Private.coffee (tidligere kumi.systems) er en gratis reserve.
// (Når hentescriptet kjøres med Node, kan OVERPASS_URL peke til en annen tjeneste, f.eks. for testing.)
const OVERPASS_SERVERE = (typeof process !== 'undefined' && process.env && process.env.OVERPASS_URL)
  ? [process.env.OVERPASS_URL]
  : [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

// Hvor lenge en lagret kopi i nettleseren regnes som fersk (dager).
const LAGRET_KOPI_DAGER = 14;

// Analyseområdet for gangnettet: campus med god margin, så både Moholt,
// Singsaker, Lerkendal, Øya og sentrum kommer med (ca. 7 × 5 km).
const ANALYSEOMRADE = {
  sor: 63.3950,
  vest: 10.3600,
  nord: 63.4400,
  ost: 10.4550
};

// Området for 3D-bygningene: Gløshaugen, Hesthagen/Elgeseter,
// Studentersamfundet og Lerkendal, med litt margin.
const BYGG_OMRADE = {
  sor: 63.4065,
  vest: 10.3880,
  nord: 63.4265,
  ost: 10.4165
};

// Området for bussruter: hele Trondheim.
const BYOMRADE = {
  sor: 63.3300,
  vest: 10.2200,
  nord: 63.4700,
  ost: 10.6000
};

// Veityper (highway=*) man kan gå eller sykle på. Store veier er med fordi
// fortau ofte ikke er tegnet som egne linjer i OpenStreetMap.
const GANGBARE_VEITYPER = [
  'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'living_street',
  'residential', 'service', 'unclassified', 'tertiary', 'secondary',
  'primary', 'track', 'bridleway'
];

function boksTekst(o) {
  return o.sor + ',' + o.vest + ',' + o.nord + ',' + o.ost;
}

// I nettleseren holder det med Content-Type. Fra Node (GitHub Action) sier vi
// også hvem vi er, slik Overpass ber om. (I nettleseren kan ikke User-Agent
// settes uten at Overpass må godkjenne en ekstra forespørsel først.)
function overpassHoder() {
  const hoder = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (typeof window === 'undefined') {
    hoder['User-Agent'] = 'kart-app (https://github.com/sigbjornhessaa-maker/kart-app)';
  }
  return hoder;
}

function vent(ms) {
  return new Promise(function (ferdig) { setTimeout(ferdig, ms); });
}

// Sender en spørring til Overpass. Overpass er gratis og ofte travel, så vi
// prøver flere ganger, med økende pause, og bytter tjeneste ved feil.
//   status – (valgfri) funksjon som får en tekst om hva som skjer
async function sporOverpass(sporring, status) {
  // Fra Node (GitHub Action) haster det ikke: flere forsøk og lengre pauser.
  const fraNode = typeof window === 'undefined';
  const forsok = fraNode ? 6 : 4;
  let sisteFeil = null;
  for (let i = 0; i < forsok; i++) {
    const url = OVERPASS_SERVERE[i % OVERPASS_SERVERE.length];
    // Avbryt hvis det tar mer enn 3 minutter.
    const avbryter = new AbortController();
    const tidsfrist = setTimeout(function () { avbryter.abort(); }, 180000);
    try {
      const svar = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(sporring),
        headers: overpassHoder(),
        signal: avbryter.signal
      });
      if (!svar.ok) {
        throw new Error('Overpass svarte med feilkode ' + svar.status +
          (svar.status === 429 ? ' (for mange forespørsler)' : svar.status === 504 ? ' (for travel)' : ''));
      }
      const data = await svar.json();
      // Hvis Overpass går tom for tid underveis, svarer den «OK» med et
      // ufullstendig resultat og en merknad (remark). Det regner vi som feil.
      if (data.remark && /error|timed out|out of memory/i.test(data.remark)) {
        throw new Error('Ufullstendig svar fra Overpass: ' + data.remark);
      }
      return data;
    } catch (feil) {
      sisteFeil = feil.name === 'AbortError' ? new Error('Overpass brukte for lang tid') : feil;
      console.warn('Overpass-forsøk ' + (i + 1) + ' feilet (' + url + '):', sisteFeil.message);
      if (i < forsok - 1) {
        const sekunder = (fraNode ? 20 : 3) * (i + 1); // i nettleseren 3, 6, 9 s; fra Node 20, 40, 60 … s
        if (status) {
          status('OpenStreetMap svarte ikke (' + sisteFeil.message + '). Prøver igjen om ' + sekunder + ' s …');
        }
        await vent(sekunder * 1000);
      }
    } finally {
      clearTimeout(tidsfrist);
    }
  }
  throw sisteFeil;
}

// ---------- Lagret kopi i nettleseren (IndexedDB) ----------
// Når dataene er hentet én gang, lagres de i nettleseren. Neste gang siden
// åpnes, brukes kopien, så vi slipper å vente på Overpass. Feiler hentingen,
// bruker vi en eldre kopi hvis vi har en.

function apneLager() {
  return new Promise(function (ferdig, feilet) {
    if (typeof indexedDB === 'undefined') {
      feilet(new Error('Nettleseren har ikke IndexedDB'));
      return;
    }
    const foresporsel = indexedDB.open('kart-app', 1);
    foresporsel.onupgradeneeded = function () {
      foresporsel.result.createObjectStore('kartdata');
    };
    foresporsel.onsuccess = function () { ferdig(foresporsel.result); };
    foresporsel.onerror = function () { feilet(foresporsel.error); };
  });
}

async function lesLager(nokkel) {
  try {
    const db = await apneLager();
    return await new Promise(function (ferdig) {
      const f = db.transaction('kartdata').objectStore('kartdata').get(nokkel);
      f.onsuccess = function () { ferdig(f.result || null); };
      f.onerror = function () { ferdig(null); };
    });
  } catch (feil) {
    return null; // f.eks. privat modus: da går det fint uten lagring
  }
}

async function skrivLager(nokkel, verdi) {
  try {
    const db = await apneLager();
    db.transaction('kartdata', 'readwrite').objectStore('kartdata').put(verdi, nokkel);
  } catch (feil) {
    // Ikke plass eller ikke lov: da lagrer vi bare ikke.
  }
}

// Henter data med lagret kopi.
//   nokkel   – navnet på kopien (spørringen selv, så en ny spørring gir ny kopi)
//   hent     – funksjon som henter dataene fra Overpass
//   valg.tvingNy – true = hent nytt selv om vi har en fersk kopi
// Svarer { data, dato, fraLager }.
async function hentMedLager(nokkel, hent, valg) {
  valg = valg || {};
  const kopi = await lesLager(nokkel);
  const alderDager = kopi ? (Date.now() - kopi.tid) / 86400000 : Infinity;
  if (kopi && !valg.tvingNy && alderDager < LAGRET_KOPI_DAGER) {
    return { data: kopi.data, dato: new Date(kopi.tid), fraLager: true };
  }
  try {
    const data = await hent();
    await skrivLager(nokkel, { tid: Date.now(), data: data });
    return { data: data, dato: new Date(), fraLager: false };
  } catch (feil) {
    if (kopi) {
      console.warn('Bruker lagret kopi fordi hentingen feilet:', feil.message);
      return { data: kopi.data, dato: new Date(kopi.tid), fraLager: true, gammel: true };
    }
    throw feil;
  }
}

// 6 desimaler er ca. 10 cm. Kryss mellom stier får nøyaktig samme koordinat,
// så rutesøket kan se hvor stiene henger sammen.
function avrund(p) {
  return [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))];
}

// ---------- 1. Gangnettet ----------

function lagGangnettSporring() {
  return '[out:json][timeout:120];' +
    'way["highway"~"^(' + GANGBARE_VEITYPER.join('|') + ')$"](' + boksTekst(ANALYSEOMRADE) + ');' +
    // «out geom» gir både egenskapene (tags) og koordinatene til hver vei.
    // (NB: «out tags» ville bare gitt egenskapene, uten koordinater.)
    'out geom;';
}

// Kan man gå her? Nei hvis det er forbudt for gående eller privat.
function erGangbar(tags) {
  const ja = ['yes', 'designated', 'permissive'];
  if (ja.indexOf(tags.foot) >= 0) {
    return true;
  }
  if (tags.foot === 'no' || tags.foot === 'private') {
    return false;
  }
  if (tags.access === 'no' || tags.access === 'private') {
    return false;
  }
  return true;
}

// Gjør svaret fra Overpass om til GeoJSON med én linje per vei/sti.
function overpassTilGangnett(data) {
  const linjer = [];
  data.elements.forEach(function (el) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) {
      return;
    }
    const tags = el.tags || {};
    if (!erGangbar(tags)) {
      return;
    }
    const egenskaper = { osmId: 'way/' + el.id, type: tags.highway };
    if (tags.name) {
      egenskaper.navn = tags.name;
    }
    // Kan man sykle her? Trapper og stier forbudt for sykkel regnes som nei.
    if (tags.highway === 'steps' || tags.bicycle === 'no' || tags.bicycle === 'dismount') {
      egenskaper.ikkeSykkel = true;
    }
    linjer.push({
      type: 'Feature',
      properties: egenskaper,
      geometry: { type: 'LineString', coordinates: el.geometry.map(avrund) }
    });
  });
  if (linjer.length === 0) {
    throw new Error('Svaret fra OpenStreetMap inneholdt ingen stier eller veier');
  }
  const o = ANALYSEOMRADE;
  // bbox (standard i GeoJSON) forteller hvilket område nettet dekker.
  return { type: 'FeatureCollection', bbox: [o.vest, o.sor, o.ost, o.nord], features: linjer };
}

// Henter gangnettet direkte fra Overpass (uten lagret kopi).
async function hentGangnett(status) {
  return overpassTilGangnett(await sporOverpass(lagGangnettSporring(), status));
}

// Henter gangnettet, med lagret kopi i nettleseren.
function hentGangnettMedLager(status, valg) {
  return hentMedLager(lagGangnettSporring(), function () { return hentGangnett(status); }, valg);
}

// ---------- 1b. Bygningene til 3D-kartet ----------

function lagByggSporring() {
  const boks = boksTekst(BYGG_OMRADE);
  // Alle bygninger (building=*) innenfor området, med omriss (out geom).
  return '[out:json][timeout:60];(' +
    'way["building"](' + boks + ');' +
    'relation["building"]["type"="multipolygon"](' + boks + ');' +
    ');out geom;';
}

// Svaret fra Overpass beholdes som det er (bygninger.js gjør det om til 3D),
// men uten unødvendige felt, så fila blir mindre.
async function hentBygninger(status) {
  const data = await sporOverpass(lagByggSporring(), status);
  if (!data.elements || data.elements.length === 0) {
    throw new Error('Svaret fra OpenStreetMap inneholdt ingen bygninger');
  }
  return { elements: data.elements };
}

function hentBygningerMedLager(status, valg) {
  return hentMedLager('bygninger:' + lagByggSporring(), function () { return hentBygninger(status); }, valg);
}

function lagBygningerFil(bygninger, hentetDato) {
  return '// data/bygninger.js: bygningene på campus, fra OpenStreetMap (brukes av 3D-kartet).\n' +
    '// © OpenStreetMap-bidragsytere, lisens ODbL (https://www.openstreetmap.org/copyright)\n' +
    '// Hentet ' + hentetDato + ' av GitHub Action «Oppdater kartdata». Ikke rediger fila selv:\n' +
    '// rettinger legger du inn i campus-data.js.\n' +
    'const BYGNINGER_OSM = ' + JSON.stringify(bygninger) + ';\n';
}

// ---------- 2. Bussrutene ----------

function lagBussSporring() {
  return '[out:json][timeout:180];' +
    'relation["type"="route"]["route"="bus"](' + boksTekst(BYOMRADE) + ');' +
    'out geom;';
}

function innenfor(p, o) {
  return p[1] >= o.sor && p[1] <= o.nord && p[0] >= o.vest && p[0] <= o.ost;
}

// Forenkler en linje: fjerner punkter som nesten ligger på linja mellom
// naboene (Douglas–Peucker). Gjør fila mye mindre uten at det synes.
function forenkle(punkter, toleranseGrader) {
  if (punkter.length <= 2) {
    return punkter;
  }
  function avstandTilLinje(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengde2 = dx * dx + dy * dy;
    let t = lengde2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengde2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - p[0];
    const y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  let maks = 0;
  let indeks = 0;
  for (let i = 1; i < punkter.length - 1; i++) {
    const d = avstandTilLinje(punkter[i], punkter[0], punkter[punkter.length - 1]);
    if (d > maks) {
      maks = d;
      indeks = i;
    }
  }
  if (maks < toleranseGrader) {
    return [punkter[0], punkter[punkter.length - 1]];
  }
  const venstre = forenkle(punkter.slice(0, indeks + 1), toleranseGrader);
  const hoyre = forenkle(punkter.slice(indeks), toleranseGrader);
  return venstre.slice(0, -1).concat(hoyre);
}

// Gjør bussrute-relasjonene fra Overpass om til en enkel liste med linjer.
// Hver linje har nummer (ref), navn, holdeplassene i rekkefølge og streken.
function overpassTilBussruter(data) {
  const linjer = [];
  data.elements.forEach(function (rel) {
    if (rel.type !== 'relation' || !rel.members) {
      return;
    }
    const tags = rel.tags || {};

    // Holdeplasser: medlemmer med rolle platform eller stop (også *_entry_only osv.).
    // Mange holdeplasser står både som "stop" (i veien) og "platform" (ved fortauet);
    // vi bruker platform hvis linja har det, ellers stop.
    function holdeplasser(rolle) {
      const liste = [];
      rel.members.forEach(function (m) {
        if (!m.role || m.role.indexOf(rolle) !== 0) {
          return;
        }
        let punkt = null;
        if (m.type === 'node' && m.lat !== undefined) {
          punkt = avrund(m);
        } else if (m.type === 'way' && m.geometry && m.geometry.length) {
          punkt = avrund(m.geometry[0]);
        }
        if (punkt && innenfor(punkt, BYOMRADE)) {
          liste.push(punkt);
        }
      });
      return liste;
    }
    let stopp = holdeplasser('platform');
    if (stopp.length < 2) {
      stopp = holdeplasser('stop');
    }
    if (stopp.length < 2) {
      return;
    }

    // Streken: vei-medlemmer uten holdeplass-rolle, klippet til byområdet og forenklet.
    const strek = [];
    rel.members.forEach(function (m) {
      if (m.type !== 'way' || !m.geometry || (m.role && m.role !== 'forward' && m.role !== 'backward')) {
        return;
      }
      const punkter = m.geometry.map(avrund).filter(function (p) { return innenfor(p, BYOMRADE); });
      if (punkter.length >= 2) {
        strek.push(forenkle(punkter, 0.00003)); // ca. 3 m
      }
    });

    linjer.push({
      ref: tags.ref || '',
      navn: tags.name || '',
      stopp: stopp,
      strek: strek
    });
  });
  if (linjer.length === 0) {
    throw new Error('Svaret fra OpenStreetMap inneholdt ingen bussruter');
  }
  return { linjer: linjer };
}

async function hentBussruter(status) {
  return overpassTilBussruter(await sporOverpass(lagBussSporring(), status));
}

function hentBussruterMedLager(status, valg) {
  return hentMedLager(lagBussSporring(), function () { return hentBussruter(status); }, valg);
}

// ---------- Filene ----------

function lagGangnettFil(gangnett, hentetDato) {
  return '// data/gangnett.js: gang- og sykkelnettet i analyseområdet, fra OpenStreetMap.\n' +
    '// © OpenStreetMap-bidragsytere, lisens ODbL (https://www.openstreetmap.org/copyright)\n' +
    '// Hentet ' + hentetDato + '. Lag fila på nytt med «Hent gangnett på nytt» på gangtrafikksiden.\n' +
    '// Innholdet er vanlig GeoJSON (kan åpnes i f.eks. QGIS hvis du fjerner «const GANGNETT = »).\n' +
    'const GANGNETT = ' + JSON.stringify(gangnett) + ';\n';
}

function lagBussruterFil(bussruter, hentetDato) {
  return '// data/bussruter.js: bussrutene i Trondheim, fra OpenStreetMap.\n' +
    '// © OpenStreetMap-bidragsytere, lisens ODbL (https://www.openstreetmap.org/copyright)\n' +
    '// Hentet ' + hentetDato + '. Lag fila på nytt med «Hent bussruter på nytt» på gangtrafikksiden.\n' +
    '// Hver linje har: ref (linjenummer), navn, stopp (holdeplassene i rekkefølge) og strek.\n' +
    'const BUSSRUTER = ' + JSON.stringify(bussruter) + ';\n';
}

// Gjør funksjonene tilgjengelige for Node (verktoy/hent-kartdata.js).
if (typeof module !== 'undefined') {
  module.exports = { hentGangnett, hentBussruter, hentBygninger, lagGangnettFil, lagBussruterFil, lagBygningerFil };
}
