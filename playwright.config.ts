import { defineConfig } from '@playwright/test';
export default defineConfig({
  timeout: 60000,
  testDir: './tests',
  use: { baseURL: 'http://localhost:8080', headless: true }
});
