# Mappa data

Her ligger kartdata fra OpenStreetMap som appen bruker:

- `bygninger.js` – bygningene på campus (3D-kartet)
- `gangnett.js` – gang- og sykkelnettet (gangtrafikksiden)
- `bussruter.js` – bussrutene i Trondheim (gangtrafikksiden)

Filene lages og oppdateres automatisk av GitHub Action «Oppdater kartdata».
Du trenger ikke laste dem opp selv.

**Hente nye data** (f.eks. etter at noe er endret i OpenStreetMap):
åpne `OPPDATER-KARTDATA.txt`, skriv dagens dato nederst og trykk «Commit changes».
Etter et par minutter er filene oppdatert. Følg med under fanen «Actions».

Ikke rediger filene her selv. Rettinger av bygg legger du inn i `campus-data.js`.

Finnes ikke filene, henter appen dataene direkte fra OpenStreetMap i stedet.
Det virker, men er tregere og kan feile når OpenStreetMap er travel.
