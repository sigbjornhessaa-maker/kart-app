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

// Legg til en bryter oppe til høyre i kartet, der man kan velge kartlag.
// Teksten til venstre er det som vises i menyen.
L.control.layers({
  'Gatekart': gatekart,
  'Topografisk': topokart,
  'Satellitt': satellitt
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

// 7. Vis punktene som allerede var lagret da siden ble åpnet.
visPunkter();
