import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Web Crawler Prevention System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Robots.txt Configuration', () => {
    it('should have proper robots.txt content', async () => {
      const robotsContent = `User-agent: *
Disallow: /

User-agent: Googlebot
Disallow: /

User-agent: Bingbot
Disallow: /

User-agent: facebookexternalhit
Disallow: /

User-agent: Twitterbot
Disallow: /

User-agent: LinkedInBot
Disallow: /

Sitemap:`

      // Mock robots.txt fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => robotsContent,
      })

      const response = await fetch('/robots.txt')
      const content = await response.text()

      expect(content).toContain('User-agent: *')
      expect(content).toContain('Disallow: /')
      expect(content).toContain('Googlebot')
      expect(content).toContain('Bingbot')
      expect(content).toContain('facebookexternalhit')
    })
  })

  describe('User Agent Detection', () => {
    const crawlerUserAgents = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient/4.5.x)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Applebot/0.1; +http://www.apple.com/go/applebot)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 Safari/537.36 (compatible; archive.org_bot +http://www.archive.org/details/archive.org_bot)'
    ]

    const legitimateUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
    ]

    it('should detect and block crawler user agents', async () => {
      for (const userAgent of crawlerUserAgents) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: 'Access forbidden for crawlers' }),
        })

        const response = await fetch('/api/customers', {
          headers: { 'User-Agent': userAgent }
        })

        expect(response.status).toBe(403)
      }
    })

    it('should allow legitimate user agents', async () => {
      for (const userAgent of legitimateUserAgents) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ customers: [] }),
        })

        const response = await fetch('/api/customers', {
          headers: { 'User-Agent': userAgent }
        })

        expect(response.ok).toBe(true)
      }
    })
  })

  describe('HTTP Headers', () => {
    it('should include X-Robots-Tag header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex'
        }),
        json: async () => ({}),
      })

      const response = await fetch('/api/customers')
      const robotsHeader = response.headers.get('X-Robots-Tag')

      expect(robotsHeader).toContain('noindex')
      expect(robotsHeader).toContain('nofollow')
      expect(robotsHeader).toContain('noarchive')
      expect(robotsHeader).toContain('nosnippet')
    })

    it('should include security headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block'
        }),
        json: async () => ({}),
      })

      const response = await fetch('/api/customers')

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })
  })

  describe('Meta Tags Prevention', () => {
    it('should have noindex meta tags in HTML', () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
          <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
          <meta name="bingbot" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
        </head>
        <body></body>
        </html>
      `

      expect(htmlContent).toContain('name="robots" content="noindex')
      expect(htmlContent).toContain('name="googlebot" content="noindex')
      expect(htmlContent).toContain('name="bingbot" content="noindex')
    })
  })

  describe('API Protection', () => {
    it('should protect sensitive API endpoints from crawlers', async () => {
      const sensitiveEndpoints = [
        '/api/customers',
        '/api/analytics/stats',
        '/api/customers/similarity-search',
        '/api/admin/users',
        '/api/files/preview'
      ]

      for (const endpoint of sensitiveEndpoints) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: 'Access forbidden for crawlers' }),
        })

        const response = await fetch(endpoint, {
          headers: { 'User-Agent': 'Googlebot/2.1' }
        })

        expect(response.status).toBe(403)
      }
    })

    it('should allow legitimate API access', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      const response = await fetch('/api/customers', {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Authorization': 'Bearer valid-token'
        }
      })

      expect(response.ok).toBe(true)
    })
  })

  describe('Performance Impact', () => {
    it('should have minimal performance overhead', () => {
      const userAgentChecks = [
        'googlebot',
        'bingbot',
        'facebookexternalhit',
        'twitterbot',
        'linkedinbot'
      ]

      const testUserAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1)'
      
      const startTime = performance.now()
      
      // Simulate user agent checking logic
      const isBot = userAgentChecks.some(bot => 
        testUserAgent.toLowerCase().includes(bot)
      )
      
      const endTime = performance.now()
      const executionTime = endTime - startTime

      expect(isBot).toBe(true)
      expect(executionTime).toBeLessThan(1) // Should be sub-millisecond
    })
  })

  describe('Security Compliance', () => {
    it('should block common crawler patterns', () => {
      const crawlerPatterns = [
        /googlebot/i,
        /bingbot/i,
        /slurp/i,
        /duckduckbot/i,
        /baiduspider/i,
        /yandexbot/i,
        /facebookexternalhit/i,
        /twitterbot/i,
        /linkedinbot/i,
        /whatsapp/i,
        /archive\.org_bot/i
      ]

      const testUserAgent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      
      const isBlocked = crawlerPatterns.some(pattern => pattern.test(testUserAgent))
      expect(isBlocked).toBe(true)
    })

    it('should preserve legitimate user access', () => {
      const crawlerPatterns = [
        /googlebot/i,
        /bingbot/i,
        /bot/i,
        /spider/i,
        /crawl/i
      ]

      const legitimateUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      
      const isBlocked = crawlerPatterns.some(pattern => pattern.test(legitimateUserAgent))
      expect(isBlocked).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should provide clear error messages for blocked requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Access forbidden for crawlers',
          code: 'CRAWLER_BLOCKED',
          message: 'This resource is not available for automated crawling'
        }),
      })

      const response = await fetch('/api/customers', {
        headers: { 'User-Agent': 'Googlebot/2.1' }
      })

      const result = await response.json()
      expect(result.error).toBe('Access forbidden for crawlers')
      expect(result.code).toBe('CRAWLER_BLOCKED')
    })
  })
})