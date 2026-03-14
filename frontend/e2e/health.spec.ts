import { test, expect } from '@playwright/test'

test.describe('Health Check API', () => {
  test('should return basic health status', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.system).toBeTruthy()
    expect(body.version).toBeTruthy()
  })

  test('should return detailed health with ?detail=true', async ({ request }) => {
    const res = await request.get('/health?detail=true')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.status).toMatch(/ok|degraded/)
    expect(body.checks).toBeDefined()
    expect(body.checks.database).toBeDefined()
    expect(body.checks.ollama).toBeDefined()
    expect(body.checks.cache).toBeDefined()
    expect(body.checks.rate_limit).toBeDefined()
    expect(body.timestamp).toBeGreaterThan(0)
  })

  test('should include cache stats in detailed health', async ({ request }) => {
    const res = await request.get('/health?detail=true')
    const body = await res.json()

    const cache = body.checks.cache
    expect(cache.total_entries).toBeDefined()
    expect(cache.active_entries).toBeDefined()
  })

  test('should include rate limit stats', async ({ request }) => {
    const res = await request.get('/health?detail=true')
    const body = await res.json()

    const rl = body.checks.rate_limit
    expect(rl.active_clients).toBeDefined()
    expect(rl.tracked_requests_last_60s).toBeDefined()
  })
})
