# Tile Solver v10.1 clean + tests (macOS)

## Run app
Terminal 1:
```bash
cd tile-solver-v10_1-clean-macos
python3 -m http.server 8080
```

## Run tests
Terminal 2:
```bash
cd tile-solver-v10_1-clean-macos
npm i
npx playwright install
npm run test:e2e
```

## Fix included
Tests now wait for templates to finish loading before interacting with the edit panel / self-test.
