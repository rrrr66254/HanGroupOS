import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.fill('input[placeholder="username"]', 'admin')
  await page.fill('input[placeholder="password"]', 'admin1234')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 10_000 })
}

test.describe('Chairman Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/chairman')
  })

  test('should display executive list', async ({ page }) => {
    // Should have at least the chairman executive card
    await expect(page.locator('[class*="cursor-pointer"]').first()).toBeVisible({ timeout: 8_000 })
  })

  test('should select chairman and show chat area', async ({ page }) => {
    // Click on the first executive card (chairman)
    const firstExec = page.locator('[class*="cursor-pointer"]').first()
    await expect(firstExec).toBeVisible({ timeout: 8_000 })
    await firstExec.click()

    // Chat input should appear
    await expect(
      page.locator('textarea, input[type="text"]').last()
    ).toBeVisible({ timeout: 5_000 })
  })
})
