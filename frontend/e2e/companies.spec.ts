import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.fill('input[placeholder="username"]', 'admin')
  await page.fill('input[placeholder="password"]', 'admin1234')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 10_000 })
}

test.describe('Companies Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/companies')
  })

  test('should display companies page', async ({ page }) => {
    await expect(page).toHaveURL(/companies/)
    // Page should have loaded - check for "+" button or company list
    await page.waitForLoadState('networkidle')
  })

  test('should show new company creation button', async ({ page }) => {
    // Look for the "+" or "new company" button
    const createBtn = page.locator('button').filter({ has: page.locator('[class*="Plus"], svg') }).first()
    await expect(createBtn).toBeVisible({ timeout: 5_000 })
  })
})
