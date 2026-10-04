// campus-data.js: DIN datafil for campus-kartet.
//
// Enklest: bruk «Rediger bygg» i kartet, og trykk «Kopier kode».
// Lim så inn ALT her i stedet for det som står i fila fra før.
//
// Her ligger:
//   1. nyeBygninger – bygninger som ikke finnes i OpenStreetMap ennå
//   2. rivinger     – eksisterende bygninger som skal rives
//
// Tidslinjen i kartet bruker årstallene her: en ny bygning dukker opp
// i byggeåret, og en bygning som rives forsvinner i riveåret.
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
  //   byggeår  – året bygningen står ferdig (vises fra og med dette året)
  //   høyde    – høyden i meter over bakken (ca. 3,5 m per etasje)
  //   riveår   – (valgfritt) året bygningen rives
  //   omriss   – hjørnene i bygningens grunnflate, i rekkefølge rundt bygget
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
  //   riveår  – året bygningen er revet (vises ikke lenger fra dette året)
  //   merknad – (valgfritt) en kort forklaring, vises i boblen
  rivinger: [
    { osmId: 'way/30285316', riveår: 2027 },
    { osmId: 'way/38138616', riveår: 2028 },
    { osmId: 'way/38314745', riveår: 2028 }
  ]
};
