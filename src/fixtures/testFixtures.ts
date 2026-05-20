import { test as base, request as playwrightRequest } from '@playwright/test';
import { loadRuntimeConfig, type RuntimeConfig } from '@config/runtimeConfig';
import { RulesApi } from '@api/rulesApi';
import { BasePage } from '@pages/basePage';
import { LoginPage } from '@pages/loginPage';
import { AdminApis } from '@api/adminApis';
import { UserMgmtApi } from '@api/userMgmtApi';
import { Logger } from '@utils/logger';

type AppFixtures = {
  runtimeConfig: RuntimeConfig;
  rulesApi: RulesApi;
  basePage: BasePage;
  loginPage: LoginPage;
  adminApis: AdminApis;
  userMgmtApi: UserMgmtApi;
  prepareElement: void;
};

export const test = base.extend<AppFixtures>({
  runtimeConfig: async ({ }, use) => {
    const runtime = loadRuntimeConfig();
    await use(runtime);
  },

  context: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: undefined,
      ignoreHTTPSErrors: true,
    });
    await use(context);
    await context.close();
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
  }
});

export { expect } from '@playwright/test';