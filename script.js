// script.js: bestemmer hva siden GJØR (oppførsel og interaktivitet).

// 1. Lag kartet og sentrer det på Trondheim.
//    [63.4305, 10.3951] er breddegrad og lengdegrad, 13 er zoomnivå.
const kart = L.map('kart').setView([63.4305, 10.3951], 13);

// 2. Legg til kartbildene (fliser) fra OpenStreetMap.
//    OpenStreetMap krever at vi viser hvem som har laget kartet (attribution).
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsytere'
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

// 6. Vis punktene som allerede var lagret da siden ble åpnet.
visPunkter();
