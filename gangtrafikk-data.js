// gangtrafikk-data.js: DIN datafil for gangtrafikk på campus.
//
// ALLE TALL HER ER OPPDIKTEDE EKSEMPLER. Bytt dem ut med ekte tall
// (f.eks. passasjertall fra AtB, tellinger eller timeplandata).
// Posisjonene er også omtrentlige: sjekk dem i kartet og flytt dem ved behov.
//
// Slik regner kartet:
//   For hver time sendes personene fra hvert startpunkt til målene.
//   Et mål med høy vekt får en stor andel, et mål med vekt 0 får ingen.
//   Alle går korteste vei langs gangnettet. Heatmapet viser hvor mange
//   som går på hver sti i løpet av timen (begge retninger regnes med).
//
// Timer skrives som tall fra 0 til 23: 8 betyr timen 08:00–09:00.
// Timer du ikke skriver opp, regnes som 0.
//
// Regler (ellers virker ikke kartet):
//   - Tekst i anførselstegn: 'Slik'. Tall uten anførselstegn: 120
//   - Komma mellom hvert element
//   - Posisjon skrives [lengdegrad, breddegrad] = [øst, nord],
//     på campus ca. [10.40, 63.41]
//   - Trykk F12 → «Console» i nettleseren hvis noe ikke virker

const GANGTRAFIKK_DATA = {

  // STARTPUNKTER: der folk kommer fra.
  //   navn     – vises i kartet og tabellen
  //   type     – 'holdeplass', 'bolig' eller 'sykkel' (bestemmer fargen)
  //   posisjon – [lengdegrad, breddegrad]
  //   personer – antall personer per time: { time: antall, ... }
  startpunkter: [
    {
      navn: 'Holdeplass Høgskoleringen',
      type: 'holdeplass',
      posisjon: [10.4005, 63.4205],
      personer: { 7: 60, 8: 420, 9: 260, 10: 140, 11: 90, 12: 110, 13: 90, 14: 110, 15: 200, 16: 260, 17: 150, 18: 70, 19: 40, 20: 30, 21: 20, 22: 10 }
    },
    {
      navn: 'Holdeplass Elgeseter gate',
      type: 'holdeplass',
      posisjon: [10.3958, 63.4180],
      personer: { 7: 50, 8: 350, 9: 220, 10: 120, 11: 80, 12: 90, 13: 80, 14: 100, 15: 180, 16: 220, 17: 130, 18: 80, 19: 60, 20: 50, 21: 40, 22: 20 }
    },
    {
      navn: 'Holdeplass Lerkendal',
      type: 'holdeplass',
      posisjon: [10.4010, 63.4100],
      personer: { 7: 20, 8: 120, 9: 80, 10: 40, 11: 30, 12: 30, 13: 30, 14: 40, 15: 70, 16: 90, 17: 50, 18: 30, 19: 20 }
    },
    {
      navn: 'Boligområde Elgeseter/Øya',
      type: 'bolig',
      posisjon: [10.3895, 63.4215],
      personer: { 7: 30, 8: 200, 9: 150, 10: 80, 11: 50, 12: 60, 13: 50, 14: 40, 15: 40, 16: 40, 17: 40, 18: 60, 19: 80, 20: 70, 21: 50, 22: 30 }
    },
    {
      navn: 'Boligområde Moholt (retning øst)',
      type: 'bolig',
      posisjon: [10.4185, 63.4150],
      personer: { 7: 40, 8: 300, 9: 200, 10: 110, 11: 70, 12: 80, 13: 60, 14: 60, 15: 60, 16: 60, 17: 60, 18: 80, 19: 100, 20: 90, 21: 60, 22: 30, 23: 10 }
    },
    {
      navn: 'Sykkelparkering Hovedbygningen',
      type: 'sykkel',
      posisjon: [10.4018, 63.4188],
      personer: { 7: 20, 8: 150, 9: 90, 10: 40, 11: 30, 12: 30, 13: 30, 14: 40, 15: 90, 16: 120, 17: 60, 18: 20 }
    },
    {
      navn: 'Sykkelparkering Realfagbygget',
      type: 'sykkel',
      posisjon: [10.4062, 63.4158],
      personer: { 7: 15, 8: 120, 9: 70, 10: 30, 11: 20, 12: 20, 13: 20, 14: 30, 15: 70, 16: 100, 17: 50, 18: 15 }
    }
  ],

  // MÅL: bygningene folk skal til.
  //   navn     – vises i kartet og tabellen
  //   posisjon – [lengdegrad, breddegrad], helst ved inngangen
  //   vekt     – hvor attraktivt målet er hver time: { time: vekt, ... }
  //              Vekten er relativ: et mål med vekt 10 får dobbelt så mange
  //              som et med vekt 5 den timen. Bruk f.eks. antall studieplasser
  //              eller antall i forelesning den timen.
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
  ]
};
