# kart-app
Mitt første kart-app prosjekt: et kart over Trondheim laget med MapLibre GL.

- Campus (Gløshaugen, Hesthagen/Elgeseter, Studentersamfundet og Lerkendal) vises i 3D,
  med bygninger og høyder fra OpenStreetMap.
- Tidslinje som viser campus år for år, med nye bygninger og rivinger fra `campus-data.js`.
- Redigeringsmodus: tegn, flytt og endre nye bygg i kartet, merk bygg for riving,
  og kopier ferdig kode til `campus-data.js`.
- Bytt mellom gatekart, topografisk kart og satellittbilder.
- Legg til egne punkter, mål avstander og se vedtatte reguleringsplaner (fra DiBK).
- Egen side for gangtrafikk (`gangtrafikk.html`): beregnet trafikk fra boområder i hele
  Trondheim til bygningene på campus, med gange, sykkel, buss og elsparkesykkel, snarveier
  og redigeringsmodus. Vist som heatmap med tidsslider for døgnet.

## Filer
- `index.html` – strukturen på siden (kart, lagmeny, tidslinje, sidepanel).
- `style.css` – utseendet (farger, størrelser, oppsett på mobil).
- `script.js` – kartet, kartlagene, punkter, avstandsmåling og reguleringsplaner.
- `bygninger.js` – 3D-bygningene: henter fra OpenStreetMap og styrer tidslinjen.
- `rediger.js` – redigeringsmodusen («Rediger bygg» i sidepanelet).
- `campus-data.js` – **din datafil** med nye bygninger og rivinger. Se kommentarene i filen.
- `gangtrafikk.html` / `gangtrafikk.js` – siden for gangtrafikk: rutesøk, buss og heatmap.
- `gangtrafikk-rediger.js` – redigeringsmodusen («Rediger scenario») på gangtrafikksiden.
- `gangtrafikk-data.js` – **din datafil** med startpunkter, reisemåter, mål og snarveier.
- `kartdata-henting.js` – henter gangnett og bussruter fra OpenStreetMap.
- `data/gangnett.js` og `data/bussruter.js` – kartdataene lagret som filer (lag dem med
  knappene under «Kartdata» på gangtrafikksiden, eller `node verktoy/hent-kartdata.js`).
- `arealformal.js` – oversetter arealformål-koder (f.eks. 2011) til tekst (Kjøreveg).

## Kjøre lokalt
Åpne `index.html` i nettleseren (dobbeltklikk på filen).

## Publisering
Appen publiseres med GitHub Pages: Settings → Pages → «Deploy from a branch».

## Kilder og kreditering
- Kartdata og bygninger © [OpenStreetMap](https://www.openstreetmap.org/copyright)-bidragsytere
- Topografisk kart © Kartverket, satellittbilder © Esri
- Reguleringsplaner © Direktoratet for byggkvalitet (DiBK)
