import { test, expect } from '@playwright/test'

// 로그인 후 토큰 가져오기
async function getAuthToken(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const form = new URLSearchParams()
  form.append('username', 'admin')
  form.append('password', 'admin1234')
  const res = await request.post('/api/auth/login', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: form.toString(),
  })
  const body = await res.json()
  return body.access_token
}

test.describe('Exchange Rate API', () => {
  let token: string

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request)
  })

  test('should return exchange rates', async ({ request }) => {
    const res = await request.get('/api/financial/exchange-rates', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.base).toBeDefined()
    expect(body.rates).toBeDefined()
    // 폴백 환율이라도 반환되어야 함
    expect(Object.keys(body.rates).length).toBeGreaterThan(0)
  })

  test('should convert currency', async ({ request }) => {
    const res = await request.post('/api/financial/convert', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { amount: 1000000, from: 'KRW', to: 'USD' },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.amount).toBe(1000000)
    expect(body.from).toBe('KRW')
    expect(body.to).toBe('USD')
    // result는 숫자이거나 null (환율 조회 실패)
    if (body.result !== null) {
      expect(body.result).toBeGreaterThan(0)
      expect(body.rate).toBeGreaterThan(0)
    }
  })

  test('should handle zero amount conversion', async ({ request }) => {
    const res = await request.post('/api/financial/convert', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { amount: 0, from: 'KRW', to: 'USD' },
    })
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.result).toBe(0)
  })
})
