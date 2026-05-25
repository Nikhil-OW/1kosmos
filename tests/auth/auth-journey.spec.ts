import type { Page } from '@playwright/test';
import { RulesApi } from '../../src/api/rulesApi';
import type { RuntimeConfig } from '../../src/config/runtimeConfig';
import { test, expect } from '../../src/fixtures/testFixtures';
import { BasePage } from '@pages/basePage';
import { LoginPage } from '@pages/loginPage';
import { UserMgmtApi } from '@api/userMgmtApi';
import { DataGenerator } from '@utils/dataGenerator';
import { Logger } from '@utils/logger';
import { AdminApis } from '@api/adminApis';

type AuthJourneyFixtures = {
  page: Page;
  basePage: BasePage;
  runtimeConfig: RuntimeConfig;
  rulesApi: RulesApi;
  loginPage: LoginPage;
  userMgmtApi: UserMgmtApi;
  adminApis: AdminApis;
  browser: any;
};

let sharedUsers: any[] = [];
const { password: userPassword } = DataGenerator.generateUser();
let ruleIds: string[] = [];
const MAX_USERS = 6;

test.beforeAll(async ({ request, runtimeConfig }: any) => {
  const userMgmtApi = new UserMgmtApi(request, runtimeConfig);

  if (!runtimeConfig.tenantId) {
    const admin = new AdminApis(request, runtimeConfig);
    const { tenantId, communityId } = await admin.communityAuthInfo(runtimeConfig.dns, runtimeConfig.communityName);
    runtimeConfig.tenantId = tenantId;
    runtimeConfig.communityId = communityId;
  }

  for (let i = 0; i < MAX_USERS; i++) {
    const userData = DataGenerator.generateUser(i + 1);
    const { data: body } = await userMgmtApi.createAutomationUser(
      userData.username, userData.password, userData.firstName, userData.lastName
    );

    const isNewCreation = body?.created === 1;
    const isDuplicate = Array.isArray(body?.errors) && body.errors.some((e: any) =>
      e.errmsg?.includes('Duplicate') || e.errmsg?.includes('already exists')
    );

    if (isNewCreation) {
      Logger.log('SUCCESS', 'USER_SETUP', `Success: Fresh User Created -> ${userData.username}`);
      sharedUsers.push(userData);
    } else if (isDuplicate) {
      Logger.log('INFO', 'USER_SETUP', `Duplicate Found: User [${userData.username}] already exists. Reusing existing record.`);
      sharedUsers.push(userData);
    } else {
      Logger.log('ERROR', 'USER_SETUP', `❌ System Failure for ${userData.username}: ${JSON.stringify(body?.errors)}`);
    }
  }
});

test.describe('Authentication Journey - Password Only', () => {
  test('TC01 - Create password-only auth journey via Rules Engine and verify login success', async ({ rulesApi, loginPage }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;

    await test.step('Step 1: Create a password-only rule via Rules Engine with grant access decision', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        decision: 'grant_access',
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ]
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Create a password-only rule via Rules Engine with MFA needed for password factor', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ['password'],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 3: Verify user authentication journey in UI', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      await loginPage.verifyLoginSuccess('User');
      await loginPage.logout(testUser);
    });
  });

});

test.describe('Authentication Journey - Password with Email OTP', () => {
  test('TC02 - Create password with email OTP auth journey via Rules Engine and verify login success', async ({ rulesApi, adminApis, loginPage }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    let capturedOtp: string;

    await test.step('Step 1: Create a Password and Email OTP rule via Rules Engine with mfa_needed set for email OTP', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "authenticationMethods", value: ["otp"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ['email_otp'],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Create a Password and Email OTP rule via Rules Engine with grant access decision', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "authenticationMethods", value: ["otp"], operator: "overlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'grant_access'
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 3: Create a Password and Email OTP rule via Rules Engine with mfa_needed set for password factor', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ['password'],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 4: Verify user authentication journey in UI', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      Logger.log('API', 'STEP 2', `Generating OTP for user: ${testUser} to simulate backend OTP generation...`);
      capturedOtp = await adminApis.generateAndCaptureOtp(testUser);
      expect(capturedOtp, 'OTP should be a 6-digit string').toMatch(/^\d{6}$/);
      await loginPage.enterVerificationCode(capturedOtp);
      await loginPage.verifyLoginSuccess('User');
      await loginPage.logout(testUser);
    });
  });
});

test.describe('Authentication Journey - Login with Push', () => {
  test('TC03 - Create login with password and push notification auth journey via Rules Engine and verify login success via UI', async ({ rulesApi, adminApis, userMgmtApi, loginPage, page, runtimeConfig }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    let accessCode: string;

    await test.step('Step 1: Create a password rule via Rules Engine with MFA needed for password factor', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ['password'],
      });
      const response = await rulesApi.createRule(ruleBody);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Create a Password and Push rule via Rules Engine with mfa_needed set for push factor', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "authenticationMethods", value: ["push", "uwl"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ["push", "uwl"],
      });
      const response = await rulesApi.createRule(ruleBody);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 3: Create a rule via Rules Engine to grant access only after both factors match', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "authenticationMethods", value: ["push", "uwl"], operator: "overlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'grant_access'
      });
      const response = await rulesApi.createRule(ruleBody);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 4: API - Fetch user info to link device', async () => {
      Logger.log('API', 'STEP 4', `Fetching user information for user: ${testUser} ...`);
      await userMgmtApi.fetchUserInfo(testUser);
      Logger.log('API', 'INFO', `Fetched user info for: ${testUser}`);
    });

    await test.step('Step 5: API - Create Access Code', async () => {
      Logger.log('API', 'STEP 5', `Generating OTP for user: ${testUser} to simulate backend OTP generation...`);
      accessCode = await adminApis.createAccessCode();
    });

    await test.step('Step 6: API - Redeem code to Link device', async () => {
      Logger.log('API', 'STEP 6', `Redeeming code to link device for user: ${testUser} to simulate backend generation...`);
      await adminApis.redeemAccessCode(testUser, accessCode);
      Logger.log('SUCCESS', `Successfully redeemed code and linked device for user: ${testUser}`);
    });

    await test.step('Step 7: Verify user authentication journey in UI with Push notification is displayed', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      await loginPage.verifyPushNotificationSignInScreen();
      const sessionId = await adminApis.interceptAndGetUiSessionId(page);
      expect(sessionId).toBeDefined();
      const sessionData = await adminApis.authenticateSession(testUser, 'push');
      expect(sessionData).toBeDefined();
      await loginPage.verifyLoginSuccess('User');
      await loginPage.logout(testUser);
    });

    await test.step('Step 8: API - Unlink user device', async () => {
      const communityId = runtimeConfig.communityId;
      const userJwt = await page.evaluate((cid) => window.localStorage.getItem(`${cid}_token`), communityId);
      expect(userJwt).toBeDefined();

      Logger.log('API', 'INFO', `Unlinking user device using basic user's own JWT...`);
      const unlinkRes = await adminApis.unlinkUserDevice(testUser, userJwt!);
      expect(unlinkRes.status).toBe(200);
      expect(unlinkRes.data.message).toBeDefined();
    });
  });

  test('TC04 - Create login with password and push notification auth journey via Rules Engine and verify "Authentication Methods Not Set Up" message', async ({ rulesApi, loginPage }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;

    await test.step('Step 1: Create a Password and Push rule via Rules Engine with mfa_needed set for push and UWL', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "authenticationMethods", value: ["push", "uwl"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ["push", "uwl"],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Create a Password and Push rule via Rules Engine with grant access decision', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "overlap" },
          { fact: "authenticationMethods", value: ["push", "uwl"], operator: "overlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'grant_access'
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 3: Create a Password rule via Rules Engine with mfa_needed set for password factor', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["password"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ['password'],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 4: Verify "No Authentication Methods Setup" Error Message in UI', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      await loginPage.verifyAuthenticationMethodSelection();
      await loginPage.verifyDoNotSetUpAuthMethodsIsDisplayed();
    });

  });
});

test.describe('Authentication Journey - Login with QR Code', () => {
  test('TC05 - Create login with QR code auth journey via Rules Engine and verify login success', async ({ rulesApi, adminApis, userMgmtApi, loginPage, runtimeConfig, page }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    let accessCode: string, sessionData: any, userInfo: any;

    await test.step('Step 1: Create a QR rule via Rules Engine with mfa_needed set for QR and UWL', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["qr", "uwl"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ["qr", "uwl"],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Create a QR rule via Rules Engine with grant access decision', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["qr", "uwl"], operator: "overlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'grant_access'
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 3: API - Fetch user info to link device', async () => {
      Logger.log('API', 'STEP 3', `Fetching user information for user: ${testUser} ...`);
      userInfo = await userMgmtApi.fetchUserInfo(testUser);
      Logger.log('API', 'INFO', `Fetched user info for: ${testUser}`);
    });

    await test.step('Step 4: API - Create Access Code', async () => {
      Logger.log('API', 'STEP 4', `Generating OTP for user: ${testUser} to simulate backend OTP generation...`);
      accessCode = await adminApis.createAccessCode();
    });

    await test.step('Step 5: API - Redeem code to Link device', async () => {
      Logger.log('API', 'STEP 5', `Redeeming code to link device for user: ${testUser} to simulate backend generation...`);
      await adminApis.redeemAccessCode(testUser, accessCode);
      Logger.log('SUCCESS', `Successfully redeemed code and linked device for user: ${testUser}`);
    });

    await test.step('Step 6: Verify user authentication journey in UI with QR code is displayed', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.verifyQRCodeSignInScreen();
      const { sessionID, publicKey } = await loginPage.getQRSessionData();
      runtimeConfig.sessionId = sessionID;
      runtimeConfig.sessionPublicKey = publicKey;
      Logger.log('SUCCESS', `Stored session configurations in active runtime state.`);
      sessionData = await adminApis.authenticateSession(testUser, 'qr');
      expect(sessionData).toBeDefined();
      Logger.log('SUCCESS', `QR session authentication successful.`);
      await loginPage.verifyLoginSuccess('User');
      await loginPage.logout(testUser);
    });

    await test.step('Step 7: API - Unlink user device', async () => {
      const communityId = runtimeConfig.communityId;
      const userJwt = await page.evaluate((cid) => window.localStorage.getItem(`${cid}_token`), communityId);
      expect(userJwt).toBeDefined();

      Logger.log('API', 'INFO', `Unlinking user device using basic user's own JWT...`);
      const unlinkRes = await adminApis.unlinkUserDevice(testUser, userJwt!);
      expect(unlinkRes.status).toBe(200);
      expect(unlinkRes.data.message).toBeDefined();
    });
  });

  test('TC06 - Create login with QR code auth journey via Rules Engine and verify "Authentication Methods Not Set Up" message', async ({ rulesApi, loginPage }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;

    await test.step('Step 1: Create a QR rule via Rules Engine with mfa_needed set for QR and UWL', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["qr", "uwl"], operator: "nooverlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'mfa_needed',
        mfaFactors: ["qr", "uwl"],
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Create a QR rule via Rules Engine with grant access decision', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        conditions: [
          { fact: "authenticationMethods", value: ["qr", "uwl"], operator: "overlap" },
          { fact: "username", value: [testUser], operator: "in" }
        ],
        decision: 'grant_access'
      });
      const response = await rulesApi.createRule(ruleBody);

      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 3: Verify "No Authentication Methods Setup" Error Message in UI', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.verifyAuthenticationMethodSelection();
      await loginPage.verifyDoNotSetUpAuthMethodsIsDisplayed();
    });

  });
});

test.describe('Authentication Journey - Deny Access', () => {
  test('TC07 - Create deny access rule via Rules Engine and verify login failure', async ({ loginPage, rulesApi }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;

    await test.step('Step 1: Create a deny access rule via Rules Engine', async () => {
      const ruleBody = rulesApi.createDynamicBodyRule({
        username: testUser,
        decision: 'deny_access',
        conditions: [
          { fact: "username", value: [testUser], operator: "in" }
        ]
      });
      const response = await rulesApi.createRule(ruleBody);
      expect(response.data._id).toBeDefined();
      expect(response.status).toBe(201);
      ruleIds.push(response.data._id!);
    });

    await test.step('Step 2: Verify access is denied in UI', async () => {
      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.verifyAccessDenied();
    });
  });
});

test.afterEach(async ({ rulesApi }: any) => {
  if (ruleIds.length > 0) {
    Logger.log('API', 'RULE_DELETION', `Deleting Rules: ${ruleIds.join(', ')}`);
    const deleteResponse = await rulesApi.deleteRule(ruleIds);
    for (const response of deleteResponse) {
      expect(response.status).toBe(200);
      expect(response.data.code).toBe(200);
      expect(response.data.message).toContain("Okay");
    }
    ruleIds = [];
  }
});