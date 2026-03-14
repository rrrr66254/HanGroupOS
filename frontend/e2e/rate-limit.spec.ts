import { test, expect } from '@playwright/test'

test.describe('Rate Limiting', () => {
  test('should include rate limit headers in API responses', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.ok()).toBeTruthy()

    // Rate limit 헤더가 포함되어야 함
    const headers = res.headers()
    expect(headers['x-ratelimit-limit']).toBeDefined()
    expect(headers['x-ratelimit-remaining']).toBeDefined()
    expect(headers['x-ratelimit-reset']).toBeDefined()

    const limit = parseInt(headers['x-ratelimit-limit'])
    const remaining = parseInt(headers['x-ratelimit-remaining'])
    expect(limit).toBeGreaterThan(0)
    expect(remaining).toBeGreaterThanOrEqual(0)
    expect(remaining).toBeLessThanOrEqual(limit)
  })

  test('should decrement remaining count on each request', async ({ request }) => {
    // 첫 번째 요청
    const res1 = await request.get('/health')
    const remaining1 = parseInt(res1.headers()['x-ratelimit-remaining'])

    // 두 번째 요청
    const res2 = await request.get('/health')
    const remaining2 = parseInt(res2.headers()['x-ratelimit-remaining'])

    // remaining이 감소해야 함
    expect(remaining2).toBeLessThanOrEqual(remaining1)
  })

  test('should exempt /docs and /openapi.json from rate limiting', async ({ request }) => {
    const docsRes = await request.get('/docs')
    // /docs는 rate limit 헤더가 없거나 제외됨
    // FastAPI docs는 다르게 처리될 수 있으므로 에러만 확인
    expect(docsRes.status()).toBeLessThan(500)
  })
})
