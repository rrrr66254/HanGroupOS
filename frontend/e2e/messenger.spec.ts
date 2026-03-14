import { test, expect } from '@playwright/test'

// 로그인 헬퍼
async function login(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.fill('input[placeholder="username"]', 'admin')
  await page.fill('input[placeholder="password"]', 'admin1234')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 10_000 })
}

test.describe('Messenger', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should navigate to messenger page', async ({ page }) => {
    await page.click('a[href="/messenger"]')
    await expect(page).toHaveURL(/messenger/)
    // 메신저 헤더가 보여야 함
    await expect(page.getByText('메신저')).toBeVisible()
  })

  test('should show empty state when no rooms', async ({ page }) => {
    await page.goto('/messenger')
    // 빈 상태 또는 채팅방 목록이 보여야 함
    const emptyOrRooms = await page.locator('text=채팅방이 없습니다, text=새 채팅').first()
    await expect(emptyOrRooms).toBeVisible({ timeout: 5_000 })
  })

  test('should open create room modal', async ({ page }) => {
    await page.goto('/messenger')
    await page.click('button:has-text("새 채팅")')
    // 모달이 보여야 함
    await expect(page.getByText('새 채팅방')).toBeVisible()
    await expect(page.locator('input[placeholder="채팅방 이름"]')).toBeVisible()
  })

  test('should create a new chat room', async ({ page }) => {
    await page.goto('/messenger')
    await page.click('button:has-text("새 채팅")')
    await page.fill('input[placeholder="채팅방 이름"]', 'E2E 테스트 채팅방')
    await page.fill('input[placeholder*="설명"]', '자동 테스트용')
    await page.click('button:has-text("생성")')

    // 채팅방이 목록에 보여야 함
    await expect(page.getByText('E2E 테스트 채팅방')).toBeVisible({ timeout: 5_000 })
  })

  test('should send a message in chat room', async ({ page }) => {
    await page.goto('/messenger')

    // 채팅방 생성
    await page.click('button:has-text("새 채팅")')
    await page.fill('input[placeholder="채팅방 이름"]', '메시지 테스트방')
    await page.click('button:has-text("생성")')

    // 메시지 입력 및 전송
    await page.fill('input[placeholder="메시지를 입력하세요..."]', '안녕하세요! E2E 테스트입니다.')
    await page.click('button:has(svg.lucide-send)')

    // 메시지가 화면에 보여야 함
    await expect(page.getByText('안녕하세요! E2E 테스트입니다.')).toBeVisible({ timeout: 5_000 })
  })

  test('should show file upload button', async ({ page }) => {
    await page.goto('/messenger')

    // 채팅방 생성
    await page.click('button:has-text("새 채팅")')
    await page.fill('input[placeholder="채팅방 이름"]', '파일 테스트방')
    await page.click('button:has-text("생성")')

    // 파일 첨부 버튼이 보여야 함
    await expect(page.locator('button[title="파일 첨부"]')).toBeVisible()
  })
})
