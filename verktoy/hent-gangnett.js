// verktoy/hent-gangnett.js: lager data/gangnett.js fra OpenStreetMap.
//
// Kjøres fra kommandolinjen i prosjektmappa:  node verktoy/hent-gangnett.js
// (Du kan også bruke knappen «Hent gangnett på nytt» på gangtrafikksiden.)

const fs = require('fs');
const path = require('path');
const { lagGangnettSporring, overpassTilGangnett, lagGangnettFil } = require('../gangnett-henting.js');

async function main() {
  const svar = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(lagGangnettSporring()),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!svar.ok) {
    throw new Error('Overpass svarte med feilkode ' + svar.status);
  }
  const gangnett = overpassTilGangnett(await svar.json());
  const dato = new Date().toISOString().slice(0, 10);
  const fil = path.join(__dirname, '..', 'data', 'gangnett.js');
  fs.mkdirSync(path.dirname(fil), { recursive: true });
  fs.writeFileSync(fil, lagGangnettFil(gangnett, dato));
  console.log('Lagret ' + gangnett.features.length + ' stier og veier i ' + fil);
}

main().catch(function (feil) {
  console.error(feil);
  process.exit(1);
});
