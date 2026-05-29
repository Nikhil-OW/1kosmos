import { defineConfig, devices } from '@playwright/test';
import { loadRuntimeConfig } from './src/config/runtimeConfig';

const runtime = loadRuntimeConfig();

export default defineConfig({
  globalSetup: './src/globalSetup',
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 120_000,
  expect: {
    timeout: 20_000
  },
  use: {
    baseURL: runtime.baseUrl,
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 }
    },
    actionTimeout: 20_000,
    navigationTimeout: 50_000,
    extraHTTPHeaders: {
      'x-community-name': runtime.communityName
    },
    viewport: null,
    launchOptions: {
      args: ['--start-maximized', '--disable-application-cache'],
      slowMo: 800
    },
  },
  reporter: [
    ['json'],
    ['line'],
    ['html', { open: 'never' }],
    ['allure-playwright', {
      detail: true,
      outputFolder: 'allure-results',
      suiteTitle: true,
    }],
    ['./src/utils/emailReporter.ts']
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      }
    }
  ]
});
