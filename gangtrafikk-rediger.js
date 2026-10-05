// gangtrafikk-rediger.js: redigeringsmodus for gangtrafikkscenarioet.
//
// Her kan du flytte og endre startpunkter, mål og snarveier, dra i søyler
// for antall per time og justere reisemåtene med glidebrytere. Kartet
// regnes ut på nytt med en gang. Når du er fornøyd, trykker du «Kopier kode»
// og limer teksten inn i gangtrafikk-data.js på GitHub.
//
// Mens du jobber, lagres et utkast i nettleseren (localStorage).

// ---------- Tilstand ----------

let redigererScenario = false; // brukes også av gangtrafikk.js
let valgt = null;              // { type: 'start' | 'mal' | 'snarvei', indeks }
let verktoy = null;            // 'start' | 'mal' | 'snarvei' når vi lager noe nytt
let snarveiPunkter = [];       // punktene i snarveien vi tegner
let draPunkt = null;           // punktet vi drar i

const SCENARIO_UTKAST = 'gangtrafikk-utkast';

const scenarioKnapp = document.getElementById('scenario-knapp');
const scenarioPanel = document.getElementById('scenario-panel');
const scenarioStatus = document.getElementById('scenario-status');
const scenarioUtkast = document.getElementById('scenario-utkast');
const nyttStartKnapp = document.getElementById('nytt-start-knapp');
const nyttMalKnapp = document.getElementById('nytt-mal-knapp');
const nySnarveiKnapp = document.getElementById('ny-snarvei-knapp');
const startSkjema = document.getElementById('start-skjema');
const malSkjema = document.getElementById('mal-skjema');
const snarveiSkjema = document.getElementById('snarvei-skjema');
const startNavn = document.getElementById('start-navn');
const malNavn = document.getElementById('mal-navn');
const snarveiNavn = document.getElementById('snarvei-navn');
const reisemiddelGlidere = document.querySelectorAll('.reisemiddel input[type="range"]');
const scenarioKode = document.getElementById('scenario-kode');

// ---------- Utkast ----------

function scenarioData() {
  return { startpunkter: DATA.startpunkter, mal: DATA.mal, snarveier: DATA.snarveier };
}

// Kopi av dataene slik de står i gangtrafikk-data.js.
const SCENARIO_FIL = JSON.parse(JSON.stringify(scenarioData()));

// "Standardform" for å sammenligne uten at rekkefølge på felt eller små
// avrundinger teller med.
function scenarioStandard(d) {
  function timer(o) {
    const r = {};
    for (let t = 0; t < 24; t++) {
      if (o && o[t]) {
        r[t] = Number(o[t]);
      }
    }
    return r;
  }
  function pos(p) {
    return [Number(p[0]).toFixed(6), Number(p[1]).toFixed(6)];
  }
  return JSON.stringify({
    s: d.startpunkter.map(function (s) {
      const r = s.reisemiddel || {};
      return [s.navn, pos(s.posisjon), timer(s.personer), REISEMIDLER.map(function (m) { return Number(r[m]) || 0; })];
    }),
    m: d.mal.map(function (m) { return [m.navn, pos(m.posisjon), timer(m.vekt)]; }),
    v: d.snarveier.map(function (v) { return [v.navn, (v.linje || []).map(pos)]; })
  });
}

function scenarioErLikFila() {
  return scenarioStandard(scenarioData()) === scenarioStandard(SCENARIO_FIL);
}

function lagreScenario() {
  try {
    if (scenarioErLikFila()) {
      localStorage.removeItem(SCENARIO_UTKAST);
    } else {
      localStorage.setItem(SCENARIO_UTKAST, JSON.stringify(scenarioData()));
    }
  } catch (feil) {
    // Lagring er ikke tillatt (f.eks. privat modus). Da går det fint uten.
  }
  scenarioUtkast.hidden = scenarioErLikFila();
}

// Ta i bruk utkastet fra forrige gang. Kjøres før kartet regnes ut første gang.
(function hentScenarioUtkast() {
  let utkast = null;
  try {
    utkast = JSON.parse(localStorage.getItem(SCENARIO_UTKAST));
  } catch (feil) {
    utkast = null;
  }
  if (!utkast || !utkast.startpunkter) {
    return;
  }
  utkast.snarveier = utkast.snarveier || [];
  if (scenarioStandard(utkast) === scenarioStandard(SCENARIO_FIL)) {
    localStorage.removeItem(SCENARIO_UTKAST); // allerede lagt inn i fila
    return;
  }
  DATA.startpunkter = utkast.startpunkter;
  DATA.mal = utkast.mal;
  DATA.snarveier = utkast.snarveier;
  scenarioUtkast.hidden = false;
})();

// ---------- Endringer: regn ut på nytt og lagre ----------

// hva: 'alt' (snarveier endret), 'mal', 'start' eller 'tall'
function endret(hva) {
  oppdaterModell(hva);
  tegnPaNytt();
  oppdaterValgtLag();
  lagreScenario();
}

// ---------- Søyleredigerer for timetall ----------

// Lager en redigerer med 24 søyler (én per time). Dra opp og ned i søylene
// med mus eller finger, eller skriv tallet for én time.
//   element  – der redigereren skal stå
//   tittel   – f.eks. 'Personer per time'
//   steg     – tallene rundes av til nærmeste steg (f.eks. 5 personer)
function Soyleredigerer(element, tittel, steg) {
  element.innerHTML =
    '<div class="soyle-topp"><strong>' + tittel + '</strong>' +
    '<label>Skala til <input type="number" class="soyle-maks" min="1" step="' + steg + '"></label></div>' +
    '<div class="soyle-felt" title="Dra opp og ned for å endre tallene"></div>' +
    '<div class="dognprofil-akse"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>' +
    '<div class="soyle-rad">' +
    '<span class="soyle-time"></span>' +
    '<input type="number" class="soyle-verdi" min="0" step="' + steg + '" aria-label="Verdi for valgt time">' +
    '<button type="button" data-faktor="0.8" title="Alle timer 20 % lavere">−20 %</button>' +
    '<button type="button" data-faktor="1.2" title="Alle timer 20 % høyere">+20 %</button>' +
    '</div>';

  const felt = element.querySelector('.soyle-felt');
  const maksFelt = element.querySelector('.soyle-maks');
  const verdiFelt = element.querySelector('.soyle-verdi');
  const timeEtikett = element.querySelector('.soyle-time');
  const soyler = [];
  for (let t = 0; t < 24; t++) {
    const s = document.createElement('div');
    s.className = 'soyle';
    felt.appendChild(s);
    soyler.push(s);
  }

  let verdier = {};          // objektet vi redigerer, { time: verdi }
  let vedEndring = null;     // kalles med (ferdig, time) når noe endres
  let valgtTime = 8;
  let maks = 100;
  let drar = false;

  function verdi(t) {
    return Number(verdier[t]) || 0;
  }

  function tegn() {
    for (let t = 0; t < 24; t++) {
      soyler[t].style.height = Math.min(100, 100 * verdi(t) / maks) + '%';
      soyler[t].classList.toggle('valgt', t === valgtTime);
      soyler[t].title = String(t).padStart(2, '0') + ':00: ' + verdi(t);
    }
    timeEtikett.textContent = 'Kl. ' + String(valgtTime).padStart(2, '0') + ':';
    verdiFelt.value = verdi(valgtTime);
    maksFelt.value = maks;
  }

  function sett(t, v) {
    v = Math.max(0, Math.round(v / steg) * steg);
    if (v > 0) {
      verdier[t] = v;
    } else {
      delete verdier[t]; // timer med 0 tas ikke med i fila
    }
  }

  // Finn time og verdi ut fra hvor i feltet musa/fingeren er.
  function fraPeker(hendelse) {
    const r = felt.getBoundingClientRect();
    const t = Math.max(0, Math.min(23, Math.floor((hendelse.clientX - r.left) / r.width * 24)));
    const andel = 1 - (hendelse.clientY - r.top) / r.height;
    valgtTime = t;
    sett(t, Math.max(0, Math.min(1, andel)) * maks);
    tegn();
    vedEndring(false, t);
  }

  felt.addEventListener('pointerdown', function (hendelse) {
    drar = true;
    felt.setPointerCapture(hendelse.pointerId);
    fraPeker(hendelse);
  });
  felt.addEventListener('pointermove', function (hendelse) {
    if (drar) {
      fraPeker(hendelse);
    }
  });
  felt.addEventListener('pointerup', function () {
    if (drar) {
      drar = false;
      vedEndring(true, valgtTime);
    }
  });

  verdiFelt.addEventListener('change', function () {
    sett(valgtTime, Number(verdiFelt.value) || 0);
    if (verdi(valgtTime) > maks) {
      maks = verdi(valgtTime);
    }
    tegn();
    vedEndring(true, valgtTime);
  });

  maksFelt.addEventListener('change', function () {
    maks = Math.max(steg, Number(maksFelt.value) || maks);
    tegn();
  });

  element.querySelectorAll('[data-faktor]').forEach(function (knapp) {
    knapp.addEventListener('click', function () {
      const faktor = Number(knapp.dataset.faktor);
      for (let t = 0; t < 24; t++) {
        if (verdi(t)) {
          sett(t, verdi(t) * faktor);
        }
      }
      tegn();
      vedEndring(true, valgtTime);
    });
  });

  // Vis et nytt objekt i redigereren.
  this.vis = function (objekt, time, endring) {
    verdier = objekt;
    vedEndring = endring;
    valgtTime = time;
    let storst = 0;
    for (let t = 0; t < 24; t++) {
      storst = Math.max(storst, verdi(t));
    }
    // Skala med litt luft over den høyeste søylen, rundet til et pent tall.
    maks = Math.max(steg * 4, Math.ceil(storst * 1.25 / (steg * 4)) * steg * 4);
    tegn();
  };

  this.velgTime = function (time) {
    valgtTime = time;
    tegn();
  };
}

const startSoyler = new Soyleredigerer(document.getElementById('start-soyler'), 'Personer per time', 5);
const malSoyler = new Soyleredigerer(document.getElementById('mal-soyler'), 'Vekt per time', 1);

// ---------- Skjemaene ----------

function visSkjema() {
  startSkjema.hidden = !(valgt && valgt.type === 'start');
  malSkjema.hidden = !(valgt && valgt.type === 'mal');
  snarveiSkjema.hidden = !(valgt && valgt.type === 'snarvei');
  const time = Number(timeSlider.value);

  if (valgt && valgt.type === 'start') {
    const s = DATA.startpunkter[valgt.indeks];
    startNavn.value = s.navn || '';
    s.reisemiddel = s.reisemiddel || { gange: 100 };
    reisemiddelGlidere.forEach(function (g) {
      g.value = Number(s.reisemiddel[g.dataset.modus]) || 0;
    });
    visAndeler();
    s.personer = s.personer || {};
    startSoyler.vis(s.personer, time, timeEndret);
  }
  if (valgt && valgt.type === 'mal') {
    const m = DATA.mal[valgt.indeks];
    malNavn.value = m.navn || '';
    m.vekt = m.vekt || {};
    malSoyler.vis(m.vekt, time, timeEndret);
  }
  if (valgt && valgt.type === 'snarvei') {
    snarveiNavn.value = DATA.snarveier[valgt.indeks].navn || '';
  }
}

// Når en søyle endres, viser kartet timen du redigerer. Når du slipper,
// regnes fargeskalaen for hele døgnet ut på nytt.
function timeEndret(ferdig, time) {
  if (ferdig) {
    timeSlider.value = time;
    endret('tall');
  } else {
    visTime(time);
  }
}

// Når du flytter tidsslideren, følger søyleredigereren med.
timeSlider.addEventListener('input', function () {
  if (valgt && valgt.type === 'start') {
    startSoyler.velgTime(Number(timeSlider.value));
  } else if (valgt && valgt.type === 'mal') {
    malSoyler.velgTime(Number(timeSlider.value));
  }
});

// Viser prosentene ved glidebryterne (regnet om så de summerer til 100).
function visAndeler() {
  const s = DATA.startpunkter[valgt.indeks];
  const a = andeler(s);
  reisemiddelGlidere.forEach(function (g) {
    g.nextElementSibling.textContent = Math.round(a[g.dataset.modus] * 100) + ' %';
  });
}

reisemiddelGlidere.forEach(function (g) {
  g.addEventListener('input', function () {
    const s = DATA.startpunkter[valgt.indeks];
    s.reisemiddel[g.dataset.modus] = Number(g.value);
    visAndeler();
    tegnPaNytt();
  });
  g.addEventListener('change', function () {
    endret('tall');
  });
});

startNavn.addEventListener('input', function () {
  DATA.startpunkter[valgt.indeks].navn = startNavn.value;
  tegnPaNytt();
  lagreScenario();
});
malNavn.addEventListener('input', function () {
  DATA.mal[valgt.indeks].navn = malNavn.value;
  tegnPaNytt();
  lagreScenario();
});
snarveiNavn.addEventListener('input', function () {
  DATA.snarveier[valgt.indeks].navn = snarveiNavn.value;
  tegnPaNytt();
  lagreScenario();
});

document.getElementById('slett-start').addEventListener('click', function () {
  const s = DATA.startpunkter[valgt.indeks];
  if (confirm('Vil du slette startpunktet «' + s.navn + '»?')) {
    DATA.startpunkter.splice(valgt.indeks, 1);
    velg(null);
    endret('start');
  }
});
document.getElementById('slett-mal').addEventListener('click', function () {
  const m = DATA.mal[valgt.indeks];
  if (confirm('Vil du slette målet «' + m.navn + '»?')) {
    DATA.mal.splice(valgt.indeks, 1);
    velg(null);
    endret('mal');
  }
});
document.getElementById('slett-snarvei').addEventListener('click', function () {
  const v = DATA.snarveier[valgt.indeks];
  if (confirm('Vil du slette snarveien «' + v.navn + '»?')) {
    DATA.snarveier.splice(valgt.indeks, 1);
    velg(null);
    scenarioStatus.textContent = 'Regner ut på nytt …';
    setTimeout(function () { endret('alt'); scenarioStatus.textContent = ''; }, 20);
  }
});

// ---------- Velge og lage nye ting ----------

function velg(ny) {
  valgt = ny;
  visSkjema();
  oppdaterValgtLag();
}

function settVerktoy(nytt) {
  verktoy = nytt;
  snarveiPunkter = [];
  tegnSnarveiUtkast(null);
  nyttStartKnapp.classList.toggle('aktiv', nytt === 'start');
  nyttMalKnapp.classList.toggle('aktiv', nytt === 'mal');
  nySnarveiKnapp.classList.toggle('aktiv', nytt === 'snarvei');
  nySnarveiKnapp.textContent = nytt === 'snarvei' ? 'Ferdig tegnet' : 'Tegn snarvei';
  kart.getCanvas().style.cursor = nytt ? 'crosshair' : '';
  scenarioStatus.textContent = {
    start: 'Klikk i kartet der det nye startpunktet skal ligge.',
    mal: 'Klikk i kartet der det nye målet skal ligge (helst ved inngangen).',
    snarvei: 'Klikk punktene langs snarveien. Start og slutt nær en sti, så kobles den til nettet. ' +
      'Klikk på det siste punktet igjen eller «Ferdig tegnet» for å avslutte. Esc avbryter.'
  }[nytt] || '';
}

nyttStartKnapp.addEventListener('click', function () { settVerktoy(verktoy === 'start' ? null : 'start'); });
nyttMalKnapp.addEventListener('click', function () { settVerktoy(verktoy === 'mal' ? null : 'mal'); });
nySnarveiKnapp.addEventListener('click', function () {
  if (verktoy === 'snarvei') {
    avsluttSnarvei();
  } else {
    settVerktoy('snarvei');
  }
});

document.addEventListener('keydown', function (hendelse) {
  if (hendelse.key === 'Escape' && verktoy) {
    settVerktoy(null);
  } else if (hendelse.key === 'Enter' && verktoy === 'snarvei') {
    avsluttSnarvei();
  }
});

function avsluttSnarvei() {
  if (snarveiPunkter.length >= 2) {
    DATA.snarveier.push({ navn: 'Ny snarvei', linje: snarveiPunkter });
    const indeks = DATA.snarveier.length - 1;
    settVerktoy(null);
    scenarioStatus.textContent = 'Regner ut på nytt …';
    setTimeout(function () {
      endret('alt');
      velg({ type: 'snarvei', indeks: indeks });
      scenarioStatus.textContent = 'Snarveien er lagt til. Gi den et navn.';
      snarveiNavn.focus();
      snarveiNavn.select();
    }, 20);
  } else {
    settVerktoy(null);
    scenarioStatus.textContent = 'En snarvei må ha minst to punkter.';
  }
}

function tegnSnarveiUtkast(musepunkt) {
  const kilde = kart.getSource('snarvei-utkast');
  if (!kilde) {
    return;
  }
  const punkter = musepunkt ? snarveiPunkter.concat([musepunkt]) : snarveiPunkter;
  kilde.setData({
    type: 'FeatureCollection',
    features: punkter.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: punkter } }] : []
  });
}

kart.on('mousemove', function (hendelse) {
  if (verktoy === 'snarvei' && snarveiPunkter.length) {
    tegnSnarveiUtkast([hendelse.lngLat.lng, hendelse.lngLat.lat]);
  }
});

function avrund6(lngLat) {
  return [Number(lngLat.lng.toFixed(6)), Number(lngLat.lat.toFixed(6))];
}

kart.on('click', function (hendelse) {
  if (!redigererScenario || draPunkt) {
    return;
  }
  const punkt = avrund6(hendelse.lngLat);
  const time = Number(timeSlider.value);

  if (verktoy === 'start') {
    const personer = {};
    personer[time] = 100;
    DATA.startpunkter.push({
      navn: 'Nytt startpunkt',
      posisjon: punkt,
      personer: personer,
      reisemiddel: { gange: 50, sykkel: 20, buss: 20, sparkesykkel: 10 }
    });
    settVerktoy(null);
    endret('start');
    velg({ type: 'start', indeks: DATA.startpunkter.length - 1 });
    startNavn.focus();
    startNavn.select();
    scenarioStatus.textContent = 'Startpunktet er lagt til. Gi det et navn, juster reisemåtene og dra i søylene.';
    return;
  }
  if (verktoy === 'mal') {
    const vekt = {};
    vekt[time] = 5;
    DATA.mal.push({ navn: 'Nytt mål', posisjon: punkt, vekt: vekt });
    settVerktoy(null);
    scenarioStatus.textContent = 'Regner ut på nytt …';
    setTimeout(function () {
      endret('mal');
      velg({ type: 'mal', indeks: DATA.mal.length - 1 });
      malNavn.focus();
      malNavn.select();
      scenarioStatus.textContent = 'Målet er lagt til. Gi det et navn og dra i søylene.';
    }, 20);
    return;
  }
  if (verktoy === 'snarvei') {
    // Klikk på det siste punktet igjen avslutter snarveien.
    if (snarveiPunkter.length >= 2) {
      const siste = kart.project(snarveiPunkter[snarveiPunkter.length - 1]);
      if (siste.dist(hendelse.point) < 10) {
        avsluttSnarvei();
        return;
      }
    }
    snarveiPunkter.push(punkt);
    tegnSnarveiUtkast(null);
    return;
  }

  // Velg det du klikket på
  const treff = kart.queryRenderedFeatures(hendelse.point, { layers: ['starter', 'mal', 'snarveier'] });
  if (treff.length) {
    const type = { starter: 'start', mal: 'mal', snarveier: 'snarvei' }[treff[0].layer.id];
    velg({ type: type, indeks: treff[0].properties.indeks });
    scenarioStatus.textContent = type === 'snarvei' ? '' : 'Dra i punktet for å flytte det.';
  } else {
    velg(null);
    scenarioStatus.textContent = '';
  }
});

// ---------- Dra i punkter ----------

function startDraPunkt(hendelse) {
  if (!redigererScenario || verktoy || !valgt || valgt.type === 'snarvei') {
    return;
  }
  if (hendelse.points && hendelse.points.length !== 1) {
    return;
  }
  const lag = valgt.type === 'start' ? 'starter' : 'mal';
  const treff = kart.queryRenderedFeatures(hendelse.point, { layers: [lag] });
  if (!treff.some(function (f) { return f.properties.indeks === valgt.indeks; })) {
    return; // bare det valgte punktet kan dras
  }
  hendelse.preventDefault(); // ikke panorer kartet mens vi drar
  draPunkt = { type: valgt.type, indeks: valgt.indeks };
  kart.getCanvas().style.cursor = 'grabbing';
  const erTouch = hendelse.type === 'touchstart';
  kart.on(erTouch ? 'touchmove' : 'mousemove', underDraPunkt);
  kart.once(erTouch ? 'touchend' : 'mouseup', sluttDraPunkt);
}

function underDraPunkt(hendelse) {
  const liste = draPunkt.type === 'start' ? DATA.startpunkter : DATA.mal;
  liste[draPunkt.indeks].posisjon = avrund6(hendelse.lngLat);
  // Flytt bare punktet mens vi drar; resten regnes ut når vi slipper.
  if (draPunkt.type === 'start') {
    kart.getSource('starter').setData(startpunktData(Number(timeSlider.value)));
  } else {
    kart.getSource('mal').setData(malData());
  }
  oppdaterValgtLag();
}

function sluttDraPunkt() {
  kart.off('mousemove', underDraPunkt);
  kart.off('touchmove', underDraPunkt);
  const type = draPunkt.type;
  kart.getCanvas().style.cursor = '';
  scenarioStatus.textContent = 'Regner ut på nytt …';
  setTimeout(function () {
    endret(type === 'start' ? 'start' : 'mal');
    scenarioStatus.textContent = '';
    // Vent litt før nye klikk teller, så slippet ikke blir et klikk.
    setTimeout(function () { draPunkt = null; }, 50);
  }, 20);
}

// Ring rundt det valgte punktet, og tykkere strek på valgt snarvei.
function oppdaterValgtLag() {
  const kilde = kart.getSource('valgt');
  if (!kilde) {
    return;
  }
  const features = [];
  if (redigererScenario && valgt) {
    if (valgt.type === 'start' && DATA.startpunkter[valgt.indeks]) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: DATA.startpunkter[valgt.indeks].posisjon } });
    } else if (valgt.type === 'mal' && DATA.mal[valgt.indeks]) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: DATA.mal[valgt.indeks].posisjon } });
    } else if (valgt.type === 'snarvei' && DATA.snarveier[valgt.indeks]) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: DATA.snarveier[valgt.indeks].linje } });
    }
  }
  kilde.setData({ type: 'FeatureCollection', features: features });
}

// ---------- Kopiere og laste ned koden ----------

function tekstverdi(tekst) {
  return "'" + String(tekst).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ') + "'";
}

function posisjonTekst(p) {
  return '[' + Number(p[0]).toFixed(6) + ', ' + Number(p[1]).toFixed(6) + ']';
}

function timerTekst(o) {
  const deler = [];
  for (let t = 0; t < 24; t++) {
    if (o && Number(o[t])) {
      deler.push(t + ': ' + Number(o[t]));
    }
  }
  return '{ ' + deler.join(', ') + ' }';
}

function lagScenarioFil() {
  const starter = DATA.startpunkter.map(function (s) {
    const r = s.reisemiddel || {};
    return '    {\n' +
      '      navn: ' + tekstverdi(s.navn || 'Startpunkt') + ',\n' +
      '      posisjon: ' + posisjonTekst(s.posisjon) + ',\n' +
      '      personer: ' + timerTekst(s.personer) + ',\n' +
      '      reisemiddel: { ' + REISEMIDLER.map(function (m) { return m + ': ' + (Number(r[m]) || 0); }).join(', ') + ' }\n' +
      '    }';
  });
  const mal = DATA.mal.map(function (m) {
    return '    {\n' +
      '      navn: ' + tekstverdi(m.navn || 'Mål') + ',\n' +
      '      posisjon: ' + posisjonTekst(m.posisjon) + ',\n' +
      '      vekt: ' + timerTekst(m.vekt) + '\n' +
      '    }';
  });
  const snarveier = DATA.snarveier.map(function (v) {
    return '    {\n' +
      '      navn: ' + tekstverdi(v.navn || 'Snarvei') + ',\n' +
      '      linje: [' + (v.linje || []).map(posisjonTekst).join(', ') + ']\n' +
      '    }';
  });
  function liste(navn, elementer) {
    return '  ' + navn + ': [\n' + elementer.join(',\n') + (elementer.length ? '\n' : '') + '  ]';
  }
  return SCENARIO_TOPP +
    SCENARIO_START + liste('startpunkter', starter) + ',\n\n' +
    SCENARIO_MAL + liste('mal', mal) + ',\n\n' +
    SCENARIO_SNARVEI + liste('snarveier', snarveier) + '\n};\n';
}

// Forklaringene i gangtrafikk-data.js (kommer med når du kopierer koden).
const SCENARIO_TOPP = `// gangtrafikk-data.js: DIN datafil for gangtrafikk på campus.
//
// Enklest: bruk «Rediger scenario» på gangtrafikksiden, og trykk
// «Kopier kode». Lim så inn ALT her i stedet for det som står fra før.
//
// Slik regner kartet, for hver time:
//   1. Personene fra hvert startpunkt fordeles på reisemåter (reisemiddel).
//   2. Hver person skal til et mål. Et mål med høy vekt får en stor andel.
//   3. Gående, syklende og elsparkesykler tar korteste vei langs nettet.
//      Bussreisende tar en linje som går forbi startpunktet, går av på
//      holdeplassen på campus som er nærmest målet, og går resten.
//   4. Heatmapet viser hvor mange som ferdes på hver sti den timen.
//
// Regler hvis du skriver i fila selv (ellers virker ikke kartet):
//   - Tekst i anførselstegn: 'Slik'. Tall uten anførselstegn: 120
//   - Komma mellom hvert element
//   - Posisjon skrives [lengdegrad, breddegrad] = [øst, nord]
//   - Timer skrives 0–23: 8 betyr timen 08:00–09:00. Timer som mangler = 0
//   - Trykk F12 → «Console» i nettleseren hvis noe ikke virker

const GANGTRAFIKK_DATA = {

`;

const SCENARIO_START = `  // STARTPUNKTER: der studentene bor eller kommer fra.
  //   navn        – vises i kartet og tabellene
  //   posisjon    – [lengdegrad, breddegrad]
  //   personer    – antall som reiser til campus per time: { time: antall }
  //   reisemiddel – fordeling i prosent mellom gange, sykkel, buss og
  //                 sparkesykkel (elsparkesykkel). Regnes om til andeler.
`;

const SCENARIO_MAL = `  // MÅL: bygningene folk skal til.
  //   navn     – vises i kartet og tabellen
  //   posisjon – [lengdegrad, breddegrad], helst ved hovedinngangen
  //   vekt     – hvor attraktivt målet er hver time: { time: vekt }
  //              Relativ: vekt 10 får dobbelt så mange som vekt 5 samme time.
`;

const SCENARIO_SNARVEI = `  // SNARVEIER: stier som ikke er i OpenStreetMap, f.eks. tråkk over en plen.
  // Snarveier gjelder bare for gående. Endepunktene kobles til nærmeste sti.
  //   navn  – vises i kartet
  //   linje – punktene langs snarveien: [[lengdegrad, breddegrad], ...]
`;

document.getElementById('scenario-kopier').addEventListener('click', async function () {
  const kode = lagScenarioFil();
  scenarioKode.hidden = false;
  scenarioKode.value = kode;
  try {
    await navigator.clipboard.writeText(kode);
    scenarioStatus.textContent = 'Koden er kopiert! Åpne gangtrafikk-data.js på GitHub, trykk blyanten, ' +
      'marker alt (Ctrl+A), lim inn (Ctrl+V) og trykk «Commit changes».';
  } catch (feil) {
    scenarioKode.select();
    scenarioStatus.textContent = 'Klarte ikke kopiere automatisk. Teksten under er markert: trykk Ctrl+C for å kopiere.';
  }
});

document.getElementById('scenario-last-ned').addEventListener('click', function () {
  lastNed(lagScenarioFil(), 'gangtrafikk-data.js');
  scenarioStatus.textContent = 'Fila er lastet ned. På GitHub: «Add file» → «Upload files» for å erstatte den gamle.';
});

document.getElementById('scenario-forkast').addEventListener('click', function () {
  if (!confirm('Vil du forkaste alle endringene og gå tilbake til det som står i gangtrafikk-data.js?')) {
    return;
  }
  const kopi = JSON.parse(JSON.stringify(SCENARIO_FIL));
  DATA.startpunkter = kopi.startpunkter;
  DATA.mal = kopi.mal;
  DATA.snarveier = kopi.snarveier;
  velg(null);
  scenarioKode.hidden = true;
  scenarioStatus.textContent = 'Regner ut på nytt …';
  setTimeout(function () {
    endret('alt');
    scenarioStatus.textContent = 'Endringene er forkastet.';
  }, 20);
});

// ---------- Slå redigering av og på ----------

scenarioKnapp.addEventListener('click', function () {
  redigererScenario = !redigererScenario;
  scenarioPanel.hidden = !redigererScenario;
  scenarioKnapp.textContent = redigererScenario ? 'Avslutt redigering' : 'Rediger scenario';
  scenarioKnapp.classList.toggle('aktiv', redigererScenario);
  if (redigererScenario) {
    kart.doubleClickZoom.disable();
    scenarioStatus.textContent = 'Klikk på et startpunkt, et mål eller en snarvei for å endre det.';
  } else {
    settVerktoy(null);
    velg(null);
    kart.doubleClickZoom.enable();
    scenarioStatus.textContent = '';
  }
  oppdaterValgtLag();
});

// Når kartet og modellen er klare (se gangtrafikk.js): legg til lagene for redigering.
document.addEventListener('gangtrafikk-klar', function () {
  kart.addSource('valgt', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  kart.addLayer({
    id: 'valgt-ring',
    type: 'circle',
    source: 'valgt',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#0b0b0b', 'circle-stroke-width': 2.5 }
  });
  kart.addLayer({
    id: 'valgt-linje',
    type: 'line',
    source: 'valgt',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#0b0b0b', 'line-width': 7, 'line-opacity': 0.35 }
  }, 'snarveier');
  kart.addSource('snarvei-utkast', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  kart.addLayer({
    id: 'snarvei-utkast',
    type: 'line',
    source: 'snarvei-utkast',
    paint: { 'line-color': SNARVEIFARGE, 'line-width': 3, 'line-dasharray': [1, 1] }
  });

  kart.on('mousedown', 'starter', startDraPunkt);
  kart.on('touchstart', 'starter', startDraPunkt);
  kart.on('mousedown', 'mal', startDraPunkt);
  kart.on('touchstart', 'mal', startDraPunkt);
});
