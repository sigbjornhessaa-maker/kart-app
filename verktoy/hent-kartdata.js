// verktoy/hent-kartdata.js: lager data/gangnett.js og data/bussruter.js fra OpenStreetMap.
//
// Kjøres fra kommandolinjen i prosjektmappa:  node verktoy/hent-kartdata.js
// (Du kan også bruke knappene «Hent ... på nytt» på gangtrafikksiden.)

const fs = require('fs');
const path = require('path');
const { hentGangnett, hentBussruter, lagGangnettFil, lagBussruterFil } = require('../kartdata-henting.js');

async function main() {
  const dato = new Date().toISOString().slice(0, 10);
  const mappe = path.join(__dirname, '..', 'data');
  fs.mkdirSync(mappe, { recursive: true });

  const gangnett = await hentGangnett();
  fs.writeFileSync(path.join(mappe, 'gangnett.js'), lagGangnettFil(gangnett, dato));
  console.log('Lagret ' + gangnett.features.length + ' stier og veier i data/gangnett.js');

  const bussruter = await hentBussruter();
  fs.writeFileSync(path.join(mappe, 'bussruter.js'), lagBussruterFil(bussruter, dato));
  console.log('Lagret ' + bussruter.linjer.length + ' bussruter i data/bussruter.js');
}

main().catch(function (feil) {
  console.error(feil);
  process.exit(1);
});
