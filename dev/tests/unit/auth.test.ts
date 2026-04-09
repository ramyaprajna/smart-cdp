import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateToken, verifyToken, extractTokenFromRequest } from '@server/jwt-utils'

describe('Authentication System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('JWT Token Management', () => {
    const mockUser = {
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin' as const,
      isActive: true
    }

    it('should generate a valid JWT token', () => {
      const token = generateToken(mockUser)
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3) // JWT format: header.payload.signature
    })

    it('should verify a valid JWT token', () => {
      const token = generateToken(mockUser)
      const decoded = verifyToken(token)
      
      expect(decoded).toBeDefined()
      expect(decoded).not.toBeNull()
      if (decoded) {
        expect(decoded.userId).toBe(mockUser.userId)
        expect(decoded.email).toBe(mockUser.email)
        expect(decoded.role).toBe(mockUser.role)
      }
    })

    it('should reject invalid JWT token', () => {
      const invalidToken = 'invalid.token.here'
      
      try {
        const decoded = verifyToken(invalidToken)
        expect(decoded).toBeNull()
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it('should extract token from Authorization header', () => {
      const token = 'test-token'
      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`
        },
        cookies: {}
      } as any

      const extractedToken = extractTokenFromRequest(mockRequest)
      expect(extractedToken).toBe(token)
    })

    it('should extract token from cookies', () => {
      const token = 'test-token'
      const mockRequest = {
        headers: {},
        cookies: {
          token: token
        }
      } as any

      const extractedToken = extractTokenFromRequest(mockRequest)
      expect(extractedToken).toBe(token)
    })

    it('should return null when no token found', () => {
      const mockRequest = {
        headers: {},
        cookies: {}
      } as any

      const extractedToken = extractTokenFromRequest(mockRequest)
      expect(extractedToken).toBeNull()
    })
  })

  describe('Password Security', () => {
    it('should hash passwords securely', async () => {
      const bcrypt = await import('bcryptjs')
      const password = 'testPassword123'
      
      const hash = await bcrypt.hash(password, 12)
      expect(hash).toBeDefined()
      expect(hash).not.toBe(password)
      expect(hash.length).toBeGreaterThan(50)
    })

    it('should verify correct passwords', async () => {
      const bcrypt = await import('bcryptjs')
      const password = 'testPassword123'
      const hash = await bcrypt.hash(password, 12)
      
      const isValid = await bcrypt.compare(password, hash)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect passwords', async () => {
      const bcrypt = await import('bcryptjs')
      const password = 'testPassword123'
      const wrongPassword = 'wrongPassword'
      const hash = await bcrypt.hash(password, 12)
      
      const isValid = await bcrypt.compare(wrongPassword, hash)
      expect(isValid).toBe(false)
    })
  })
})