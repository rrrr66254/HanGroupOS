import { test, expect } from '@playwright/test'

// Helper: login before each test
async function login(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.fill('input[placeholder="username"]', 'admin')
  await page.fill('input[placeholder="password"]', 'admin1234')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 10_000 })
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should display stat cards', async ({ page }) => {
    // Dashboard should have stat cards visible
    await expect(page.locator('[class*="card"], [class*="stat"]').first()).toBeVisible({ timeout: 5_000 })
  })

  test('should have working sidebar navigation', async ({ page }) => {
    // Click on companies link in sidebar
    const companiesLink = page.locator('a[href="/companies"]')
    await expect(companiesLink).toBeVisible()
    await companiesLink.click()
    await expect(page).toHaveURL(/companies/)
  })

  test('should navigate to chairman page', async ({ page }) => {
    const chairmanLink = page.locator('a[href="/chairman"]')
    await expect(chairmanLink).toBeVisible()
    await chairmanLink.click()
    await expect(page).toHaveURL(/chairman/)
  })

  test('should navigate to approvals page', async ({ page }) => {
    const approvalsLink = page.locator('a[href="/approvals"]')
    await expect(approvalsLink).toBeVisible()
    await approvalsLink.click()
    await expect(page).toHaveURL(/approvals/)
  })
})
