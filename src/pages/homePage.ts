import { expect, type Locator, type Page } from '@playwright/test';
import type { RuntimeConfig } from '@config/runtimeConfig';
import { BasePage } from './basePage';
import { Logger } from '@utils/logger';

export class HomePage extends BasePage {
  readonly lblLoginoptionsTab: Locator;
  readonly lblLinkedDevice: Locator;
  readonly btnDeleteOption: Locator;

  constructor(page: Page, config: RuntimeConfig) {
    super(page, config);
    this.lblLoginoptionsTab = page.locator("//*[text()='Login Options']");
    this.lblLinkedDevice = page.locator("table[aria-label='sticky table'] tr h4");
    this.btnDeleteOption = page.locator("table[aria-label='sticky table'] tr td").last();
  }

  async navigateToLoginoptionsTab() {
    Logger.log('UI', 'ACTION', 'Opening login options');
    await this.click(this.lblLoginoptionsTab, 'Login options Tab');
    await this.expectToHaveUrl(this.page, /loginOptions/, 'Login options Page');
  }

  async deleteLinkedDevice() {
    Logger.log('UI', 'ACTION', 'Deleting linked device');
    const isVisible = await this.isElementVisible(this.lblLinkedDevice, 'Linked device type');
    if (isVisible) {
      await this.click(this.btnDeleteOption, 'Delete linked device');
    }
  }

}