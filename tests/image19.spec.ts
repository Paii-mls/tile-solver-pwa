import { test, expect } from '@playwright/test';
import path from 'path';

function hypot(dx:number, dy:number){ return Math.sqrt(dx*dx+dy*dy); }

test('Image19 should not have duplicate boxes too close (active only)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#result')).not.toContainText('กำลังโหลด Template', { timeout: 60000 });
  const filePath = path.resolve('./tests/fixtures/image19.jpeg');
  await page.setInputFiles('#upload', filePath);
  await page.click('#btnAnalyze');
  const state = await page.evaluate(() => (window as any).__tsDebug.getState());
  const tiles = state.tiles as Array<any>;
  const iconSize = state.iconSize as number;
  const minDist = Math.max(10, Math.round(iconSize * 0.70));
  const actives = tiles.filter(t => t.active);
  for (let i=0;i<actives.length;i++) {
    for (let j=i+1;j<actives.length;j++) {
      const dx = actives[i].cx - actives[j].cx;
      const dy = actives[i].cy - actives[j].cy;
      const d = hypot(dx,dy);
      expect(d, `duplicate-like boxes i=${i} j=${j} dist=${d}`).toBeGreaterThanOrEqual(minDist);
    }
  }
});

test('Image19 active detections must be within template range and above threshold', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#result')).not.toContainText('กำลังโหลด Template', { timeout: 60000 });
  const filePath = path.resolve('./tests/fixtures/image19.jpeg');
  await page.setInputFiles('#upload', filePath);
  await page.click('#btnAnalyze');
  const state = await page.evaluate(() => (window as any).__tsDebug.getState());
  const tiles = state.tiles as Array<any>;
  const thr = state.confThreshold as number;
  for (const t of tiles) {
    if (t.active) {
      expect(t.conf).toBeGreaterThanOrEqual(thr);
      expect(t.typeId).toBeGreaterThanOrEqual(1);
      expect(t.typeId).toBeLessThanOrEqual(13);
    }
  }
});
