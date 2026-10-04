# kart-app
Mitt første kart-app prosjekt: et kart over Trondheim laget med MapLibre GL.

- Campus (Gløshaugen, Hesthagen/Elgeseter, Studentersamfundet og Lerkendal) vises i 3D,
  med bygninger og høyder fra OpenStreetMap.
- Tidslinje som viser campus år for år, med nye bygninger og rivinger fra `campus-data.js`.
- Redigeringsmodus: tegn, flytt og endre nye bygg i kartet, merk bygg for riving,
  og kopier ferdig kode til `campus-data.js`.
- Bytt mellom gatekart, topografisk kart og satellittbilder.
- Legg til egne punkter, mål avstander og se vedtatte reguleringsplaner (fra DiBK).

## Filer
- `index.html` – strukturen på siden (kart, lagmeny, tidslinje, sidepanel).
- `style.css` – utseendet (farger, størrelser, oppsett på mobil).
- `script.js` – kartet, kartlagene, punkter, avstandsmåling og reguleringsplaner.
- `bygninger.js` – 3D-bygningene: henter fra OpenStreetMap og styrer tidslinjen.
- `rediger.js` – redigeringsmodusen («Rediger bygg» i sidepanelet).
- `campus-data.js` – **din datafil** med nye bygninger og rivinger. Se kommentarene i filen.
- `arealformal.js` – oversetter arealformål-koder (f.eks. 2011) til tekst (Kjøreveg).

## Kjøre lokalt
Åpne `index.html` i nettleseren (dobbeltklikk på filen).

## Publisering
Appen publiseres med GitHub Pages: Settings → Pages → «Deploy from a branch».

## Kilder og kreditering
- Kartdata og bygninger © [OpenStreetMap](https://www.openstreetmap.org/copyright)-bidragsytere
- Topografisk kart © Kartverket, satellittbilder © Esri
- Reguleringsplaner © Direktoratet for byggkvalitet (DiBK)
