// verktoy/hent-kartdata.js: lager kartdatafilene i mappa data/ fra OpenStreetMap:
//
//   data/bygninger.js  – bygningene på campus (3D-kartet)
//   data/gangnett.js   – gang- og sykkelnettet (gangtrafikksiden)
//   data/bussruter.js  – bussrutene i Trondheim (gangtrafikksiden)
//
// Kjøres automatisk av GitHub Action «Oppdater kartdata»
// (.github/workflows/oppdater-kartdata.yml), eller fra kommandolinjen:
//   node verktoy/hent-kartdata.js
//
// Hver fil hentes for seg. Feiler én, beholdes den gamle fila.

const fs = require('fs');
const path = require('path');
const kd = require('../kartdata-henting.js');

const dato = new Date().toISOString().slice(0, 10);
const mappe = path.join(__dirname, '..', 'data');

const filer = [
  {
    navn: 'bygninger.js',
    hent: kd.hentBygninger,
    lagFil: kd.lagBygningerFil,
    beskriv: function (d) { return d.elements.length + ' bygninger'; }
  },
  {
    navn: 'gangnett.js',
    hent: kd.hentGangnett,
    lagFil: kd.lagGangnettFil,
    beskriv: function (d) { return d.features.length + ' stier og veier'; }
  },
  {
    navn: 'bussruter.js',
    hent: kd.hentBussruter,
    lagFil: kd.lagBussruterFil,
    beskriv: function (d) { return d.linjer.length + ' bussruter'; }
  }
];

async function main() {
  fs.mkdirSync(mappe, { recursive: true });
  let feilet = 0;
  for (const fil of filer) {
    try {
      const data = await fil.hent(function (tekst) { console.log('  ' + tekst); });
      fs.writeFileSync(path.join(mappe, fil.navn), fil.lagFil(data, dato));
      console.log('Lagret ' + fil.beskriv(data) + ' i data/' + fil.navn);
    } catch (feil) {
      feilet++;
      console.error('Klarte ikke hente data/' + fil.navn + ' (beholder den gamle): ' + feil.message);
    }
    // Litt pause mellom spørringene, så vi ikke belaster Overpass unødig.
    await new Promise(function (ferdig) { setTimeout(ferdig, 5000); });
  }
  if (feilet === filer.length) {
    process.exit(1); // alt feilet: marker kjøringen som mislykket
  }
}

main();
