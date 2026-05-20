# Kosmos Playwright Framework

Reusable Playwright + TypeScript framework for tenant-scale authentication journey validation.

## What this scaffold optimizes for

- Reusable UI + API layers so auth-journey specs stay readable.
- Tenant-aware config through `.env`.
- Reliable failure artifacts with trace, screenshot, and video retention.
- Clear separation between seeding, page actions, and assertions.

## Project layout

```text
src/
  api/        API clients for user and auth-journey setup
  config/     Runtime and tenant config loading
  fixtures/   Shared Playwright fixtures
  pages/      UI page objects
  utils/      Polling and auth helpers
tests/
  auth/       Authentication journey specs
```

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Create `.env` from `.env.example` and fill tenant, admin, and `testuser1` values.

## Run

```powershell
npm test
```

```powershell
npm run test:auth
```

## Notes

- The API paths in `src/api/authApi.ts` are intentionally centralized placeholders. Update them once to match your platform contracts.
- The page objects use resilient role/label-based locators, but you should tune labels in `src/pages/` to the exact UI text your product exposes.
