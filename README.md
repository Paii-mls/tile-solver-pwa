# Tile Solver PWA MVP v0.4

## Changes in v0.4
- Fix highlight/tap coordinate mismatch on iPhone Retina / high DPR screens.
- Canvas stores tile positions in image pixels and renders with boundingClientRect + devicePixelRatio-safe backing canvas.
- Supports Paste screenshot workflow on iOS.

## iOS paste flow
1. Take screenshot in game.
2. Tap screenshot thumbnail.
3. Share → Copy / Copy and Delete.
4. Open PWA → tap “วางรูป (Paste)”.
5. If automatic paste is blocked, long-press and choose Paste.

## Run
Use HTTPS hosting such as GitHub Pages for PWA/service worker.
