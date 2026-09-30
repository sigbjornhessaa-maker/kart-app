// campus-data.js: DIN datafil for campus-kartet.
//
// Her legger du inn:
//   1. nyeBygninger – bygninger som ikke finnes i OpenStreetMap ennå
//   2. rivinger     – eksisterende bygninger som skal rives
//
// Tidslinjen i kartet bruker årstallene her: en ny bygning dukker opp
// i byggeåret, og en bygning som rives forsvinner i riveåret.
//
// Regler for å skrive i denne filen (ellers virker ikke kartet):
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
  // Hver bygning er et objekt { ... } med disse feltene:
  //   navn     – navnet som vises når du klikker på bygningen
  //   byggeår  – året bygningen står ferdig (vises fra og med dette året)
  //   høyde    – høyden i meter over bakken (ca. 3,5 m per etasje)
  //   omriss   – hjørnene i bygningens grunnflate, i rekkefølge rundt bygget
  //   riveår   – (valgfritt) året bygningen rives
  //
  // Tips: Du kan tegne omrisset på https://geojson.io og kopiere
  // koordinatene derfra (de ligger under "coordinates").
  nyeBygninger: [
    {
      navn: 'Eksempelbygg (endre eller slett meg)',
      byggeår: 2028,
      høyde: 21,
      omriss: [
        [10.3980, 63.41680],
        [10.3988, 63.41680],
        [10.3988, 63.41710],
        [10.3980, 63.41710]
      ]
    }
    // Neste bygning legger du til her, etter et komma:
    // ,
    // {
    //   navn: 'Nytt bygg',
    //   byggeår: 2030,
    //   høyde: 18,
    //   omriss: [
    //     [10.4000, 63.4160],
    //     [10.4006, 63.4160],
    //     [10.4006, 63.4163],
    //     [10.4000, 63.4163]
    //   ]
    // }
  ],

  // 2. RIVINGER
  // Bygninger fra OpenStreetMap som skal rives. Hver rivning har:
  //   osmId   – bygningens ID i OpenStreetMap, f.eks. 'way/123456789'.
  //             Klikk på bygningen i kartet, så står ID-en i boblen.
  //   riveår  – året bygningen er revet (vises ikke lenger fra dette året)
  //   merknad – (valgfritt) en kort forklaring, vises i boblen
  rivinger: [
    // Eksempel (fjern // foran linjen og bytt til en ekte ID):
    // { osmId: 'way/123456789', riveår: 2027, merknad: 'Rives for å gi plass til nybygg' }
  ]
};
