import { expect, Page, Locator } from '@playwright/test';
import { RuntimeConfig } from '../config/runtimeConfig';
import { Logger } from '../utils/logger';
import { step } from "allure-js-commons";

export class BasePage {
    constructor(
        protected readonly page: Page,
        protected readonly config: RuntimeConfig
    ) { }

    async navigate(path: string = '') {
        const url = `${this.config.baseUrl}${path}`;
        await this.page.waitForTimeout(2000);
        await step(`Navigate to: ${url}`, async () => {
            Logger.log('UI', 'NAVIGATE', `Opening URL: ${url}`);
            await this.page.goto(url);
            await this.page.waitForLoadState('domcontentloaded');
        });
    }

    async click(element: Locator, elementName: string) {
        await step(`Clicking on: ${elementName}`, async () => {
            Logger.log('UI', 'CLICK', `Clicking on: ${elementName}`);
            try {
                await element.click();
                Logger.log('SUCCESS', `Clicked: ${elementName}`);
            } catch (error: any) {
                Logger.log('ERROR', `Failed to click ${elementName}: ${error.message}`);
                throw error;
            }
        });
    }

    async type(element: Locator, value: string, elementName: string) {
        await step(`Entering text into: ${elementName}`, async () => {
            Logger.log('UI', 'TYPE', `Entering text into ${elementName}`);
            try {
                await element.focus();
                await element.clear();
                await element.pressSequentially(value, { delay: 100 });
                Logger.log('SUCCESS', `Text entered into ${elementName}`);
            } catch (error: any) {
                Logger.log('ERROR', `Failed to type in ${elementName}: ${error.message}`);
                throw error;
            }
        });
    }

    async expectToBeVisible(element: Locator, elementName: string, timeout: number = 5000) {
        await step(`Asserting visibility: ${elementName}`, async () => {
            Logger.log('UI', 'ASSERT', `Verifying visibility of: ${elementName}`);
            try {
                await expect(element).toBeVisible({ timeout });
                Logger.log('SUCCESS', `Visibility confirmed for: ${elementName}`);
            } catch (error: any) {
                Logger.log('ERROR', `Assertion failed: ${elementName} is NOT visible`);
                throw error;
            }
        });
    }

    async isElementVisible(element: Locator, elementName: string): Promise<boolean> {
        return await step(`Checking visibility status: ${elementName}`, async () => {
            Logger.log('UI', 'CHECK', `Checking if ${elementName} is currently visible...`);
            try {
                const visible = await element.isVisible();
                Logger.log('UI', 'INFO', `${elementName} visibility status: ${visible}`);
                return visible;
            } catch (error: any) {
                Logger.log('ERROR', `Error during visibility check for ${elementName}: ${error.message}`);
                return false;
            }
        });
    }

    async expectTextToBeVisible(text: string | RegExp, elementName: string, exact: boolean = false, timeout: number = 5000) {
        await step(`Asserting text visibility: "${text}" on ${elementName}`, async () => {
            Logger.log('UI', 'ASSERT', `Verifying visibility of text: "${text}" for ${elementName}`);
            try {
                const locator = this.page.getByText(text, { exact });
                await expect(locator).toBeVisible({ timeout });
                Logger.log('SUCCESS', `Confirmed: "${text}" is visible for ${elementName}`);
            } catch (error: any) {
                Logger.log('ERROR', `Assertion failed: Could not find text "${text}" for ${elementName}`);
                throw error;
            }
        });
    }

    getTextLocator(text: string | RegExp, elementName: string, exact: boolean = false): Locator {
        Logger.log('UI', 'LOCATE', `Generating locator for ${elementName} with text: "${text}"`);
        return this.page.getByText(text, { exact });
    }

    async getTextFromLocator(locator: Locator, elementName: string): Promise<string> {
        Logger.log('UI', 'FETCH_TEXT', `Attempting to retrieve text from element: [${elementName}]`);
        try {
            await locator.waitFor({ state: 'attached', timeout: 5000 });
            const rawText = await locator.textContent();
            const cleanedText = rawText?.replace(/\n/g, '').trim() || '';
            Logger.log('SUCCESS', `Retrieved text for [${elementName}]: "${cleanedText}"`);
            return cleanedText;
        } catch (error) {
            Logger.log('ERROR', 'UI', `Failed to retrieve text from [${elementName}]`);
            throw error;
        }
    }

    async expectToHaveCount(element: Locator, expectedCount: number, elementName: string, timeout: number = 5000) {
        await step(`Asserting element count: ${elementName}`, async () => {
            Logger.log('UI', 'ASSERT', `Verifying count of ${elementName}. Expected: ${expectedCount}`);
            try {
                await expect(element).toHaveCount(expectedCount, { timeout });
                Logger.log('SUCCESS', `Count confirmation for ${elementName}: matches expected ${expectedCount}`);
            } catch (error: any) {
                Logger.log('ERROR', `Assertion failed: ${elementName} does NOT have a count of ${expectedCount}`);
                throw error;
            }
        });
    }

    async waitForSelector(element: Locator, elementName: string, timeout: number = 5000) {
        await step(`Waiting for element: ${elementName}`, async () => {
            Logger.log('UI', 'ACTION', `Waiting for presence of: ${elementName}`);
            try {
                await element.waitFor({ state: 'attached', timeout });
                Logger.log('SUCCESS', `Element is now present: ${elementName}`);
            } catch (error: any) {
                Logger.log('ERROR', `Timeout reached: ${elementName} did not appear within ${timeout}ms`);
                throw error;
            }
        });
    }

    async expectToHaveUrl(page: Page, expectedUrl: string | RegExp, pageName: string, timeout: number = 5000) {
        await step(`Asserting URL for: ${pageName}`, async () => {
            Logger.log('UI', 'ASSERT', `Verifying current URL matches: ${expectedUrl}`);
            try {
                await expect(page).toHaveURL(expectedUrl, { timeout });
                Logger.log('SUCCESS', `URL verification passed for ${pageName}. Current URL matches expected.`);
            } catch (error: any) {
                Logger.log('ERROR', `Assertion failed: URL does not match for ${pageName}. Expected: ${expectedUrl}, Actual: ${page.url()}`);
                throw error;
            }
        });
    }

    async expectToBeTrue(condition: boolean, description: string) {
        await step(`Asserting state: "${description}" is true`, async () => {
            Logger.log('UI', 'ASSERT', `Verifying condition for: [${description}]`);
            try {
                await expect(condition).toBe(true);
                Logger.log('SUCCESS', `Confirmed: [${description}] evaluated to true.`);
            } catch (error: any) {
                Logger.log('ERROR', `Assertion failed: [${description}] is false`);
                throw error;
            }
        });
    }

    async expectElementToContainText(element: Locator, expectedText: string, elementName: string, ignoreCase: boolean = true, timeout: number = 5000) {
        await step(`Asserting text containment: "${expectedText}" inside ${elementName}`, async () => {
            Logger.log('UI', 'ASSERT', `Verifying if ${elementName} contains substring: "${expectedText}"`);
            try {
                await expect(element).toContainText(expectedText, { ignoreCase, timeout });
                Logger.log('SUCCESS', `Confirmed: ${elementName} successfully contains text: "${expectedText}"`);
            } catch (error: any) {
                Logger.log('ERROR', `Assertion failed: ${elementName} does not contain text "${expectedText}". Error: ${error.message}`);
                throw error;
            }
        });
    }

    async getAttributeValue(element: Locator, attributeName: string, elementName: string, timeout: number = 5000): Promise<string> {
        return await step(`Fetching attribute "${attributeName}" from: ${elementName}`, async () => {
            Logger.log('UI', 'FETCH_ATTRIBUTE', `Attempting to retrieve "${attributeName}" from [${elementName}]`);
            try {
                await element.waitFor({ state: 'attached', timeout });
                const attributeValue = await element.getAttribute(attributeName);
                const result = attributeValue?.trim() || '';
                Logger.log('SUCCESS', `Retrieved attribute "${attributeName}" for [${elementName}]: "${result}"`);
                return result;
            } catch (error: any) {
                Logger.log('ERROR', `Failed to retrieve attribute "${attributeName}" from [${elementName}]: ${error.message}`);
                throw error;
            }
        });
    }
}