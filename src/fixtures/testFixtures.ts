import { test as base, request as playwrightRequest } from '@playwright/test';
import { loadRuntimeConfig, type RuntimeConfig } from '@config/runtimeConfig';
import { RulesApi } from '@api/rulesApi';
import { BasePage } from '@pages/basePage';
import { LoginPage } from '@pages/loginPage';
import { AdminApis } from '@api/adminApis';
import { UserMgmtApi } from '@api/userMgmtApi';
import { Logger } from '@utils/logger';
import fs from 'fs';
import { HomePage } from '@pages/homePage';

type AppFixtures = {
  runtimeConfig: RuntimeConfig;
  rulesApi: RulesApi;
  basePage: BasePage;
  loginPage: LoginPage;
  adminApis: AdminApis;
  userMgmtApi: UserMgmtApi;
  homePage: HomePage;
  prepareElement: void;
};

export const test = base.extend<AppFixtures>({
  runtimeConfig: async ({ }, use) => {
    const runtime = loadRuntimeConfig();
    await use(runtime);
  },

  context: async ({ browser }, use, testInfo: any) => {
    const context = await browser.newContext({
      storageState: undefined,
      ignoreHTTPSErrors: true,
      recordVideo: {
        dir: testInfo.outputDir,
        size: { width: 1280, height: 720 }
      }
    });

    const pages: any[] = [];
    context.on('page', page => {
      pages.push(page);
    });

    await use(context);
    await context.close();

    for (const page of pages) {
      try {
        const video = page.video();
        if (video) {
          const videoPath = await video.path();
          if (videoPath && fs.existsSync(videoPath)) {
            const sanitizedTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/__+/g, '_');
            const destinationPath = testInfo.outputPath(`${sanitizedTitle}.webm`);
            fs.renameSync(videoPath, destinationPath);
            testInfo.attachments.push({
              name: 'video',
              contentType: 'video/webm',
              path: destinationPath,
            });
          }
        }
      } catch (error) {
        Logger.log('ERROR', 'VIDEO_ATTACHMENT', `Failed to save or attach video: ${error}`);
      }
    }
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    Logger.log('UI', 'SESSION', 'Executing Nuclear Storage Wipe (Storage, IndexedDB, Service Workers, and Cache).');
    await page.waitForLoadState('networkidle');
    const screenSize = await page.evaluate(() => ({
      width: window.screen.availWidth,
      height: window.screen.availHeight,
    }));
    await page.setViewportSize(screenSize);
    await use(page);
    await page.close();
  },

  rulesApi: async ({ runtimeConfig }, use) => {
    const apiContext = await playwrightRequest.newContext();
    const api = new RulesApi(apiContext, runtimeConfig);
    await api.initConfig();
    await use(api);
    await apiContext.dispose();
  },

  basePage: async ({ page, runtimeConfig }, use) => {
    const basePage = new BasePage(page, runtimeConfig);
    await use(basePage);
  },

  loginPage: async ({ page, runtimeConfig }, use) => {
    const loginPage = new LoginPage(page, runtimeConfig);
    await use(loginPage);
  },

  adminApis: async ({ request, runtimeConfig }, use) => {
    const adminApis = new AdminApis(request, runtimeConfig);
    await use(adminApis);
  },

  userMgmtApi: async ({ request, runtimeConfig }, use) => {
    if (!runtimeConfig.tenantId) {
      const admin = new AdminApis(request, runtimeConfig);
      const { tenantId, communityId } = await admin.communityAuthInfo(runtimeConfig.dns, runtimeConfig.communityName);
      runtimeConfig.tenantId = tenantId;
      runtimeConfig.communityId = communityId;
    }
    const userMgmtApi = new UserMgmtApi(request, runtimeConfig);
    await use(userMgmtApi);
  },

  homePage: async ({ page, runtimeConfig }, use) => {
    const homePage = new HomePage(page, runtimeConfig);
    await use(homePage);
  },
});

export { expect } from '@playwright/test';