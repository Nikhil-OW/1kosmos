import type { Page } from '@playwright/test';
import { RulesApi } from '../../src/api/rulesApi';
import type { RuntimeConfig } from '../../src/config/runtimeConfig';
import { test, expect } from '../../src/fixtures/testFixtures';
import { BasePage } from '@pages/basePage';
import { LoginPage } from '@pages/loginPage';
import { UserMgmtApi } from '@api/userMgmtApi';
import { DataGenerator } from '@utils/dataGenerator';
import { Logger } from '@utils/logger';
import { afterEach } from 'node:test';
import { AdminApis } from '@api/adminApis';
import { AnyARecord } from 'node:dns';

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
  test('TC01 - Create password-only auth journey and verify login success with password', async ({ rulesApi, runtimeConfig, browser }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    await test.step('Step 1: Create password-only rule via Rules Engine with grant access', async () => {
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

    await test.step('Step 2: Create password-only rule via Rules Engine with mfa needed for allowed factors as password', async () => {
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
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
      const page = await context.newPage();
      const loginPage = new LoginPage(page, runtimeConfig);

      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      await loginPage.verifyLoginSuccess('User');
      await loginPage.logout(testUser);

      await page.close();
      await context.close();
    });
  });

});

test.describe('Authentication Journey - Password with Email OTP', () => {
  test('TC02 - Create password with email OTP auth journey and verify login success with password', async ({ rulesApi, adminApis, runtimeConfig, browser }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    let initialJwt: string, capturedOtp: string, finalAuthenticatedJwt: string | AnyARecord;

    await test.step('Step 1: Create a Password and Email OTP rule via the Rules Engine with mfa_needed set for the required factor: email_otp', async () => {
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

    await test.step('Step 2: Create a Password and Email OTP rule via the Rules Engine with grant access decision', async () => {
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

    await test.step('Step 3: Create a Password and Email OTP rule via the Rules Engine with mfa_needed set for the required factor: password', async () => {
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
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
      const page = await context.newPage();
      const loginPage = new LoginPage(page, runtimeConfig);

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

      await page.close();
      await context.close();
    });
  });
});

test.describe('Authentication Journey - Login with Push', () => {
  test('TC03 - Create login with password and push notification auth journey via Rules Engine and verify authentication via API', async ({ rulesApi, adminApis, userMgmtApi, loginPage, page }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    let accessCode: string, sessionId: string, initialJwt: string;
    let userInfo: any, sessionData: any;
    let finalAuthenticatedJwt: string;

    await test.step('Step 1: Create a rule via Rules Engine to demand password factor initially', async () => {
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

    await test.step('Step 2: Create a rule via Rules Engine to demand Push notification after password completion', async () => {
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
      userInfo = await userMgmtApi.fetchUserInfo(testUser);
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

    // await test.step('Step 7: API - Create push session', async () => {
    //   Logger.log('API', 'STEP 7', `Submitting password credentials for user: ${testUser} to obtain initial JWT...`);
    //   const response = await adminApis.authenticateWithPasswordForInitialJWT(testUser);
    //   expect(response.jwt, 'Initial JWT should not be undefined').toBeDefined();
    //   expect(response.jwt.length, 'Initial JWT should be a valid string').toBeGreaterThan(10);
    //   initialJwt = response.jwt;
    //   Logger.log('API', 'INFO', `Initial JWT obtained: ${initialJwt.substring(0, 30)}...`);
    //   Logger.log('API', 'STEP 7', `Initiating push session creation workflow for user: ${testUser}...`);
    //   sessionId = await adminApis.createAuthenticationSession(testUser, 'push');
    //   expect(sessionId).toBeDefined();
    //   Logger.log('SUCCESS', `Push session initialization complete. Session ID: ${sessionId}`);
    // });

    // await test.step('Step 8: API - Authenticate push session to accept', async () => {
    //   Logger.log('API', 'STEP 8', `Dispatching push notification authentication accept payloads...`);
    //   sessionData = await adminApis.authenticateSession(testUser);
    //   expect(sessionData).toBeDefined();
    //   Logger.log('SUCCESS', `Push session authentication payload accepted successfully.`);
    // });

    // await test.step('Step 9: API - Poll request access to get JWT', async () => {
    //   Logger.log('API', 'STEP 9', `Starting request_access token exchange polling pipeline loop...`);
    //   finalAuthenticatedJwt = await adminApis.pollRequestAccess(10, initialJwt);
    //   expect(finalAuthenticatedJwt).toBeDefined();
    //   Logger.log('SUCCESS', `Polling workflow finalized. Target Authenticated JWT securely obtained.`);
    // });

    await test.step('Step 10 - Verify user authentication journey in UI with Push notification is displayed', async () => {

      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      await loginPage.verifyPushNotificationSignInScreen();
      const sessiondata = await adminApis.interceptAndApproveUiSession(page, testUser, 'push');
      console.log("jsdvhjcdvs &&&&&&&&&&&&&&&&&& ", sessiondata);

    });

  });

  test('TC04 - Create login with password and push notification auth journey via Rules Engine and Verify the Authentication Methods Not Set Up message.', async ({ rulesApi, adminApis, userMgmtApi, runtimeConfig, browser }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    await test.step('Step 1: Create a Password and Push rule via the Rules Engine with mfa_needed set for the required factor: push and uwl', async () => {
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

    await test.step('Step 2: Create a Password and Push rule via the Rules Engine with grant access decision', async () => {
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

    await test.step('Step 3: Create a Password rule via the Rules Engine with mfa_needed set for the required factor: password', async () => {
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
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
      const page = await context.newPage();
      const loginPage = new LoginPage(page, runtimeConfig);

      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.submitPassword(userPassword);
      await loginPage.verifyAuthenticationMethodSelection();
      await loginPage.verifyDoNotSetUpAuthMethodsIsDisplayed();

      await page.close();
      await context.close();
    });

  });
});

test.describe('Authentication Journey - Login with QR Code', () => {
  test('TC05 - Create login with QR code auth journey and verify login success', async ({ rulesApi, adminApis, userMgmtApi, browser, runtimeConfig }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    let accessCode: string, sessionData: any, userInfo: any;

    await test.step('Step 1: Create a QR rule via the Rules Engine with mfa_needed set for the required factor: qr and uwl', async () => {
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

    await test.step('Step 2: Create a QR rule via the Rules Engine with grant access decision', async () => {
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

    await test.step('Step 9: Verify user authentication journey in UI with QR Code is displayed', async () => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
      const page = await context.newPage();
      const loginPage = new LoginPage(page, runtimeConfig);

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

      await page.close();
      await context.close();
    });

  });

  test('TC06 - Create login with QR code auth journey via Rules Engine and Verify the Authentication Methods Not Set Up message.', async ({ rulesApi, browser, runtimeConfig }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    await test.step('Step 1: Create a QR rule via the Rules Engine with mfa_needed set for the required factor: qr and uwl', async () => {
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

    await test.step('Step 2: Create a QR rule via the Rules Engine with grant access decision', async () => {
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
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
      const page = await context.newPage();
      const loginPage = new LoginPage(page, runtimeConfig);

      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.verifyAuthenticationMethodSelection();
      await loginPage.verifyDoNotSetUpAuthMethodsIsDisplayed();

      await page.close();
      await context.close();
    });

  });
});

test.describe('Authentication Journey - Deny Access', () => {
  test('TC07 - Create deny access rule via Rules Engine and verify login failure', async ({ browser, runtimeConfig, rulesApi }: AuthJourneyFixtures) => {
    const randomUser = sharedUsers[Math.floor(Math.random() * sharedUsers.length)];
    const testUser = randomUser.username;
    await test.step('Step 1: Create deny access rule via Rules Engine', async () => {
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

    await test.step('Step 2: Verify rule creation in UI', async () => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
      const page = await context.newPage();
      const loginPage = new LoginPage(page, runtimeConfig);

      await loginPage.navigate();
      await loginPage.openSignInUsingUsername();
      await loginPage.submitUsername(testUser);
      await loginPage.verifyAccessDenied();

      await page.close();
      await context.close();
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