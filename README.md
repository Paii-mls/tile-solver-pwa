# Tile Solver PWA v06

## Features
- iOS Paste screenshot workflow.
- DPR-safe canvas rendering for iPhone / Retina screens.
- Auto Detect tile candidates from screenshot (client-side CV prototype).
- Auto group visually similar tiles into T1, T2, T3...
- Step Mode: Suggest → Apply → auto suggest next.
- Undo latest applied move.

## Recommended flow
1. Paste/upload screenshot.
2. Tap “Auto Detect ไพ่”.
3. Tap wrong boxes to deactivate; tap missing open tiles to add manually.
4. Tap “แนะนำ”.
5. Tap the red highlighted tile in the game.
6. Return to the PWA and tap “กดใบนี้แล้ว”.
7. Repeat until candidates are exhausted. Add newly opened tiles manually or paste a fresh screenshot.

## Notes
- Auto Detect is an assistive prototype, not a fully trained object detection model.
- For PWA install/offline features, host over HTTPS such as GitHub Pages.
