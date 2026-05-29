# Kosmos Playwright Framework

Reusable Playwright + TypeScript framework for tenant-scale authentication journey validation, featuring interactive HTML test execution reports via email and structured visual Allure reports.

## What this scaffold optimizes for

- **Reusable UI + API layers**: Keep auth-journey specs readable by encapsulating interactions in page objects and API helpers.
- **Tenant-aware config**: Seamless environment switches via `configs/.env`.
- **UI-based Cleanup**: Built-in flow (`homePage.ts`) to automatically unlink registered devices via UI dashboard post-authentication.
- **Automated Email Reports**: Custom reporter that emails results with inline failure screenshots and a compressed Allure report attachment.
- **Reliable failure artifacts**: Captures traces, screenshots, and videos on test failures.

## Project Layout

```text
configs/
  .env          Tenant and credentials configuration
  smtp.json     SMTP server and email recipient configurations
src/
  api/          API clients for user and auth-journey setup
  config/       Runtime and tenant config loading (runtimeConfig.ts)
  fixtures/     Shared Playwright fixtures (testFixtures.ts)
  pages/        UI page objects (basePage.ts, loginPage.ts, homePage.ts)
  utils/        Email reporter (emailReporter.ts), logger, and helpers
tests/
  auth/         Authentication journey specs
```

## Setup

1. **Install dependencies**:
   ```powershell
   npm install
   ```

2. **Configure environment variable file** at `configs/.env`:
   ```ini
   DNS=your-tenant-dns
   COMMUNITY_NAME=your-community
   LICENSE_KEY=your-license-key
   PRIVATE_KEY=your-private-key
   PUBLIC_KEY=your-public-key
   ADMIN_USERNAME=your-admin-user
   ADMIN_PASSWORD=your-admin-pass
   ADMIN_EMAIL=your-admin-email
   BASIC_USERNAME=your-basic-user
   DB_AUTH_MODULE=your-db-auth-module-id
   CLIENT_TENANT_TAG=your-client-tenant-tag
   ```

3. **Configure email reporting** at `configs/smtp.json`:
   ```json
   {
     "SEND_EMAIL_REPORTS": true,
     "SEND_CONDITION": "always", // "always", "on-failure", or "on-success"
     "SMTP_HOST": "smtp.gmail.com",
     "SMTP_PORT": 587,
     "SMTP_SECURE": false,
     "SMTP_USER": "your-smtp-email@example.com",
     "SMTP_PASS": "your-app-specific-password",
     "SMTP_FROM": "1Kosmos Test Runner <noreply@1kosmos.net>",
     "SMTP_TO": ["recipient1@example.com"]
   }
   ```

## Execution Commands

* **Run all tests**:
  ```powershell
  npm test
  ```

* **Run authentication tests only**:
  ```powershell
  npm run test:auth
  ```

* **Run tests and launch Allure report**:
  ```powershell
  npm run test:allure
  ```

* **Allure CLI operations**:
  ```powershell
  # Generate Allure HTML report from current results
  npm run allure:generate

  # Open the generated Allure report
  npm run allure:open

  # Serve Allure results directly on localhost:8080
  npm run allure:serve
  ```

## Implementation Details

### Email Reporter & Allure Compressor
The project integrates a custom Playwright reporter at `src/utils/emailReporter.ts`. When a test run finishes:
1. It reads the test outcomes (Passed, Failed, Skipped).
2. It compiles a modern, responsive HTML body detailing statistics and step execution.
3. For any failures, it strips terminal ANSI color codes and embeds the captured **failure screenshot inline** in the email body.
4. It programmatically generates a single-file Allure HTML report, compresses it into a `.zip` file (usually reducing size by ~50% to stay under SMTP/Gmail limits), and attaches it to the email.
5. Sends the email using the configured SMTP server settings in `configs/smtp.json`.

### UI-Based Device Cleanup
To prevent account lockouts or pollution across repeated test runs:
* Tests that link a device (like Push and QR authentication flows) utilize `homePage.ts` to navigate to the **Login Options** tab on the user's dashboard.
* It identifies the registered device and triggers the UI deletion flow, clean-unlinking the device, followed by a user logout.

