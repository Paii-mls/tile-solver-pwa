# Tile Solver PWA v09

Template Library Mode using 13 user-provided tile templates.

Flow:
1. Paste or upload screenshot.
2. Tap Analyze with Template.
3. The app detects tiles, crops center icon, compares against the 13 templates, and suggests one move.
4. If confidence is low or detection is wrong, open Edit mode and correct the candidate/type.

Notes:
- This improves type classification compared with v08 because it uses known template references.
- Detection of clickable/open tiles from a screenshot can still require user verification.
