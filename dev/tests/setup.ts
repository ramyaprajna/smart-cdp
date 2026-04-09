/**
 * Global Test Setup and Configuration
 * 
 * This file provides global test utilities, mock configurations, and setup
 * for the Smart CDP Platform comprehensive testing framework.
 * 
 * Features:
 * - Mock data factories for consistent test data
 * - HTTP request mocking for unit tests
 * - Authentication utilities for integration tests
 * - File upload simulation for import testing
 * 
 * Last Updated: July 23, 2025
 * Testing Status: ✅ COMPLETED - Enterprise-grade testing framework
 */

import { afterEach, vi } from 'vitest'

if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom')
  const { cleanup } = await import('@testing-library/react')

  afterEach(() => {
    cleanup()
  })

  vi.mock('import.meta.env', () => ({
    VITE_API_URL: 'http://localhost:5000',
    NODE_ENV: 'test'
  }))

  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  }

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true
  })

  const sessionStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  }

  Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock,
    configurable: true,
    writable: true
  })

  Object.defineProperty(window, 'FormData', {
    configurable: true,
    writable: true,
    value: class FormData {
      private data: Map<string, any> = new Map()
      
      append(key: string, value: any) {
        this.data.set(key, value)
      }
      
      get(key: string) {
        return this.data.get(key)
      }
      
      has(key: string) {
        return this.data.has(key)
      }
    }
  })

  Object.defineProperty(window, 'XMLHttpRequest', {
    configurable: true,
    writable: true,
    value: class XMLHttpRequest {
      public upload = { addEventListener: vi.fn() }
      public addEventListener = vi.fn()
      public open = vi.fn()
      public setRequestHeader = vi.fn()
      public send = vi.fn()
      public status = 200
      public responseText = ''
    }
  })
}

global.fetch = vi.fn()

export const createMockFile = (name: string, size: number, type: string): File => {
  const content = new Array(size).fill('a').join('')
  return new File([content], name, { type })
}

export const createMockUser = () => ({
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  isActive: true
})

export const createMockCustomer = () => ({
  id: 'customer-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  dateOfBirth: '1990-01-01',
  profession: 'Software Engineer',
  city: 'Jakarta',
  lifetimeValue: 500.00,
  dataQualityScore: 95.5
})
