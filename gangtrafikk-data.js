// gangtrafikk-data.js: DIN datafil for gangtrafikk på campus.
//
// Enklest: bruk «Rediger scenario» på gangtrafikksiden, og trykk
// «Kopier kode». Lim så inn ALT her i stedet for det som står fra før.
//
// ALLE TALL HER ER OPPDIKTEDE EKSEMPLER. Posisjonene er omtrentlige.
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

  // STARTPUNKTER: der studentene bor eller kommer fra.
  //   navn       – vises i kartet og tabellene
  //   posisjon   – [lengdegrad, breddegrad]
  //   personer   – antall som reiser til campus per time: { time: antall }
  //   reisemiddel – fordeling i prosent mellom gange, sykkel, buss og
  //                 sparkesykkel (elsparkesykkel). Trenger ikke summere til 100,
  //                 tallene regnes om til andeler.
  startpunkter: [
    {
      navn: 'Moholt studentby',
      posisjon: [10.4335, 63.4120],
      personer: { 7: 40, 8: 320, 9: 220, 10: 120, 11: 80, 12: 90, 13: 70, 14: 60, 15: 60, 16: 60, 17: 60, 18: 80, 19: 90, 20: 70, 21: 40 },
      reisemiddel: { gange: 45, sykkel: 25, buss: 20, sparkesykkel: 10 }
    },
    {
      navn: 'Berg studentby',
      posisjon: [10.4170, 63.4085],
      personer: { 7: 20, 8: 160, 9: 110, 10: 60, 11: 40, 12: 40, 13: 30, 14: 30, 15: 30, 16: 30, 17: 30, 18: 40, 19: 40, 20: 30 },
      reisemiddel: { gange: 70, sykkel: 20, buss: 0, sparkesykkel: 10 }
    },
    {
      navn: 'Singsaker',
      posisjon: [10.4100, 63.4260],
      personer: { 7: 20, 8: 150, 9: 100, 10: 50, 11: 30, 12: 30, 13: 30, 14: 20, 15: 20, 16: 20, 17: 20, 18: 30, 19: 40, 20: 30 },
      reisemiddel: { gange: 75, sykkel: 15, buss: 0, sparkesykkel: 10 }
    },
    {
      navn: 'Elgeseter og Øya',
      posisjon: [10.3895, 63.4215],
      personer: { 7: 30, 8: 200, 9: 150, 10: 80, 11: 50, 12: 60, 13: 50, 14: 40, 15: 40, 16: 40, 17: 40, 18: 60, 19: 80, 20: 70, 21: 50 },
      reisemiddel: { gange: 80, sykkel: 10, buss: 0, sparkesykkel: 10 }
    },
    {
      navn: 'Sentrum (Midtbyen)',
      posisjon: [10.3950, 63.4300],
      personer: { 7: 30, 8: 220, 9: 160, 10: 80, 11: 50, 12: 50, 13: 40, 14: 40, 15: 40, 16: 40, 17: 40, 18: 60, 19: 80, 20: 60 },
      reisemiddel: { gange: 40, sykkel: 25, buss: 25, sparkesykkel: 10 }
    },
    {
      navn: 'Lade',
      posisjon: [10.4450, 63.4440],
      personer: { 7: 30, 8: 180, 9: 120, 10: 60, 11: 30, 12: 30, 13: 30, 14: 30, 15: 30, 16: 30, 17: 20 },
      reisemiddel: { gange: 0, sykkel: 30, buss: 65, sparkesykkel: 5 }
    },
    {
      navn: 'Byåsen',
      posisjon: [10.3500, 63.4100],
      personer: { 7: 30, 8: 160, 9: 100, 10: 50, 11: 30, 12: 30, 13: 20, 14: 20, 15: 20, 16: 20 },
      reisemiddel: { gange: 0, sykkel: 20, buss: 80, sparkesykkel: 0 }
    },
    {
      navn: 'Tiller og Heimdal',
      posisjon: [10.3850, 63.3650],
      personer: { 7: 40, 8: 200, 9: 120, 10: 50, 11: 30, 12: 30, 13: 20, 14: 20, 15: 20, 16: 20 },
      reisemiddel: { gange: 0, sykkel: 10, buss: 90, sparkesykkel: 0 }
    },
    {
      navn: 'Ranheim',
      posisjon: [10.5300, 63.4270],
      personer: { 7: 20, 8: 100, 9: 60, 10: 30, 11: 20, 12: 20, 13: 10, 14: 10, 15: 10, 16: 10 },
      reisemiddel: { gange: 0, sykkel: 10, buss: 90, sparkesykkel: 0 }
    }
  ],

  // MÅL: bygningene folk skal til.
  //   navn     – vises i kartet og tabellen
  //   posisjon – [lengdegrad, breddegrad], helst ved hovedinngangen
  //   vekt     – hvor attraktivt målet er hver time: { time: vekt }
  //              Relativ: vekt 10 får dobbelt så mange som vekt 5 samme time.
  mal: [
    {
      navn: 'Hovedbygningen',
      posisjon: [10.4024, 63.4194],
      vekt: { 8: 8, 9: 8, 10: 8, 11: 8, 12: 6, 13: 8, 14: 8, 15: 6, 16: 4, 17: 2 }
    },
    {
      navn: 'Realfagbygget',
      posisjon: [10.4050, 63.4153],
      vekt: { 8: 10, 9: 10, 10: 10, 11: 9, 12: 6, 13: 9, 14: 9, 15: 7, 16: 5, 17: 3, 18: 2, 19: 1 }
    },
    {
      navn: 'Sentralbygget',
      posisjon: [10.4046, 63.4178],
      vekt: { 8: 9, 9: 9, 10: 9, 11: 9, 12: 6, 13: 9, 14: 8, 15: 6, 16: 4, 17: 2 }
    },
    {
      navn: 'Elektrobygget',
      posisjon: [10.4072, 63.4170],
      vekt: { 8: 6, 9: 6, 10: 6, 11: 6, 12: 4, 13: 6, 14: 6, 15: 4, 16: 3, 17: 1 }
    },
    {
      navn: 'Kantine Gløshaugen',
      posisjon: [10.4035, 63.4185],
      vekt: { 10: 2, 11: 12, 12: 18, 13: 8, 14: 2 }
    },
    {
      navn: 'Idrettsbygget Gløshaugen',
      posisjon: [10.4080, 63.4135],
      vekt: { 7: 2, 15: 4, 16: 6, 17: 8, 18: 8, 19: 6, 20: 4, 21: 2 }
    },
    {
      navn: 'Studentersamfundet',
      posisjon: [10.3950, 63.4224],
      vekt: { 12: 1, 17: 4, 18: 10, 19: 15, 20: 15, 21: 12, 22: 8, 23: 4 }
    }
  ],

  // SNARVEIER: stier som ikke er i OpenStreetMap, f.eks. tråkk over en plen.
  // Snarveier gjelder bare for gående. Endepunktene kobles til nærmeste sti.
  //   navn  – vises i kartet
  //   linje – punktene langs snarveien: [[lengdegrad, breddegrad], ...]
  snarveier: [
    {
      navn: 'Eksempel: tråkk over plenen (endre eller slett meg)',
      linje: [[10.4010, 63.4180], [10.4030, 63.4172]]
    }
  ]
};
