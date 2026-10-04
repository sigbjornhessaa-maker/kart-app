// rediger.js: redigeringsmodus for campus-kartet.
//
// Her kan du tegne nye bygg, flytte dem, dra i hjørnene og endre navn,
// høyde og årstall. Du kan også merke eksisterende bygg for riving.
// Når du er fornøyd, trykker du «Kopier kode» og limer teksten inn i
// campus-data.js på GitHub. Da blir endringene permanente for alle.
//
// Mens du jobber, lagres et utkast i nettleseren (localStorage), så du
// ikke mister noe hvis du laster siden på nytt.

// ---------- Tilstand (hva som skjer akkurat nå) ----------

let redigerer = false;      // er redigeringsmodus slått på?
let valgtBygg = null;       // indeksen til valgt nytt bygg i CAMPUS_DATA.nyeBygninger
let valgtHjorne = null;     // indeksen til valgt hjørne i det valgte bygget
let valgtRivning = null;    // OSM-ID-en til valgt eksisterende bygg (for riving)
let tegner = false;         // holder vi på å tegne et nytt bygg?
let tegnepunkter = [];      // hjørnene i bygget vi tegner, [[lng, lat], ...]
let dra = null;             // info om det vi drar i akkurat nå
let visningForRedigering = null; // vinkel og rotasjon før redigering, så vi kan gå tilbake

const UTKAST_NOKKEL = 'campus-utkast';

// Elementene i sidepanelet
const redigerKnapp = document.getElementById('rediger-knapp');
const redigerPanel = document.getElementById('rediger-panel');
const tegnKnapp = document.getElementById('tegn-knapp');
const byggSkjema = document.getElementById('bygg-skjema');
const feltNavn = document.getElementById('felt-navn');
const feltByggeaar = document.getElementById('felt-byggeaar');
const feltHoyde = document.getElementById('felt-hoyde');
const feltRiveaar = document.getElementById('felt-riveaar');
const slettHjorneKnapp = document.getElementById('slett-hjorne');
const slettByggKnapp = document.getElementById('slett-bygg');
const rivingsSkjema = document.getElementById('rivings-skjema');
const rivingsNavn = document.getElementById('rivings-navn');
const feltRivingAar = document.getElementById('felt-riving-aar');
const feltMerknad = document.getElementById('felt-merknad');
const kopierKnapp = document.getElementById('kopier-kode');
const lastNedKnapp = document.getElementById('last-ned');
const forkastKnapp = document.getElementById('forkast');
const kodeUt = document.getElementById('kode-ut');
const redigerStatus = document.getElementById('rediger-status');
const utkastMelding = document.getElementById('utkast-melding');

// ---------- Utkast: data fra fila og endringene dine ----------

// En kopi av dataene slik de står i campus-data.js, så vi kan sammenligne
// og forkaste endringer. JSON.parse(JSON.stringify(...)) lager en dyp kopi.
const FIL_DATA = JSON.parse(JSON.stringify(CAMPUS_DATA));

// Sørg for at listene finnes, og at omrisset ikke gjentar første hjørne til slutt
// (vi lukker ringen selv når vi tegner).
function ryddData(data) {
  data.nyeBygninger = data.nyeBygninger || [];
  data.rivinger = data.rivinger || [];
  data.nyeBygninger.forEach(function (bygg) {
    const o = bygg.omriss;
    if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) {
      o.pop();
    }
  });
}
ryddData(CAMPUS_DATA);
ryddData(FIL_DATA);

// Lager en "standardversjon" av dataene, så vi kan sammenligne dem uten at
// rekkefølgen på feltene eller små avrundinger i koordinatene teller med.
function standardform(data) {
  return JSON.stringify({
    nyeBygninger: data.nyeBygninger.map(function (b) {
      return {
        navn: b.navn || '',
        byggeår: b.byggeår || null,
        høyde: b.høyde || null,
        riveår: b.riveår || null,
        omriss: b.omriss.map(function (p) { return [p[0].toFixed(6), p[1].toFixed(6)]; })
      };
    }),
    rivinger: data.rivinger.map(function (r) {
      return { osmId: r.osmId, riveår: r.riveår || null, merknad: r.merknad || null };
    })
  });
}

function erLikFila() {
  return standardform(CAMPUS_DATA) === standardform(FIL_DATA);
}

// Lagrer endringene som utkast i nettleseren og tegner alt på nytt.
function lagreEndringer() {
  try {
    if (erLikFila()) {
      localStorage.removeItem(UTKAST_NOKKEL);
    } else {
      localStorage.setItem(UTKAST_NOKKEL, JSON.stringify(CAMPUS_DATA));
    }
  } catch (feil) {
    // Noen nettlesere (f.eks. privat modus) tillater ikke lagring. Da går det fint uten.
  }
  utkastMelding.hidden = erLikFila();
  oppdaterBygningsdata(); // fra bygninger.js
  tegnRedigering();
}

// Hent utkastet fra forrige gang, hvis det finnes og er forskjellig fra fila.
function hentUtkast() {
  let utkast = null;
  try {
    utkast = JSON.parse(localStorage.getItem(UTKAST_NOKKEL));
  } catch (feil) {
    utkast = null;
  }
  if (!utkast) {
    return;
  }
  ryddData(utkast);
  if (standardform(utkast) === standardform(FIL_DATA)) {
    // Utkastet er allerede lagt inn i campus-data.js. Da trenger vi det ikke lenger.
    localStorage.removeItem(UTKAST_NOKKEL);
    return;
  }
  CAMPUS_DATA.nyeBygninger = utkast.nyeBygninger;
  CAMPUS_DATA.rivinger = utkast.rivinger;
  utkastMelding.hidden = false;
  oppdaterBygningsdata();
}

// ---------- Tegne redigeringslagene ----------

// Gjør et åpent omriss om til en lukket ring, slik GeoJSON krever.
function lukketRing(omriss) {
  return omriss.concat([omriss[0]]);
}

// Oppdaterer de flate redigeringslagene: byggene, hjørnene og strekene vi tegner.
function tegnRedigering() {
  if (!kart.getSource('rediger-bygg')) {
    return;
  }

  // Alle nye bygg som flate flater. Det valgte bygget får valgt: true.
  const bygg = CAMPUS_DATA.nyeBygninger.map(function (b, i) {
    return {
      type: 'Feature',
      properties: { indeks: i, valgt: i === valgtBygg },
      geometry: { type: 'Polygon', coordinates: [lukketRing(b.omriss)] }
    };
  });
  kart.getSource('rediger-bygg').setData({ type: 'FeatureCollection', features: redigerer ? bygg : [] });

  // Håndtak: hjørnene på det valgte bygget, og "midtpunkter" mellom hjørnene
  // som du kan dra i for å lage et nytt hjørne.
  const handtak = [];
  if (redigerer && valgtBygg !== null) {
    const o = CAMPUS_DATA.nyeBygninger[valgtBygg].omriss;
    o.forEach(function (punkt, i) {
      const neste = o[(i + 1) % o.length];
      handtak.push({
        type: 'Feature',
        properties: { type: 'midt', indeks: i },
        geometry: { type: 'Point', coordinates: [(punkt[0] + neste[0]) / 2, (punkt[1] + neste[1]) / 2] }
      });
    });
    o.forEach(function (punkt, i) {
      handtak.push({
        type: 'Feature',
        properties: { type: 'hjorne', indeks: i, valgt: i === valgtHjorne },
        geometry: { type: 'Point', coordinates: punkt }
      });
    });
  }
  // Mens vi tegner et nytt bygg: vis hjørnene vi har klikket så langt.
  if (tegner) {
    tegnepunkter.forEach(function (punkt, i) {
      handtak.push({
        type: 'Feature',
        properties: { type: 'hjorne', indeks: i, valgt: i === 0 },
        geometry: { type: 'Point', coordinates: punkt }
      });
    });
  }
  kart.getSource('rediger-handtak').setData({ type: 'FeatureCollection', features: handtak });
}

// Streken som følger musa mens du tegner.
function tegnHjelpelinje(musepunkt) {
  const punkter = musepunkt ? tegnepunkter.concat([musepunkt]) : tegnepunkter;
  kart.getSource('rediger-tegning').setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: punkter.length > 1 ? punkter : [] }
  });
}

// ---------- Sidepanelet ----------

// Viser riktig skjema ut fra hva som er valgt.
function oppdaterPanel() {
  const bygg = valgtBygg !== null ? CAMPUS_DATA.nyeBygninger[valgtBygg] : null;
  byggSkjema.hidden = !bygg;
  if (bygg) {
    feltNavn.value = bygg.navn || '';
    feltByggeaar.value = bygg.byggeår || '';
    feltHoyde.value = bygg.høyde || '';
    feltRiveaar.value = bygg.riveår || '';
    slettHjorneKnapp.disabled = valgtHjorne === null || bygg.omriss.length <= 3;
  }

  const rivning = valgtRivning ? finnRivning(valgtRivning) : null;
  rivingsSkjema.hidden = !valgtRivning;
  if (valgtRivning) {
    feltRivingAar.value = rivning ? rivning.riveår : '';
    feltMerknad.value = rivning && rivning.merknad ? rivning.merknad : '';
  }

  tegnKnapp.textContent = tegner ? 'Ferdig tegnet' : 'Tegn nytt bygg';
  tegnKnapp.classList.toggle('aktiv', tegner);
}

function velgBygg(indeks) {
  valgtBygg = indeks;
  valgtHjorne = null;
  valgtRivning = null;
  oppdaterPanel();
  tegnRedigering();
}

function finnRivning(osmId) {
  return CAMPUS_DATA.rivinger.find(function (r) { return r.osmId === osmId; });
}

// Når du skriver i skjemaet, oppdateres bygget med en gang.
function lesTallfelt(felt) {
  const tall = parseInt(felt.value, 10);
  return isNaN(tall) ? null : tall;
}

function skjemaEndret() {
  const bygg = CAMPUS_DATA.nyeBygninger[valgtBygg];
  if (!bygg) {
    return;
  }
  bygg.navn = feltNavn.value;
  bygg.byggeår = lesTallfelt(feltByggeaar) || Number(aarSlider.value);
  bygg.høyde = parseFloat(feltHoyde.value) || 10;
  const riveaar = lesTallfelt(feltRiveaar);
  if (riveaar) {
    bygg.riveår = riveaar;
  } else {
    delete bygg.riveår; // tomt felt = skal ikke rives
  }
  lagreEndringer();
}

[feltNavn, feltByggeaar, feltHoyde, feltRiveaar].forEach(function (felt) {
  felt.addEventListener('input', skjemaEndret);
});

// Riving av et eksisterende bygg fra OpenStreetMap.
function rivingEndret() {
  const aar = lesTallfelt(feltRivingAar);
  let rivning = finnRivning(valgtRivning);
  if (!aar) {
    // Tomt riveår = ikke riv. Fjern rivingen fra listen.
    CAMPUS_DATA.rivinger = CAMPUS_DATA.rivinger.filter(function (r) { return r.osmId !== valgtRivning; });
  } else {
    if (!rivning) {
      rivning = { osmId: valgtRivning };
      CAMPUS_DATA.rivinger.push(rivning);
    }
    rivning.riveår = aar;
    if (feltMerknad.value.trim()) {
      rivning.merknad = feltMerknad.value.trim();
    } else {
      delete rivning.merknad;
    }
  }
  lagreEndringer();
}

feltRivingAar.addEventListener('input', rivingEndret);
feltMerknad.addEventListener('input', rivingEndret);

slettHjorneKnapp.addEventListener('click', function () {
  const bygg = CAMPUS_DATA.nyeBygninger[valgtBygg];
  if (bygg && valgtHjorne !== null && bygg.omriss.length > 3) {
    bygg.omriss.splice(valgtHjorne, 1);
    valgtHjorne = null;
    oppdaterPanel();
    lagreEndringer();
  }
});

slettByggKnapp.addEventListener('click', function () {
  const bygg = CAMPUS_DATA.nyeBygninger[valgtBygg];
  if (bygg && confirm('Vil du slette «' + (bygg.navn || 'bygget') + '»?')) {
    CAMPUS_DATA.nyeBygninger.splice(valgtBygg, 1);
    velgBygg(null);
    lagreEndringer();
  }
});

// ---------- Tegne et nytt bygg ----------

function startTegning() {
  tegner = true;
  tegnepunkter = [];
  velgBygg(null);
  kart.getCanvas().style.cursor = 'crosshair';
  redigerStatus.textContent = 'Klikk i kartet for å sette hjørnene. Klikk på det første hjørnet eller «Ferdig tegnet» for å avslutte. Esc avbryter.';
}

function avsluttTegning(lagre) {
  if (lagre && tegnepunkter.length >= 3) {
    CAMPUS_DATA.nyeBygninger.push({
      navn: 'Nytt bygg',
      byggeår: Number(aarSlider.value),
      høyde: 15,
      omriss: tegnepunkter
    });
    tegner = false;
    velgBygg(CAMPUS_DATA.nyeBygninger.length - 1);
    lagreEndringer();
    feltNavn.focus();
    feltNavn.select();
    redigerStatus.textContent = 'Bygget er lagt til. Gi det et navn, høyde og byggeår.';
  } else {
    tegner = false;
    redigerStatus.textContent = lagre ? 'Et bygg må ha minst 3 hjørner.' : '';
  }
  tegnepunkter = [];
  tegnHjelpelinje(null);
  kart.getCanvas().style.cursor = '';
  oppdaterPanel();
  tegnRedigering();
}

tegnKnapp.addEventListener('click', function () {
  if (tegner) {
    avsluttTegning(true);
  } else {
    startTegning();
  }
});

// Esc avbryter tegning, Enter avslutter.
document.addEventListener('keydown', function (hendelse) {
  if (!tegner) {
    return;
  }
  if (hendelse.key === 'Escape') {
    avsluttTegning(false);
  } else if (hendelse.key === 'Enter') {
    avsluttTegning(true);
  }
});

// ---------- Klikk i kartet ----------

// Kalles først i kartklikket i script.js. Svarer true hvis redigeringen tok seg av klikket.
function redigeringsklikk(hendelse) {
  if (!redigerer) {
    return false;
  }

  if (tegner) {
    const punkt = [hendelse.lngLat.lng, hendelse.lngLat.lat];
    // Klikk nær det første hjørnet (innenfor 10 piksler) avslutter bygget.
    if (tegnepunkter.length >= 3) {
      const forste = kart.project(tegnepunkter[0]);
      if (forste.dist(hendelse.point) < 10) {
        avsluttTegning(true);
        return true;
      }
    }
    tegnepunkter.push(punkt);
    tegnHjelpelinje(null);
    tegnRedigering();
    return true;
  }

  // Klikk på et nytt bygg: velg det.
  const nytt = kart.queryRenderedFeatures(hendelse.point, { layers: ['rediger-fyll'] });
  if (nytt.length > 0) {
    if (nytt[0].properties.indeks !== valgtBygg) {
      velgBygg(nytt[0].properties.indeks);
    }
    return true;
  }

  // Klikk på et eksisterende bygg: vis skjema for riving.
  const eksisterende = kart.queryRenderedFeatures(hendelse.point, { layers: ['bygninger-3d'] })
    .filter(function (b) { return b.properties.kilde === 'osm'; });
  if (eksisterende.length > 0) {
    const p = eksisterende[0].properties;
    valgtBygg = null;
    valgtHjorne = null;
    valgtRivning = p.osmId;
    rivingsNavn.textContent = (p.navn || 'Bygning uten navn') + ' (' + p.osmId + ')';
    oppdaterPanel();
    tegnRedigering();
    return true;
  }

  // Klikk på tomt område: fjern valget.
  valgtRivning = null;
  velgBygg(null);
  return true;
}

// ---------- Dra i bygg og hjørner ----------

// Starter et drag. type er 'flytt' (hele bygget) eller 'hjorne' (ett hjørne).
function startDra(hendelse, type, hjorne) {
  // Bare én finger på mobil, ellers er det zoom.
  if (hendelse.points && hendelse.points.length !== 1) {
    return;
  }
  hendelse.preventDefault(); // hindrer at kartet panorerer mens vi drar
  const bygg = CAMPUS_DATA.nyeBygninger[valgtBygg];
  dra = {
    type: type,
    hjorne: hjorne,
    start: hendelse.lngLat,
    original: bygg.omriss.map(function (p) { return p.slice(); })
  };
  kart.getCanvas().style.cursor = 'grabbing';
  const erTouch = hendelse.type === 'touchstart';
  kart.on(erTouch ? 'touchmove' : 'mousemove', underDra);
  kart.once(erTouch ? 'touchend' : 'mouseup', sluttDra);
}

function underDra(hendelse) {
  if (!dra) {
    return;
  }
  const bygg = CAMPUS_DATA.nyeBygninger[valgtBygg];
  if (dra.type === 'flytt') {
    // Flytt alle hjørnene like langt som musa har flyttet seg.
    const dx = hendelse.lngLat.lng - dra.start.lng;
    const dy = hendelse.lngLat.lat - dra.start.lat;
    bygg.omriss = dra.original.map(function (p) { return [p[0] + dx, p[1] + dy]; });
  } else {
    bygg.omriss[dra.hjorne] = [hendelse.lngLat.lng, hendelse.lngLat.lat];
  }
  tegnRedigering(); // bare de flate lagene, det går raskt
}

function sluttDra() {
  kart.off('mousemove', underDra);
  kart.off('touchmove', underDra);
  dra = null;
  kart.getCanvas().style.cursor = '';
  lagreEndringer();
}

function nedPaHandtak(hendelse) {
  if (!redigerer || tegner || valgtBygg === null) {
    return;
  }
  const h = hendelse.features[0].properties;
  const omriss = CAMPUS_DATA.nyeBygninger[valgtBygg].omriss;
  if (h.type === 'midt') {
    // Dra i et midtpunkt: lag et nytt hjørne der, og dra i det.
    omriss.splice(h.indeks + 1, 0, hendelse.features[0].geometry.coordinates);
    valgtHjorne = h.indeks + 1;
  } else {
    valgtHjorne = h.indeks;
  }
  oppdaterPanel();
  startDra(hendelse, 'hjorne', valgtHjorne);
}

function nedPaBygg(hendelse) {
  if (!redigerer || tegner) {
    return;
  }
  // Hjørnene ligger oppå bygget. Har vi truffet et håndtak, tar nedPaHandtak seg av det.
  if (kart.queryRenderedFeatures(hendelse.point, { layers: ['rediger-handtak'] }).length > 0) {
    return;
  }
  const indeks = hendelse.features[0].properties.indeks;
  if (indeks !== valgtBygg) {
    return; // bare det valgte bygget kan flyttes; klikk først for å velge
  }
  startDra(hendelse, 'flytt');
}

// Musepeker: hånd over ting som kan dras.
function settPeker(peker) {
  return function () {
    if (redigerer && !tegner && !dra) {
      kart.getCanvas().style.cursor = peker;
    }
  };
}

// Streken følger musa mens du tegner.
kart.on('mousemove', function (hendelse) {
  if (tegner) {
    tegnHjelpelinje([hendelse.lngLat.lng, hendelse.lngLat.lat]);
  }
});

// ---------- Kopiere og laste ned koden ----------

// Skriver tekst med enkle anførselstegn, og passer på tegn som må "escapes".
function tekstverdi(tekst) {
  return "'" + String(tekst).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ') + "'";
}

function koordinat(punkt) {
  // 6 desimaler er nøyaktig nok (ca. 10 cm).
  return '[' + punkt[0].toFixed(6) + ', ' + punkt[1].toFixed(6) + ']';
}

// Lager hele innholdet i campus-data.js ut fra dataene i kartet.
function lagDatafil() {
  const bygg = CAMPUS_DATA.nyeBygninger.map(function (b) {
    const linjer = [
      '      navn: ' + tekstverdi(b.navn || 'Nytt bygg') + ',',
      '      byggeår: ' + (b.byggeår || new Date().getFullYear()) + ',',
      '      høyde: ' + (b.høyde || 10) + ','
    ];
    if (b.riveår) {
      linjer.push('      riveår: ' + b.riveår + ',');
    }
    linjer.push('      omriss: [');
    linjer.push(b.omriss.map(function (p) { return '        ' + koordinat(p); }).join(',\n'));
    linjer.push('      ]');
    return '    {\n' + linjer.join('\n') + '\n    }';
  });

  const rivinger = CAMPUS_DATA.rivinger.map(function (r) {
    let linje = '    { osmId: ' + tekstverdi(r.osmId) + ', riveår: ' + r.riveår;
    if (r.merknad) {
      linje += ', merknad: ' + tekstverdi(r.merknad);
    }
    return linje + ' }';
  });

  return DATAFIL_TOPP +
    '  nyeBygninger: [\n' + bygg.join(',\n') + (bygg.length ? '\n' : '') + '  ],\n\n' +
    DATAFIL_RIVINGER +
    '  rivinger: [\n' + rivinger.join(',\n') + (rivinger.length ? '\n' : '') + '  ]\n};\n';
}

// Forklaringen øverst i campus-data.js (kommer med når du kopierer koden).
const DATAFIL_TOPP = `// campus-data.js: DIN datafil for campus-kartet.
//
// Enklest: bruk «Rediger bygg» i kartet, og trykk «Kopier kode».
// Lim så inn ALT her i stedet for det som står i fila fra før.
//
// Her ligger:
//   1. nyeBygninger – bygninger som ikke finnes i OpenStreetMap ennå
//   2. rivinger     – eksisterende bygninger som skal rives
//
// Tidslinjen i kartet bruker årstallene her: en ny bygning dukker opp
// i byggeåret, og en bygning som rives forsvinner i riveåret.
//
// Regler hvis du skriver i fila selv (ellers virker ikke kartet):
//   - Tekst skal stå i anførselstegn: 'Slik'
//   - Tall skal IKKE ha anførselstegn: 2028
//   - Det skal være komma mellom hver linje/hvert element i en liste
//   - Koordinater skrives [lengdegrad, breddegrad], altså [øst, nord].
//     På campus er lengdegraden ca. 10.40 og breddegraden ca. 63.41.
//   - Linjer som starter med // er kommentarer og blir ignorert.
//
// Hvis kartet slutter å virke etter en endring: trykk F12 i nettleseren
// og se i «Console». Der står det hvilken linje feilen er på.

const CAMPUS_DATA = {

  // 1. NYE BYGNINGER
  // Hver bygning har:
  //   navn     – navnet som vises når du klikker på bygningen
  //   byggeår  – året bygningen står ferdig (vises fra og med dette året)
  //   høyde    – høyden i meter over bakken (ca. 3,5 m per etasje)
  //   riveår   – (valgfritt) året bygningen rives
  //   omriss   – hjørnene i bygningens grunnflate, i rekkefølge rundt bygget
`;

const DATAFIL_RIVINGER = `  // 2. RIVINGER
  // Bygninger fra OpenStreetMap som skal rives. Hver rivning har:
  //   osmId   – bygningens ID i OpenStreetMap, f.eks. 'way/123456789'
  //             (klikk på bygningen i kartet, så står ID-en i boblen)
  //   riveår  – året bygningen er revet (vises ikke lenger fra dette året)
  //   merknad – (valgfritt) en kort forklaring, vises i boblen
`;

kopierKnapp.addEventListener('click', async function () {
  const kode = lagDatafil();
  // Vis koden i tekstfeltet også, i tilfelle kopieringen ikke er tillatt.
  kodeUt.hidden = false;
  kodeUt.value = kode;
  try {
    await navigator.clipboard.writeText(kode);
    redigerStatus.textContent = 'Koden er kopiert! Åpne campus-data.js på GitHub, trykk blyanten, ' +
      'marker alt (Ctrl+A), lim inn (Ctrl+V) og trykk «Commit changes».';
  } catch (feil) {
    kodeUt.select();
    redigerStatus.textContent = 'Klarte ikke kopiere automatisk. Teksten under er markert: trykk Ctrl+C for å kopiere.';
  }
});

lastNedKnapp.addEventListener('click', function () {
  // Lag en fil i nettleseren og "klikk" på en nedlastingslenke til den.
  const fil = new Blob([lagDatafil()], { type: 'text/javascript' });
  const lenke = document.createElement('a');
  lenke.href = URL.createObjectURL(fil);
  lenke.download = 'campus-data.js';
  lenke.click();
  URL.revokeObjectURL(lenke.href);
  redigerStatus.textContent = 'Fila er lastet ned. På GitHub: «Add file» → «Upload files» for å erstatte den gamle.';
});

forkastKnapp.addEventListener('click', function () {
  if (!confirm('Vil du forkaste alle endringene og gå tilbake til det som står i campus-data.js?')) {
    return;
  }
  const kopi = JSON.parse(JSON.stringify(FIL_DATA));
  CAMPUS_DATA.nyeBygninger = kopi.nyeBygninger;
  CAMPUS_DATA.rivinger = kopi.rivinger;
  valgtRivning = null;
  velgBygg(null);
  kodeUt.hidden = true;
  lagreEndringer();
  redigerStatus.textContent = 'Endringene er forkastet.';
});

// ---------- Slå redigering av og på ----------

function slaRedigering(pa) {
  redigerer = pa;
  redigerPanel.hidden = !pa;
  redigerKnapp.textContent = pa ? 'Avslutt redigering' : 'Rediger bygg';
  redigerKnapp.classList.toggle('aktiv', pa);

  if (pa) {
    // Avslutt måling hvis den er på (maler og maalKnapp ligger i script.js).
    if (maler) {
      maalKnapp.click();
    }
    // Se rett ovenfra mens vi redigerer. Det er lettest å treffe hjørnene da.
    visningForRedigering = { pitch: kart.getPitch(), bearing: kart.getBearing() };
    kart.easeTo({ pitch: 0, bearing: 0 });
    kart.doubleClickZoom.disable();
    redigerStatus.textContent = 'Klikk på et oransje bygg for å velge det, eller på et grått bygg for å merke det for riving.';
  } else {
    if (tegner) {
      avsluttTegning(false);
    }
    valgtRivning = null;
    velgBygg(null);
    if (visningForRedigering) {
      kart.easeTo(visningForRedigering);
    }
    kart.doubleClickZoom.enable();
    redigerStatus.textContent = '';
  }

  // Tidslinjen trengs ikke mens vi redigerer, og på mobil dekker den mye av kartet.
  document.querySelector('.tidslinje').hidden = pa;
  // På smale skjermer ligger panelet under kartet: scroll opp så kartet synes.
  if (pa && window.innerWidth <= 700) {
    document.getElementById('kart-omrade').scrollIntoView({ behavior: 'smooth' });
  }

  skjulNyeI3D = pa; // fra bygninger.js: tegn de nye byggene flatt mens vi redigerer
  visAar();
  ['rediger-fyll', 'rediger-kant', 'rediger-handtak', 'rediger-tegning'].forEach(function (id) {
    kart.setLayoutProperty(id, 'visibility', pa ? 'visible' : 'none');
  });
  tegnRedigering();
}

redigerKnapp.addEventListener('click', function () {
  slaRedigering(!redigerer);
});

// ---------- Legg til redigeringslagene når kartet er klart ----------

narKartetErKlart(function () {
  const tom = { type: 'FeatureCollection', features: [] };
  kart.addSource('rediger-bygg', { type: 'geojson', data: tom });
  kart.addSource('rediger-handtak', { type: 'geojson', data: tom });
  kart.addSource('rediger-tegning', { type: 'geojson', data: tom });

  const skjult = { visibility: 'none' };

  // De nye byggene som flate flater: oransje, eller blå hvis valgt.
  kart.addLayer({
    id: 'rediger-fyll',
    type: 'fill',
    source: 'rediger-bygg',
    layout: skjult,
    paint: {
      'fill-color': ['case', ['get', 'valgt'], '#2e86de', '#e67e22'],
      'fill-opacity': 0.45
    }
  });
  kart.addLayer({
    id: 'rediger-kant',
    type: 'line',
    source: 'rediger-bygg',
    layout: skjult,
    paint: {
      'line-color': ['case', ['get', 'valgt'], '#1b4f8a', '#a04000'],
      'line-width': ['case', ['get', 'valgt'], 3, 1.5]
    }
  });
  // Streken mens du tegner
  kart.addLayer({
    id: 'rediger-tegning',
    type: 'line',
    source: 'rediger-tegning',
    layout: skjult,
    paint: { 'line-color': '#2e86de', 'line-width': 2, 'line-dasharray': [2, 1] }
  });
  // Håndtakene: store hvite rundinger på hjørnene, små blå på midtpunktene.
  kart.addLayer({
    id: 'rediger-handtak',
    type: 'circle',
    source: 'rediger-handtak',
    layout: skjult,
    paint: {
      'circle-radius': ['case', ['==', ['get', 'type'], 'midt'], 4, 7],
      'circle-color': [
        'case',
        ['==', ['get', 'type'], 'midt'], '#2e86de',
        ['get', 'valgt'], '#e74c3c',
        'white'
      ],
      'circle-stroke-color': '#1b4f8a',
      'circle-stroke-width': 2
    }
  });

  // Dra i håndtak og bygg, med mus og med finger.
  kart.on('mousedown', 'rediger-handtak', nedPaHandtak);
  kart.on('touchstart', 'rediger-handtak', nedPaHandtak);
  kart.on('mousedown', 'rediger-fyll', nedPaBygg);
  kart.on('touchstart', 'rediger-fyll', nedPaBygg);
  kart.on('mouseenter', 'rediger-handtak', settPeker('move'));
  kart.on('mouseleave', 'rediger-handtak', settPeker(''));
  kart.on('mouseenter', 'rediger-fyll', settPeker('grab'));
  kart.on('mouseleave', 'rediger-fyll', settPeker(''));
});

// Ta i bruk utkastet fra forrige gang (hvis det finnes).
hentUtkast();
