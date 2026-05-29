# 🛡️ Kosmos Playwright Framework

[![Playwright Version](https://img.shields.io/badge/playwright-v1.54.0-blue)](https://playwright.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.8-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red)](#)

A reusable Playwright + TypeScript test automation framework designed for tenant-scale authentication journey validation. Features automated, visually rich email notifications containing inline failure screenshots and compressed Allure reports.

---

## ✨ Features

* **Tenant-Aware Configurations**: Run tests dynamically across different environments and brands using `configs/.env`.
* **Automated Email Reports**: Custom reporter emails test summaries with inline failure screenshots and a compressed Allure report attachment.
* **Auto-Cleanup via UI**: Automatically logs in, registers, validates, and cleanses (unlinks) registered devices on the dashboard to prevent account pollution.
* **Failure Diagnostics**: Automatically captures browser traces, network logs, page screenshots, and video recordings on failure.

---

## 📋 Prerequisites

Before setting up, ensure you have the following installed:
* **Node.js** (v18 or higher)
* **Allure CLI** (Optional, for generating local test reports: `npm install -g allure-commandline`)

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
npm install
npx playwright install
```

### 2. Configure Environment Variables (`configs/.env`)
Create a `.env` file under the `configs/` directory:
```ini
DNS=your-tenant-dns.1kosmos.net
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

### 3. Configure SMTP Settings (`configs/smtp.json`)
Create an `smtp.json` file under `configs/` to route execution reports:
```json
{
  "SEND_EMAIL_REPORTS": true,
  "SEND_CONDITION": "always", 
  "SMTP_HOST": "smtp.gmail.com",
  "SMTP_PORT": 587,
  "SMTP_SECURE": false,
  "SMTP_USER": "your-email@example.com",
  "SMTP_PASS": "your-app-password",
  "SMTP_FROM": "1Kosmos Test Runner <noreply@1kosmos.net>",
  "SMTP_TO": ["team@example.com"]
}
```

> [!IMPORTANT]
> Both `configs/.env` and `configs/smtp.json` contain sensitive keys and credentials. They are locally configured in `.gitignore` and **must never be committed** to the remote repository.

---

## 📂 Project Structure

```text
configs/      # Environment & SMTP server configurations
src/
  api/        # API clients for pre-test setup and authentication
  config/     # Environment-specific configuration loaders
  fixtures/   # Custom Playwright fixtures (homePage, loginPage, etc.)
  pages/      # Page Object Models (POMs) representing the application UI
  utils/      # Custom reporters, loggers, and general helper scripts
tests/
  auth/       # Multi-tenant authentication journey specs
```

---

## 🚀 Execution Commands

* **Run all tests (Headless)**: 
  ```bash
  npm test
  ```
* **Run Auth specs only**: 
  ```bash
  npm run test:auth
  ```
* **Run tests & generate Allure Report**: 
  ```bash
  npm run test:allure
  ```
* **Start local Allure server**: 
  ```bash
  npm run allure:serve
  ```

---

## 🌐 CI/CD Integration

To run this framework in CI/CD pipelines (e.g., GitHub Actions), secrets can be injected directly into the environment:

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run E2E Tests
  run: npm test
  env:
    DNS: ${{ secrets.TENANT_DNS }}
    COMMUNITY_NAME: ${{ secrets.COMMUNITY_NAME }}
    ADMIN_USERNAME: ${{ secrets.ADMIN_USERNAME }}
    ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
    SMTP_USER: ${{ secrets.SMTP_USER }}
    SMTP_PASS: ${{ secrets.SMTP_PASS }}
```


