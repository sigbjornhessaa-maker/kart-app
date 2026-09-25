// script.js: bestemmer hva siden GJØR (oppførsel og interaktivitet).

// 1. Lag kartet og sentrer det på Trondheim.
//    [63.4305, 10.3951] er breddegrad og lengdegrad, 13 er zoomnivå.
const kart = L.map('kart').setView([63.4305, 10.3951], 13);

// 2. Kartlag. Hvert lag er en samling kartbilder (fliser) fra en kartleverandør.
//    {z} er zoomnivå, {x} og {y} er hvilken flis. Hver leverandør krever at vi
//    viser hvem som har laget kartet (attribution).

// Vanlig gatekart fra OpenStreetMap
const gatekart = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsytere'
});

// Topografisk kart fra Kartverket (viser terreng, høydekurver, stier)
const topokart = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
});

// Satellittbilder fra Esri
const satellitt = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Bilder &copy; Esri'
});

// Vis gatekartet når siden åpnes
gatekart.addTo(kart);

// Reguleringsplaner fra Direktoratet for byggkvalitet (DiBK).
// Dette er et WMS-lag: Leaflet ber serveren tegne ferdige bilder av planene
// for utsnittet vi ser på. transparent: true gjør at bakgrunnskartet synes gjennom.
// "vn2" betyr vertikalnivå 2, altså planer på bakkenivå (ikke tunneler og bruer).
const PLAN_WMS_URL = 'https://nap.ft.dibk.no/services/wms/reguleringsplaner';
const PLAN_LAG = 'arealformal_vn2,rpomrade_vn2'; // arealformål først, planområde-grensen oppå

const planlag = L.tileLayer.wms(PLAN_WMS_URL, {
  layers: PLAN_LAG,
  format: 'image/png',
  transparent: true,
  version: '1.3.0',
  opacity: 0.6,
  maxZoom: 19,
  attribution: 'Planer &copy; <a href="https://www.dibk.no/">DiBK</a>'
});

// Legg til en bryter oppe til høyre i kartet, der man kan velge kartlag.
// Den første gruppen er bakgrunnskart (bare ett av gangen).
// Den andre gruppen er lag som kan slås av og på oppå bakgrunnskartet.
L.control.layers({
  'Gatekart': gatekart,
  'Topografisk': topokart,
  'Satellitt': satellitt
}, {
  'Reguleringsplaner': planlag
}).addTo(kart);

// 3. Her lagrer vi punktene. Hvert punkt er et objekt: { navn, lat, lng }.
//    Vi henter tidligere lagrede punkter fra nettleseren (localStorage),
//    slik at de ikke forsvinner når du laster siden på nytt.
let punkter = JSON.parse(localStorage.getItem('punkter') || '[]');

// Hent listen og knappen fra HTML-en, slik at vi kan endre dem.
const punktliste = document.getElementById('punktliste');
const slettKnapp = document.getElementById('slett-alle');

// En egen "gruppe" for markørene, så vi enkelt kan fjerne alle samtidig.
const markorLag = L.layerGroup().addTo(kart);

// Lagrer punktene i nettleseren. localStorage kan bare lagre tekst,
// så vi gjør listen om til tekst med JSON.stringify.
function lagrePunkter() {
  localStorage.setItem('punkter', JSON.stringify(punkter));
}

// Tegner alle punktene på nytt, både på kartet og i listen.
function visPunkter() {
  markorLag.clearLayers();
  punktliste.innerHTML = '';

  punkter.forEach(function (punkt) {
    // Lag en markør på kartet med en boble (popup) som viser navnet.
    const markor = L.marker([punkt.lat, punkt.lng])
      .bindPopup(punkt.navn)
      .addTo(markorLag);

    // Klikk på markøren mens vi måler: bruk punktet i målingen
    // i stedet for å vise navneboblen.
    markor.on('click', function () {
      if (maler) {
        markor.closePopup();
        leggTilMalepunkt(markor.getLatLng());
      }
    });

    // Lag et listeelement. textContent (ikke innerHTML) gjør at navnet
    // alltid vises som vanlig tekst, selv om noen skriver inn HTML-kode.
    const li = document.createElement('li');
    li.textContent = punkt.navn;

    // Klikk på navnet i listen: fly til punktet og åpne boblen.
    li.addEventListener('click', function () {
      kart.setView([punkt.lat, punkt.lng], 16);
      markor.openPopup();
    });

    punktliste.appendChild(li);
  });
}

// 4. Når brukeren klikker i kartet: spør om navn og legg til punktet.
kart.on('click', function (hendelse) {
  // Mens vi måler, skal klikk legge til målepunkter i stedet.
  if (maler) {
    leggTilMalepunkt(hendelse.latlng);
    return;
  }

  // Når reguleringsplan-laget er slått på, viser klikk planinformasjon.
  if (kart.hasLayer(planlag)) {
    visPlaninfo(hendelse.latlng);
    return;
  }

  const navn = prompt('Hva vil du kalle dette punktet?');

  // Avbryt hvis brukeren trykket "Avbryt" eller ikke skrev noe.
  if (!navn || navn.trim() === '') {
    return;
  }

  punkter.push({
    navn: navn.trim(),
    lat: hendelse.latlng.lat,
    lng: hendelse.latlng.lng
  });

  lagrePunkter();
  visPunkter();
});

// 5. "Slett alle"-knappen tømmer listen etter en bekreftelse.
slettKnapp.addEventListener('click', function () {
  if (confirm('Vil du slette alle punktene?')) {
    punkter = [];
    lagrePunkter();
    visPunkter();
  }
});

// 6. Måleverktøy.
//    maler = true betyr at måling er slått på.
//    malepunkter er posisjonene vi har klikket på, i rekkefølge.
let maler = false;
let malepunkter = [];

// En strek (polyline) som tegner linjen mellom målepunktene.
const malelinje = L.polyline([], { color: 'red', weight: 3, dashArray: '6 6' }).addTo(kart);

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

// Legger til et punkt i målingen og regner ut total avstand på nytt.
function leggTilMalepunkt(posisjon) {
  malepunkter.push(posisjon);
  malelinje.setLatLngs(malepunkter);

  // Legg sammen avstanden mellom hvert punkt og det neste.
  // kart.distance() regner ut avstanden i meter langs jordoverflaten.
  let total = 0;
  for (let i = 1; i < malepunkter.length; i++) {
    total += kart.distance(malepunkter[i - 1], malepunkter[i]);
  }

  avstandTekst.textContent = 'Avstand: ' + formaterAvstand(total);
}

// Slå måling av og på.
maalKnapp.addEventListener('click', function () {
  maler = !maler; // ! snur true til false og omvendt
  maalKnapp.textContent = maler ? 'Stopp måling' : 'Start måling';
  maalKnapp.classList.toggle('aktiv', maler);
  document.getElementById('kart').classList.toggle('maler', maler);
});

// Fjern målelinjen og start på nytt.
nullstillKnapp.addEventListener('click', function () {
  malepunkter = [];
  malelinje.setLatLngs([]);
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

// Lager nettadressen til GetFeatureInfo-forespørselen.
// Serveren trenger å vite hvilket kartutsnitt vi ser på (BBOX), hvor stort
// bildet er i piksler (WIDTH/HEIGHT), og hvilken piksel vi klikket på (I/J).
function lagPlaninfoUrl(latlng) {
  const storrelse = kart.getSize();
  const piksel = kart.latLngToContainerPoint(latlng).round();

  // Gjør kartutsnittets hjørner om fra grader til meter (EPSG:3857).
  const utsnitt = kart.getBounds();
  const sorvest = kart.options.crs.project(utsnitt.getSouthWest());
  const nordost = kart.options.crs.project(utsnitt.getNorthEast());

  const parametere = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: PLAN_LAG,
    QUERY_LAYERS: PLAN_LAG,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: [sorvest.x, sorvest.y, nordost.x, nordost.y].join(','),
    WIDTH: storrelse.x,
    HEIGHT: storrelse.y,
    I: piksel.x,
    J: piksel.y,
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
async function visPlaninfo(latlng) {
  const popup = L.popup({ maxWidth: 320 })
    .setLatLng(latlng)
    .setContent('Henter planinformasjon …')
    .openOn(kart);

  try {
    const svar = await fetch(lagPlaninfoUrl(latlng));
    if (!svar.ok) {
      throw new Error('Serveren svarte med feilkode ' + svar.status);
    }
    const data = await svar.json();
    popup.setContent(lagPlaninfoHtml(data.features || []));
  } catch (feil) {
    // Hit kommer vi hvis nettet er nede, serveren har feil, eller
    // nettleseren blokkerer svaret (CORS). Detaljer vises i konsollen (F12).
    console.error('Klarte ikke hente planinformasjon:', feil);
    popup.setContent('Klarte ikke hente planinformasjon. Prøv igjen senere.');
  }
}

// 8. Vis punktene som allerede var lagret da siden ble åpnet.
visPunkter();
