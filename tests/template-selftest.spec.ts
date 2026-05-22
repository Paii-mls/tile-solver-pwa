import { test, expect } from '@playwright/test';

test('Self-test should PASS 13/13', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#result')).not.toContainText('กำลังโหลด Template', { timeout: 60000 });
  await expect(page.locator('#btnEdit')).toBeVisible();
  await page.locator('#btnEdit').click();
  await expect(page.locator('#editPanel')).toBeVisible();
  await page.locator('#btnSelfTest').scrollIntoViewIfNeeded();
  await expect(page.locator('#btnSelfTest')).toBeVisible();
  await page.locator('#btnSelfTest').click();
  await expect(page.locator('#result')).toContainText('PASS', { timeout: 60000 });
  await expect(page.locator('#result')).toContainText('13/13');
});
