// bygninger.js: campus i 3D med tidslinje.
//
// Slik henger det sammen:
//   1. Vi henter eksisterende bygninger på campus fra OpenStreetMap (Overpass).
//   2. Vi legger til nye bygninger og rivinger fra campus-data.js.
//   3. MapLibre tegner alle bygningene som 3D-klosser (fill-extrusion).
//   4. Tidslinjen viser bare bygningene som står i det valgte året.
//
// Utenfor campusområdet er kartet vanlig 2D.

// Campusområdet: Gløshaugen, Hesthagen/Elgeseter, Studentersamfundet og
// Lerkendal, med litt margin. Bare bygninger innenfor dette hentes i 3D.
const CAMPUS_OMRADE = {
  sor: 63.4065,
  vest: 10.3880,
  nord: 63.4265,
  ost: 10.4165
};

// Hentingen fra OpenStreetMap (Overpass) ligger i kartdata-henting.js:
// den prøver flere ganger og lagrer en kopi i nettleseren.

// Standardhøyde når OpenStreetMap ikke vet hvor høy bygningen er,
// og høyde per etasje når vi bare vet antall etasjer.
const STANDARD_HOYDE = 10;
const ETASJEHOYDE = 3.5;

const aarSlider = document.getElementById('aar-slider');
const aarTekst = document.getElementById('aar-tekst');
const skjulUkjenteBoks = document.getElementById('skjul-ukjente');
const spillKnapp = document.getElementById('spill-knapp');
const byggStatus = document.getElementById('bygg-status');
const visBygningerBoks = document.getElementById('vis-bygninger');

// Alle bygningene som GeoJSON-objekter (både fra OSM og fra datafilen).
let osmBygninger = [];

// ---------- Hjelpefunksjoner for å lese OSM-data ----------

// Leser et tall fra tekst som "12", "12.5" eller "12 m". Gir null hvis det ikke går.
function lesTall(tekst) {
  const tall = parseFloat(tekst);
  return isNaN(tall) ? null : tall;
}

// ---------- Måneder ----------
// Tidslinjen går måned for måned. Internt gjør vi hver måned om til ett tall
// ("månedsnummer"): år × 12 + (måned − 1). Da er januar 2020 = 24240, februar
// 2020 = 24241 osv., og vi kan sammenligne tidspunkter som vanlige tall.
const TIDSLINJE_START = 2020; // første år på tidslinjen

function manedsnummer(aar, maned) {
  return aar * 12 + ((maned || 1) - 1); // uten måned regnes januar
}

// 24240 -> "januar 2020"
function manedTekst(nummer) {
  const dato = new Date(Math.floor(nummer / 12), nummer % 12, 1);
  return dato.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
}

// Leser år og måned fra tekst som "2026-03-15", "2026-03" eller "2026".
function lesDato(tekst) {
  const treff = tekst ? String(tekst).match(/(\d{4})(?:-(\d{2}))?/) : null;
  if (!treff) {
    return null;
  }
  return { aar: Number(treff[1]), maned: treff[2] ? Number(treff[2]) : null };
}

// Regner ut høyden på en bygning ut fra OSM-merkelappene (tags).
function finnHoyde(tags) {
  const hoyde = lesTall(tags.height);
  if (hoyde !== null) {
    return hoyde;
  }
  const etasjer = lesTall(tags['building:levels']);
  if (etasjer !== null) {
    return etasjer * ETASJEHOYDE;
  }
  return STANDARD_HOYDE;
}

// Hvor høyt over bakken bygningen starter (f.eks. for bygg som står på søyler).
function finnBunn(tags) {
  const bunn = lesTall(tags.min_height);
  if (bunn !== null) {
    return bunn;
  }
  const etasje = lesTall(tags['building:min_level']);
  return etasje !== null ? etasje * ETASJEHOYDE : 0;
}

// Gjør en liste med OSM-punkter {lat, lon} om til en lukket ring [[lng, lat], ...].
function tilRing(punkter) {
  const ring = punkter.map(function (p) { return [p.lon, p.lat]; });
  const forste = ring[0];
  const siste = ring[ring.length - 1];
  if (forste[0] !== siste[0] || forste[1] !== siste[1]) {
    ring.push(forste); // en ring må slutte der den startet
  }
  return ring;
}

// Er ringen lukket, altså slutter den der den startet?
function erLukket(punkter) {
  const a = punkter[0];
  const b = punkter[punkter.length - 1];
  return punkter.length >= 4 && a.lat === b.lat && a.lon === b.lon;
}

// Gjør et OSM-element (way eller relation) om til et GeoJSON-objekt.
// Gir null hvis vi ikke klarer å lage et omriss av det.
function osmTilGeoJson(element) {
  let geometri = null;

  if (element.type === 'way' && element.geometry && element.geometry.length >= 3) {
    // En "way" er en enkel strek rundt bygningen.
    geometri = { type: 'Polygon', coordinates: [tilRing(element.geometry)] };
  } else if (element.type === 'relation' && element.members) {
    // En "relation" brukes for bygninger med flere deler eller gårdsrom.
    // "outer" er ytterveggene, "inner" er hull (f.eks. et gårdsrom).
    const ytre = element.members.filter(function (m) {
      return m.role === 'outer' && m.geometry && erLukket(m.geometry);
    });
    const indre = element.members.filter(function (m) {
      return m.role === 'inner' && m.geometry && erLukket(m.geometry);
    });
    if (ytre.length === 1) {
      const ringer = [tilRing(ytre[0].geometry)].concat(indre.map(function (m) { return tilRing(m.geometry); }));
      geometri = { type: 'Polygon', coordinates: ringer };
    } else if (ytre.length > 1) {
      geometri = {
        type: 'MultiPolygon',
        coordinates: ytre.map(function (m) { return [tilRing(m.geometry)]; })
      };
    }
  }

  if (!geometri) {
    return null;
  }

  const tags = element.tags || {};
  const egenskaper = {
    osmId: element.type + '/' + element.id,
    navn: tags.name || '',
    hoyde: finnHoyde(tags),
    bunn: finnBunn(tags),
    kilde: 'osm'
  };
  // Byggeår legges bare til hvis vi vet det (tidslinjen trenger å vite forskjellen).
  const bygget = lesDato(tags.start_date || tags.construction_date);
  if (bygget) {
    egenskaper.byggeaar = bygget.aar;
    egenskaper.byggetid = manedsnummer(bygget.aar, bygget.maned);
    if (bygget.maned) {
      egenskaper.byggemaned = bygget.maned;
    }
  }

  return { type: 'Feature', geometry: geometri, properties: egenskaper };
}

// ---------- Data fra campus-data.js ----------

// Lager GeoJSON-objekter av de nye bygningene i datafilen.
function nyeBygningerFraDatafil() {
  return (CAMPUS_DATA.nyeBygninger || []).map(function (bygg) {
    const ring = bygg.omriss.slice(); // kopi, så vi ikke endrer datafilen
    const forste = ring[0];
    const siste = ring[ring.length - 1];
    if (forste[0] !== siste[0] || forste[1] !== siste[1]) {
      ring.push(forste);
    }
    const egenskaper = {
      navn: bygg.navn || 'Ny bygning',
      hoyde: bygg.høyde || STANDARD_HOYDE,
      bunn: 0,
      kilde: 'ny',
      byggeaar: bygg.byggeår,
      byggetid: manedsnummer(bygg.byggeår, bygg.byggemåned)
    };
    if (bygg.byggemåned) {
      egenskaper.byggemaned = bygg.byggemåned;
    }
    if (bygg.riveår) {
      egenskaper.riveaar = bygg.riveår;
      egenskaper.rivetid = manedsnummer(bygg.riveår, bygg.rivemåned);
      if (bygg.rivemåned) {
        egenskaper.rivemaned = bygg.rivemåned;
      }
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: egenskaper };
  });
}

// Legger riveår fra datafilen på de riktige OSM-bygningene.
function leggTilRivinger(bygninger) {
  (CAMPUS_DATA.rivinger || []).forEach(function (rivning) {
    const bygg = bygninger.find(function (b) { return b.properties.osmId === rivning.osmId; });
    if (bygg) {
      bygg.properties.riveaar = rivning.riveår;
      bygg.properties.rivetid = manedsnummer(rivning.riveår, rivning.rivemåned);
      if (rivning.rivemåned) {
        bygg.properties.rivemaned = rivning.rivemåned;
      }
      if (rivning.merknad) {
        bygg.properties.merknad = rivning.merknad;
      }
    } else if (bygninger.length > 0) {
      // (Bare advar når bygningene fra OpenStreetMap faktisk er hentet.)
      console.warn('Fant ikke bygningen ' + rivning.osmId + ' fra campus-data.js på campus.');
    }
  });
}

// Setter sammen alle bygningene og gir dem til kartet.
function oppdaterBygningsdata() {
  const kilde = kart.getSource('bygninger');
  if (!kilde) {
    return; // kartet er ikke klart ennå; vi prøver igjen når det er lastet
  }
  // Lag kopier av OSM-bygningene, så rivinger kan legges på uten å endre originalene.
  const alle = osmBygninger.map(function (b) {
    return { type: 'Feature', geometry: b.geometry, properties: Object.assign({}, b.properties) };
  });
  leggTilRivinger(alle);
  kilde.setData({
    type: 'FeatureCollection',
    features: alle.concat(nyeBygningerFraDatafil())
  });
}

// ---------- Hente bygninger fra OpenStreetMap ----------

const byggProvIgjen = document.getElementById('bygg-prov-igjen');

// tvingNy = true: hent nytt fra OpenStreetMap selv om vi har en lagret kopi.
async function hentOsmBygninger(tvingNy) {
  const o = CAMPUS_OMRADE;
  const boks = o.sor + ',' + o.vest + ',' + o.nord + ',' + o.ost;
  // Spørringen ber om alle bygninger (building=*) innenfor boksen,
  // med omriss (out geom).
  const sporring = '[out:json][timeout:60];(' +
    'way["building"](' + boks + ');' +
    'relation["building"]["type"="multipolygon"](' + boks + ');' +
    ');out geom;';

  byggProvIgjen.hidden = true;
  byggStatus.textContent = 'Henter bygninger fra OpenStreetMap …';
  function status(tekst) {
    byggStatus.textContent = tekst;
  }
  try {
    const svar = await hentMedLager('bygninger:' + sporring, function () {
      return sporOverpass(sporring, status);
    }, { tvingNy: tvingNy });
    osmBygninger = svar.data.elements.map(osmTilGeoJson).filter(function (b) { return b !== null; });
    byggStatus.textContent = osmBygninger.length + ' bygninger fra OpenStreetMap' +
      (svar.fraLager ? ' (lagret ' + svar.dato.toLocaleDateString('nb-NO') + ')' : '');
  } catch (feil) {
    console.error('Klarte ikke hente bygninger fra OpenStreetMap:', feil);
    byggStatus.textContent = 'Klarte ikke hente bygninger fra OpenStreetMap (' + feil.message + ').';
    byggProvIgjen.hidden = false;
  }
  oppdaterBygningsdata();
}

byggProvIgjen.addEventListener('click', function () {
  hentOsmBygninger(true);
});

// ---------- Tidslinjen ----------

// Mens du redigerer (rediger.js), tegnes de nye byggene flatt i stedet for i 3D.
let skjulNyeI3D = false;

// Lager et filter som bare slipper gjennom bygninger som står i måneden "tid"
// (et månedsnummer). En bygning står hvis den er ferdig (byggetid <= tid) og
// ikke revet (rivetid > tid).
function lagTidsfilter(tid) {
  const ikkeRevet = ['>', ['coalesce', ['get', 'rivetid'], 999999], tid];
  let bygget;
  if (skjulUkjenteBoks.checked) {
    // Bare bygninger vi vet byggeåret til
    bygget = ['all', ['has', 'byggetid'], ['<=', ['get', 'byggetid'], tid]];
  } else {
    // Bygninger uten kjent byggeår vises alltid
    bygget = ['<=', ['coalesce', ['get', 'byggetid'], 0], tid];
  }
  const filter = ['all', bygget, ikkeRevet];
  if (skjulNyeI3D) {
    filter.push(['!=', ['get', 'kilde'], 'ny']);
  }
  return filter;
}

// Viser campus slik den er i måneden slideren står på.
// (Heter visAar av historiske grunner; rediger.js bruker også navnet.)
function visAar() {
  const tid = Number(aarSlider.value);
  aarTekst.textContent = manedTekst(tid);
  // Laget finnes først når kartoppsettet er klart (se nederst i filen).
  if (kart.getLayer('bygninger-3d')) {
    kart.setFilter('bygninger-3d', lagTidsfilter(tid));
  }
}

aarSlider.addEventListener('input', visAar);
skjulUkjenteBoks.addEventListener('change', visAar);

// Avspilling: flytt slideren én måned fram hvert 0,15 sekund (ett år ≈ 2 sekunder).
let avspilling = null;

function stoppAvspilling() {
  clearInterval(avspilling);
  avspilling = null;
  spillKnapp.textContent = '▶';
}

spillKnapp.addEventListener('click', function () {
  if (avspilling) {
    stoppAvspilling();
    return;
  }
  // Start fra begynnelsen hvis vi allerede er på slutten.
  if (Number(aarSlider.value) >= Number(aarSlider.max)) {
    aarSlider.value = aarSlider.min;
  }
  spillKnapp.textContent = '⏸';
  avspilling = setInterval(function () {
    if (Number(aarSlider.value) >= Number(aarSlider.max)) {
      stoppAvspilling();
      return;
    }
    aarSlider.value = Number(aarSlider.value) + 1;
    visAar();
  }, 150);
});

// Slå 3D-bygningene av og på fra lagmenyen.
visBygningerBoks.addEventListener('change', function () {
  if (!kart.getLayer('bygninger-3d')) {
    return;
  }
  kart.setLayoutProperty('bygninger-3d', 'visibility', visBygningerBoks.checked ? 'visible' : 'none');
});

// ---------- Klikk på en bygning ----------

// Kalles fra kartklikket i script.js. Viser info og svarer true
// hvis brukeren klikket på en bygning, ellers false.
function visBygningsinfo(hendelse) {
  if (!kart.getLayer('bygninger-3d')) {
    return false;
  }
  const treff = kart.queryRenderedFeatures(hendelse.point, { layers: ['bygninger-3d'] });
  if (treff.length === 0) {
    return false;
  }

  const p = treff[0].properties;
  let html = '<div class="planinfo"><h3>' + trygg(p.navn || 'Bygning uten navn') + '</h3><table>' +
    '<tr><th>Høyde</th><td>' + Math.round(p.hoyde) + ' m</td></tr>' +
    '<tr><th>Ferdig</th><td>' + (p.byggeaar ? (p.byggemaned ? manedTekst(p.byggetid) : p.byggeaar) : 'Ukjent') + '</td></tr>';
  if (p.riveaar) {
    html += '<tr><th>Rives</th><td>' + (p.rivemaned ? manedTekst(p.rivetid) : p.riveaar) + '</td></tr>';
  }
  if (p.merknad) {
    html += '<tr><th>Merknad</th><td>' + trygg(p.merknad) + '</td></tr>';
  }
  if (p.kilde === 'osm') {
    html += '<tr><th>OSM-ID</th><td><a href="https://www.openstreetmap.org/' + trygg(p.osmId) +
      '" target="_blank" rel="noopener">' + trygg(p.osmId) + '</a></td></tr>';
  } else {
    html += '<tr><th>Kilde</th><td>campus-data.js</td></tr>';
  }
  html += '</table></div>';

  new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(hendelse.lngLat).setHTML(html).addTo(kart);
  return true;
}

// ---------- Legg til lagene når kartet er klart ----------

narKartetErKlart(function () {
  const o = CAMPUS_OMRADE;

  // En stiplet ramme som viser hvor 3D-området er.
  kart.addSource('campus-omrade', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[o.vest, o.sor], [o.ost, o.sor], [o.ost, o.nord], [o.vest, o.nord], [o.vest, o.sor]]
      }
    }
  });
  kart.addLayer({
    id: 'campus-omrade',
    type: 'line',
    source: 'campus-omrade',
    paint: { 'line-color': '#1f4e79', 'line-width': 2, 'line-dasharray': [4, 3], 'line-opacity': 0.6 }
  }, 'maling-linje'); // legg under målelinjen

  // Bygningene. attribution krediterer OpenStreetMap nederst i kartet.
  kart.addSource('bygninger', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: OSM_KREDITERING
  });

  // fill-extrusion = trekk grunnflaten opp i høyden, som en kloss.
  kart.addLayer({
    id: 'bygninger-3d',
    type: 'fill-extrusion',
    source: 'bygninger',
    paint: {
      // Farge: rød hvis bygningen skal rives, oransje hvis den er ny, ellers lys grå.
      'fill-extrusion-color': [
        'case',
        ['has', 'riveaar'], '#c0392b',
        ['==', ['get', 'kilde'], 'ny'], '#e67e22',
        '#d8d2c8'
      ],
      'fill-extrusion-height': ['get', 'hoyde'],
      'fill-extrusion-base': ['get', 'bunn'],
      'fill-extrusion-opacity': 0.9
    }
  }, 'maling-linje');

  // Slideren går måned for måned fra januar 2020 til desember i det seneste
  // året vi kjenner (minst 2040), og starter på denne måneden.
  const aarIDatafil = [];
  (CAMPUS_DATA.nyeBygninger || []).forEach(function (b) { aarIDatafil.push(b.byggeår, b.riveår || 0); });
  (CAMPUS_DATA.rivinger || []).forEach(function (r) { aarIDatafil.push(r.riveår); });
  const gyldigeAar = aarIDatafil.filter(Number.isFinite); // hopp over manglende årstall
  const sisteAar = Math.max(2040, Math.max.apply(null, gyldigeAar.concat([0])) + 2);
  aarSlider.min = manedsnummer(TIDSLINJE_START, 1);
  aarSlider.max = manedsnummer(sisteAar, 12);
  const na = new Date();
  aarSlider.value = manedsnummer(na.getFullYear(), na.getMonth() + 1);
  document.getElementById('tid-start').textContent = TIDSLINJE_START;
  document.getElementById('tid-slutt').textContent = sisteAar;

  visAar();
  oppdaterBygningsdata(); // vis bygningene vi har (datafilen, og OSM hvis de er hentet)
});

// Start hentingen fra OpenStreetMap med en gang, samtidig som kartet lastes.
hentOsmBygninger();
