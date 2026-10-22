// campus-data.js: DIN datafil for campus-kartet.
//
// Enklest: bruk «Rediger bygg» i kartet, og trykk «Kopier kode».
// Lim så inn ALT her i stedet for det som står i fila fra før.
//
// Her ligger:
//   1. nyeBygninger – bygninger som ikke finnes i OpenStreetMap ennå
//   2. rivinger     – eksisterende bygninger som skal rives
//   3. rettinger    – feil i byggene fra OpenStreetMap som er rettet eller slettet
//
// Tidslinjen i kartet går måned for måned fra 2020: en ny bygning dukker
// opp i byggemåneden, og en bygning som rives forsvinner i rivemåneden.
// Uten måned regnes januar.
//
// Regler hvis du skriver i fila selv (ellers virker ikke kartet):
//   - Tekst skal stå i anførselstegn: 'Slik'
//   - Tall skal IKKE ha anførselstegn: 2028
//   - Det skal være komma mellom hver linje/hvert element i en liste
//   - Koordinater skrives [lengdegrad, breddegrad], altså [øst, nord].
//     På campus er lengdegraden ca. 10.40 og breddegraden ca. 63.41.
//   - Linjer som starter med // er kommentarer og blir ignorert.
//
// Hvis kartet slutter å virke etter en endring: trykk F12 i nettleseren
// og se i «Console». Der står det hvilken linje feilen er på.

const CAMPUS_DATA = {

  // 1. NYE BYGNINGER
  // Hver bygning har:
  //   navn     – navnet som vises når du klikker på bygningen
  //   byggeår    – året bygningen står ferdig
  //   byggemåned – (valgfritt) måneden den står ferdig, 1–12 (uten: januar)
  //   høyde      – høyden i meter over bakken (ca. 3,5 m per etasje)
  //   riveår     – (valgfritt) året bygningen rives
  //   rivemåned  – (valgfritt) måneden den rives, 1–12 (uten: januar)
  //   omriss     – hjørnene i bygningens grunnflate, i rekkefølge rundt bygget
  nyeBygninger: [
    {
      navn: 'Eksempelbygg (endre eller slett meg)',
      byggeår: 2028,
      høyde: 21,
      omriss: [
        [10.399694, 63.415274],
        [10.400844, 63.415360],
        [10.400600, 63.415952],
        [10.400147, 63.415921],
        [10.399398, 63.415789]
      ]
    },
    {
      navn: 'P6',
      byggeår: 2030,
      høyde: 40,
      omriss: [
        [10.405551, 63.416746],
        [10.405237, 63.417058],
        [10.405568, 63.417159],
        [10.406004, 63.417175],
        [10.405725, 63.417502],
        [10.406527, 63.417666],
        [10.407084, 63.417066]
      ]
    }
  ],

  // 2. RIVINGER
  // Bygninger fra OpenStreetMap som skal rives. Hver rivning har:
  //   osmId   – bygningens ID i OpenStreetMap, f.eks. 'way/123456789'
  //             (klikk på bygningen i kartet, så står ID-en i boblen)
  //   riveår    – året bygningen er revet
  //   rivemåned – (valgfritt) måneden den er revet, 1–12 (uten: januar)
  //   merknad   – (valgfritt) en kort forklaring, vises i boblen
  rivinger: [
    { osmId: 'way/30285316', riveår: 2027 },
    { osmId: 'way/38138616', riveår: 2028 },
    { osmId: 'way/38314745', riveår: 2028 }
  ],

  // 3. RETTINGER
  // Feil i byggene fra OpenStreetMap. Hver retting har osmId, og så det som skal endres:
  //   slett      – true = bygget fjernes helt fra kartet
  //   navn       – riktig navn
  //   høyde      – riktig høyde i meter
  //   byggeår    – riktig byggeår (og eventuelt byggemåned, 1–12)
  //   merknad    – (valgfritt) en kort forklaring
  // Er omrisset feil: bruk «Gjør om til eget bygg» i redigeringen.
  rettinger: [
  ]
};
