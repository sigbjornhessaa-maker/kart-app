// gangnett-henting.js: henter gang- og sykkelnettet på campus fra OpenStreetMap.
//
// Brukes på to måter:
//   1. Av verktoy/hent-gangnett.js (kjøres med Node) for å lage data/gangnett.js.
//   2. Av gangtrafikk.js, hvis data/gangnett.js mangler: da henter siden nettet
//      selv og lar deg laste ned fila.

// Området vi henter gangnett for: campusområdet med litt ekstra margin,
// så rutene til holdeplasser og boligområder rett utenfor kommer med.
const GANGNETT_OMRADE = {
  sor: 63.4045,
  vest: 10.3850,
  nord: 63.4290,
  ost: 10.4200
};

// Veityper (highway=*) man kan gå på. Store veier er med fordi fortau
// ofte ikke er tegnet som egne linjer i OpenStreetMap.
const GANGBARE_VEITYPER = [
  'footway', 'path', 'pedestrian', 'cycleway', 'steps', 'living_street',
  'residential', 'service', 'unclassified', 'tertiary', 'secondary',
  'primary', 'track', 'bridleway'
];

function lagGangnettSporring() {
  const o = GANGNETT_OMRADE;
  return '[out:json][timeout:90];' +
    'way["highway"~"^(' + GANGBARE_VEITYPER.join('|') + ')$"]' +
    '(' + o.sor + ',' + o.vest + ',' + o.nord + ',' + o.ost + ');' +
    'out geom tags;';
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
    linjer.push({
      type: 'Feature',
      properties: egenskaper,
      // 7 desimaler (ca. 1 cm). Kryss mellom stier har nøyaktig samme koordinat,
      // så rutesøket kan se hvor stiene henger sammen.
      geometry: {
        type: 'LineString',
        coordinates: el.geometry.map(function (p) {
          return [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7))];
        })
      }
    });
  });
  return { type: 'FeatureCollection', features: linjer };
}

// Lager innholdet i data/gangnett.js.
function lagGangnettFil(gangnett, hentetDato) {
  return '// data/gangnett.js: gang- og sykkelnettet på campus fra OpenStreetMap.\n' +
    '// © OpenStreetMap-bidragsytere, lisens ODbL (https://www.openstreetmap.org/copyright)\n' +
    '// Hentet ' + hentetDato + '. Lag fila på nytt med «Hent gangnett på nytt» på gangtrafikksiden.\n' +
    '// Innholdet er vanlig GeoJSON (kan åpnes i f.eks. QGIS hvis du fjerner «const GANGNETT = »).\n' +
    'const GANGNETT = ' + JSON.stringify(gangnett) + ';\n';
}

// Gjør funksjonene tilgjengelige for Node (verktoy/hent-gangnett.js).
if (typeof module !== 'undefined') {
  module.exports = { lagGangnettSporring, overpassTilGangnett, lagGangnettFil, GANGNETT_OMRADE };
}
