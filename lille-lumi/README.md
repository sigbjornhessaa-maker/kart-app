# Lille Lumi 🚀

Et lite, søtt retro-romspill (PWA). Hold fingeren på skjermen for å stige, slipp for å synke.
Samle stjernestøv ✦, unngå asteroider, og kjøp nye rakettfarger og hatter til Lumi i butikken.

## Filer

| Fil | Hva |
|---|---|
| `index.html` | Siden, med alle skjermene (start, game over, butikk, pause) |
| `style.css` | Utseende (pikselknapper, HUD, butikk) |
| `js/sprites.js` | All pikselgrafikk: Lumi, raketter, hatter, asteroider, planeter, soner |
| `js/sound.js` | 8-bit-lyder med Web Audio API |
| `js/game.js` | Selve spillet: fysikk, hindringer, soner, lagring, butikk |
| `manifest.json` + `sw.js` | Gjør det til en installerbar app som virker offline |
| `icons/` | App-ikoner (laget av `tools/icon.html`) |

## Kjøre lokalt

Service worker krever en webserver (det holder ikke å dobbeltklikke på filen):

```
npx serve .
```

## Oppdatere spillet

Når du endrer filer: øk versjonen i `sw.js` (`lille-lumi-v1` → `lille-lumi-v2`),
så henter telefonen den nye versjonen neste gang appen åpnes (av og til må den åpnes to ganger).

## Lage ikonene på nytt

```
npm install playwright
node tools/make-icons.mjs
```
