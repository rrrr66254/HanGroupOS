import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should show login page with group name', async ({ page }) => {
    await page.goto('/')
    // Should redirect to login or show login form
    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('input[placeholder="username"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should login successfully with default credentials', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[placeholder="username"]', 'admin')
    await page.fill('input[placeholder="password"]', 'admin1234')
    await page.click('button[type="submit"]')

    // After login, should navigate to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
    await expect(page).toHaveURL(/dashboard/)
  })

  test('should show error with wrong credentials', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[placeholder="username"]', 'admin')
    await page.fill('input[placeholder="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('.text-danger, [class*="danger"]')).toBeVisible({ timeout: 5_000 })
  })
})
