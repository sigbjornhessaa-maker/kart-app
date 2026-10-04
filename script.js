// script.js: bestemmer hva siden GJØR (oppførsel og interaktivitet).
// Kartet tegnes med MapLibre GL, som bruker skjermkortet (WebGL) og kan vise 3D.
//
// Viktig forskjell fra Leaflet: MapLibre skriver koordinater som
// [lengdegrad, breddegrad] (øst, nord), altså motsatt rekkefølge av Leaflet.

// 1. Kartlagene. I MapLibre beskriver vi hele kartet i en "stil" (style):
//    - sources (kilder): hvor dataene kommer fra
//    - layers (lag): hvordan dataene skal tegnes, i rekkefølge nederst til øverst

// Reguleringsplaner fra Direktoratet for byggkvalitet (DiBK), som WMS.
// "vn2" betyr vertikalnivå 2, altså planer på bakkenivå (ikke tunneler og bruer).
const PLAN_WMS_URL = 'https://nap.ft.dibk.no/services/wms/reguleringsplaner';
const PLAN_LAG = 'arealformal_vn2,rpomrade_vn2'; // arealformål først, planområde-grensen oppå

// Kreditering av OpenStreetMap. Den vises alltid nederst i kartet,
// fordi både gatekartet og 3D-bygningene kommer fra OpenStreetMap.
const OSM_KREDITERING = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-bidragsytere';

const stil = {
  version: 8,
  sources: {
    // Vanlig gatekart fra OpenStreetMap. {z} er zoomnivå, {x} og {y} er hvilken flis.
    gatekart: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_KREDITERING
    },
    // Topografisk kart fra Kartverket (terreng, høydekurver, stier)
    topokart: {
      type: 'raster',
      tiles: ['https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png'],
      tileSize: 256,
      maxzoom: 18,
      attribution: '&copy; <a href="https://www.kartverket.no/" target="_blank">Kartverket</a>'
    },
    // Satellittbilder fra Esri
    satellitt: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Bilder &copy; Esri'
    },
    // Reguleringsplaner som WMS. MapLibre bytter selv ut {bbox-epsg-3857}
    // med området til hver flis, så serveren vet hva den skal tegne.
    planer: {
      type: 'raster',
      tiles: [PLAN_WMS_URL + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
        '&LAYERS=' + encodeURIComponent(PLAN_LAG) +
        '&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857' +
        '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'],
      tileSize: 256,
      attribution: 'Planer &copy; <a href="https://www.dibk.no/" target="_blank">DiBK</a>'
    }
  },
  layers: [
    // Bakgrunnskartene. Bare ett av dem er synlig om gangen (visibility).
    { id: 'gatekart', type: 'raster', source: 'gatekart' },
    { id: 'topokart', type: 'raster', source: 'topokart', layout: { visibility: 'none' } },
    { id: 'satellitt', type: 'raster', source: 'satellitt', layout: { visibility: 'none' } },
    // Reguleringsplaner oppå bakgrunnskartet, litt gjennomsiktig
    { id: 'planer', type: 'raster', source: 'planer', paint: { 'raster-opacity': 0.6 }, layout: { visibility: 'none' } }
  ]
};

// 2. Lag kartet. center er [lengdegrad, breddegrad] for Gløshaugen.
//    pitch er hvor mye kartet vippes (0 = rett ovenfra), bearing er rotasjon.
const kart = new maplibregl.Map({
  container: 'kart',
  style: stil,
  center: [10.4025, 63.4175],
  zoom: 15.3,
  pitch: 55,
  bearing: -20,
  maxPitch: 75,
  attributionControl: false // vi legger til vår egen under, med OSM alltid med
});

// Kartoppsettet (stilen) lastes litt etter at kartet er laget. Lag og kilder
// kan først legges til når det er klart. Vi venter IKKE på hendelsen 'load',
// for den kommer først når alle kartbildene er hentet, og hvis noen av dem
// feiler, kan den utebli helt. Da ville 3D-bygningene aldri blitt lagt til.
let kartetErKlart = false;
kart.once('style.load', function () {
  kartetErKlart = true;
});

// Kjører en funksjon når kartoppsettet er klart (med en gang hvis det allerede er det).
function narKartetErKlart(funksjon) {
  if (kartetErKlart) {
    funksjon();
  } else {
    kart.once('style.load', funksjon);
  }
}

// Knapper for zoom og rotasjon. Kompasset nullstiller rotasjon og vipping.
kart.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
// Krediteringsfeltet nederst til høyre. compact: false = alltid utfoldet.
kart.addControl(new maplibregl.AttributionControl({
  compact: false,
  customAttribution: OSM_KREDITERING
}), 'bottom-right');

// 3. Lagmenyen. Når brukeren velger et bakgrunnskart, skjuler vi de andre.
const BAKGRUNNER = ['gatekart', 'topokart', 'satellitt'];

document.querySelectorAll('input[name="bakgrunn"]').forEach(function (radio) {
  radio.addEventListener('change', function () {
    BAKGRUNNER.forEach(function (id) {
      kart.setLayoutProperty(id, 'visibility', id === radio.value ? 'visible' : 'none');
    });
  });
});

const visPlanerBoks = document.getElementById('vis-planer');
visPlanerBoks.addEventListener('change', function () {
  kart.setLayoutProperty('planer', 'visibility', visPlanerBoks.checked ? 'visible' : 'none');
});

// 4. Mine punkter. Hvert punkt er et objekt: { navn, lat, lng }.
//    Vi henter tidligere lagrede punkter fra nettleseren (localStorage),
//    slik at de ikke forsvinner når du laster siden på nytt.
let punkter = JSON.parse(localStorage.getItem('punkter') || '[]');
let markorer = []; // MapLibre-markørene som vises nå

const punktliste = document.getElementById('punktliste');
const slettKnapp = document.getElementById('slett-alle');

// Lagrer punktene i nettleseren. localStorage kan bare lagre tekst,
// så vi gjør listen om til tekst med JSON.stringify.
function lagrePunkter() {
  localStorage.setItem('punkter', JSON.stringify(punkter));
}

// Tegner alle punktene på nytt, både på kartet og i listen.
function visPunkter() {
  // Fjern de gamle markørene fra kartet
  markorer.forEach(function (m) { m.remove(); });
  markorer = [];
  punktliste.innerHTML = '';

  punkter.forEach(function (punkt) {
    // Boble (popup) med navnet. setText gjør at navnet alltid vises som tekst.
    const popup = new maplibregl.Popup({ offset: 30 }).setText(punkt.navn);

    const markor = new maplibregl.Marker()
      .setLngLat([punkt.lng, punkt.lat])
      .addTo(kart);
    markorer.push(markor);

    // Klikk på markøren: under måling brukes punktet i målingen,
    // ellers vises navneboblen. stopPropagation hindrer at klikket
    // også blir et vanlig kartklikk (som ville lagt til et nytt punkt).
    markor.getElement().addEventListener('click', function (hendelse) {
      hendelse.stopPropagation();
      if (maler) {
        leggTilMalepunkt(markor.getLngLat());
      } else {
        popup.setLngLat(markor.getLngLat()).addTo(kart);
      }
    });

    // Lag et listeelement. textContent (ikke innerHTML) gjør at navnet
    // alltid vises som vanlig tekst, selv om noen skriver inn HTML-kode.
    const li = document.createElement('li');
    li.textContent = punkt.navn;

    // Klikk på navnet i listen: fly til punktet og åpne boblen.
    li.addEventListener('click', function () {
      kart.flyTo({ center: [punkt.lng, punkt.lat], zoom: 17 });
      popup.setLngLat(markor.getLngLat()).addTo(kart);
    });

    punktliste.appendChild(li);
  });
}

// "Slett alle"-knappen tømmer listen etter en bekreftelse.
slettKnapp.addEventListener('click', function () {
  if (confirm('Vil du slette alle punktene?')) {
    punkter = [];
    lagrePunkter();
    visPunkter();
  }
});

// 5. Klikk i kartet. Hva som skjer, avhenger av hva som er slått på:
//    måling → målepunkt, bygning → bygningsinfo, planlag → planinfo,
//    ellers → spør om navn og legg til et punkt.
kart.on('click', function (hendelse) {
  // hendelse.lngLat er stedet på bakken der brukeren klikket.
  if (maler) {
    leggTilMalepunkt(hendelse.lngLat);
    return;
  }

  // Klikket brukeren på en 3D-bygning? (visBygningsinfo ligger i bygninger.js)
  if (visBygningsinfo(hendelse)) {
    return;
  }

  if (visPlanerBoks.checked) {
    visPlaninfo(hendelse.lngLat);
    return;
  }

  const navn = prompt('Hva vil du kalle dette punktet?');

  // Avbryt hvis brukeren trykket "Avbryt" eller ikke skrev noe.
  if (!navn || navn.trim() === '') {
    return;
  }

  punkter.push({
    navn: navn.trim(),
    lat: hendelse.lngLat.lat,
    lng: hendelse.lngLat.lng
  });

  lagrePunkter();
  visPunkter();
});

// 6. Måleverktøy.
//    maler = true betyr at måling er slått på.
//    malepunkter er posisjonene vi har klikket på, i rekkefølge.
let maler = false;
let malepunkter = [];

const maalKnapp = document.getElementById('maal-knapp');
const nullstillKnapp = document.getElementById('nullstill-maal');
const avstandTekst = document.getElementById('avstand');

// Gjør meter om til lesbar tekst: under 1 km vises i meter, ellers i km.
function formaterAvstand(meter) {
  if (meter < 1000) {
    return Math.round(meter) + ' m';
  }
  return (meter / 1000).toFixed(2) + ' km';
}

// Tegner målelinjen på nytt. MapLibre tegner data i GeoJSON-format:
// en linje (LineString) gjennom alle punktene, og et punkt for hvert klikk.
function tegnMaling() {
  const koordinater = malepunkter.map(function (p) { return [p.lng, p.lat]; });
  const punktene = koordinater.map(function (k) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: k }, properties: {} };
  });
  const linjen = { type: 'Feature', geometry: { type: 'LineString', coordinates: koordinater }, properties: {} };
  kart.getSource('maling').setData({
    type: 'FeatureCollection',
    features: [linjen].concat(punktene)
  });
}

// Legger til et punkt i målingen og regner ut total avstand på nytt.
function leggTilMalepunkt(posisjon) {
  malepunkter.push(posisjon);
  tegnMaling();

  // Legg sammen avstanden mellom hvert punkt og det neste.
  // distanceTo() regner ut avstanden i meter langs jordoverflaten.
  let total = 0;
  for (let i = 1; i < malepunkter.length; i++) {
    total += malepunkter[i - 1].distanceTo(malepunkter[i]);
  }

  avstandTekst.textContent = 'Avstand: ' + formaterAvstand(total);
}

// Slå måling av og på.
maalKnapp.addEventListener('click', function () {
  maler = !maler; // ! snur true til false og omvendt
  maalKnapp.textContent = maler ? 'Stopp måling' : 'Start måling';
  maalKnapp.classList.toggle('aktiv', maler);
  kart.getCanvas().style.cursor = maler ? 'crosshair' : '';
});

// Fjern målelinjen og start på nytt.
nullstillKnapp.addEventListener('click', function () {
  malepunkter = [];
  tegnMaling();
  avstandTekst.textContent = 'Avstand: 0 m';
});

// 7. Planinformasjon med WMS GetFeatureInfo.
//    Vi spør plantjenesten: "hva ligger i denne pikselen av kartbildet?"
//    og får svar som JSON med egenskapene til planen der.

// Lenke til Trondheim kommunes kart over gjeldende reguleringsplaner.
// Kartet har ingen kjent lenke direkte til én plan, så vi viser planID
// ved siden av, slik at man kan søke den opp.
const TRONDHEIM_PLANKART = 'https://map.isy.no/?application=trondheim';

// Gjør tekst trygg å sette inn i HTML (så f.eks. "<" i et plannavn
// vises som tekst og ikke tolkes som kode).
function trygg(tekst) {
  const div = document.createElement('div');
  div.textContent = tekst == null ? '' : String(tekst);
  return div.innerHTML;
}

// "2011-06-16Z" -> "16.06.2011"
function formaterDato(dato) {
  if (!dato) {
    return 'Ukjent';
  }
  const deler = dato.slice(0, 10).split('-'); // ["2011", "06", "16"]
  return deler[2] + '.' + deler[1] + '.' + deler[0];
}

// Gjør grader om til meter i kartprojeksjonen Web Mercator (EPSG:3857),
// som er det plantjenesten bruker.
function tilMeter(lngLat) {
  const R = 6378137; // jordens radius i meter
  const x = R * lngLat.lng * Math.PI / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + lngLat.lat * Math.PI / 360));
  return { x: x, y: y };
}

// Lager nettadressen til GetFeatureInfo-forespørselen.
// Vi later som vi har et lite kartbilde på 101 × 101 piksler med klikket
// midt i (piksel 50, 50), og ber serveren fortelle hva som ligger der.
// Størrelsen på en piksel i meter følger zoomnivået, som i kartet.
function lagPlaninfoUrl(lngLat) {
  const midt = tilMeter(lngLat);
  const meterPerPiksel = 40075016.686 / (512 * Math.pow(2, kart.getZoom()));
  const halv = 50 * meterPerPiksel;

  const parametere = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: PLAN_LAG,
    QUERY_LAYERS: PLAN_LAG,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: [midt.x - halv, midt.y - halv, midt.x + halv, midt.y + halv].join(','),
    WIDTH: 101,
    HEIGHT: 101,
    I: 50,
    J: 50,
    INFO_FORMAT: 'application/json',
    FEATURE_COUNT: 20
  });

  return PLAN_WMS_URL + '?' + parametere.toString();
}

// Lager HTML-innholdet i popupen ut fra svaret fra serveren.
function lagPlaninfoHtml(objekter) {
  // Svaret inneholder to typer objekter:
  //  - RpOmråde: selve planen (navn, planID, datoer)
  //  - RpArealformålOmråde / RbFormålOmråde: hva arealet skal brukes til
  const planer = objekter.filter(function (o) {
    return o.properties.objekttypenavn === 'RpOmråde';
  });

  if (planer.length === 0) {
    return 'Ingen vedtatt reguleringsplan her.';
  }

  let html = '';
  planer.forEach(function (plan) {
    const p = plan.properties;
    const planId = p['arealplanId.planidentifikasjon'];

    // Finn arealformålene som hører til denne planen.
    // Nyere planer har koden i "arealformål", eldre planer i "reguleringsformål".
    const formal = [];
    objekter.forEach(function (o) {
      const e = o.properties;
      const kode = e['arealformål'] || e['reguleringsformål'];
      if (kode && e['arealplanId.planidentifikasjon'] === planId) {
        let tekst = AREALFORMAL[kode] || 'Kode ' + kode;
        if (e.feltbetegnelse) {
          tekst += ' (' + e.feltbetegnelse + ')';
        }
        if (!formal.includes(tekst)) {
          formal.push(tekst);
        }
      }
    });

    // Vedtaksdato: bruk dato for endelig vedtak, ellers ikrafttredelsesdato.
    const vedtatt = p.vedtakEndeligPlanDato || p.ikrafttredelsesdato;

    html += '<div class="planinfo">' +
      '<h3>' + trygg(p.plannavn || 'Uten navn') + '</h3>' +
      '<table>' +
      '<tr><th>PlanID</th><td>' + trygg(planId) + '</td></tr>' +
      '<tr><th>Arealformål</th><td>' + (formal.length ? formal.map(trygg).join('<br>') : 'Ukjent') + '</td></tr>' +
      '<tr><th>Vedtatt</th><td>' + formaterDato(vedtatt) + '</td></tr>' +
      '</table>';

    // Lenke til Trondheim kommunes plankart (kommunenummer 5001 = Trondheim).
    if (p['arealplanId.kommunenummer'] === '5001') {
      html += '<a href="' + TRONDHEIM_PLANKART + '" target="_blank" rel="noopener">' +
        'Åpne i Trondheim kommunes plankart</a> (søk etter ' + trygg(planId) + ')';
    }
    html += '</div>';
  });

  return html;
}

// Viser en popup der brukeren klikket, og fyller den med planinformasjon.
// "async" betyr at funksjonen kan vente på svar fra nettet med "await".
async function visPlaninfo(lngLat) {
  const popup = new maplibregl.Popup({ maxWidth: '320px' })
    .setLngLat(lngLat)
    .setHTML('Henter planinformasjon …')
    .addTo(kart);

  try {
    const svar = await fetch(lagPlaninfoUrl(lngLat));
    if (!svar.ok) {
      throw new Error('Serveren svarte med feilkode ' + svar.status);
    }
    const data = await svar.json();
    popup.setHTML(lagPlaninfoHtml(data.features || []));
  } catch (feil) {
    // Hit kommer vi hvis nettet er nede, serveren har feil, eller
    // nettleseren blokkerer svaret (CORS). Detaljer vises i konsollen (F12).
    console.error('Klarte ikke hente planinformasjon:', feil);
    popup.setHTML('Klarte ikke hente planinformasjon. Prøv igjen senere.');
  }
}

// 8. Når kartoppsettet er klart: legg til målelinjen og vis lagrede punkter.
narKartetErKlart(function () {
  // En tom GeoJSON-kilde som tegnMaling() fyller med linje og punkter.
  kart.addSource('maling', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  kart.addLayer({
    id: 'maling-linje',
    type: 'line',
    source: 'maling',
    paint: { 'line-color': 'red', 'line-width': 3, 'line-dasharray': [2, 2] }
  });
  kart.addLayer({
    id: 'maling-punkter',
    type: 'circle',
    source: 'maling',
    filter: ['==', ['geometry-type'], 'Point'], // bare punktene, ikke linjen
    paint: { 'circle-radius': 4, 'circle-color': 'white', 'circle-stroke-color': 'red', 'circle-stroke-width': 2 }
  });

  visPunkter();
});
