import { z } from 'zod'

// Type for error objects that can come from API responses
export interface ApiError {
  error?: string
  message?: string
  code?: string
  status?: number
  details?: string[]
}

// Generate user-friendly error messages from API errors
export function getErrorMessage(error: any): string {
  // If error has a custom message, use it
  if (error?.message) {
    return error.message
  }

  // Handle specific error codes
  if (error?.code) {
    switch (error.code) {
      case 'FILE_TOO_LARGE':
        return 'File is too large. Please choose a smaller file.'
      case 'UNSUPPORTED_FORMAT':
        return 'File format not supported. Please use Excel, CSV, TXT, or DOCX files.'
      case 'VALIDATION_ERROR':
        return 'Data validation failed. Please review your data and try again.'
      case 'AUTHENTICATION_ERROR':
        return 'Authentication failed. Please log in again.'
      case 'PERMISSION_DENIED':
        return 'You don\'t have permission to perform this action.'
      case 'CRAWLER_BLOCKED':
        return 'Access forbidden for automated crawlers.'
      case 'FILE_PARSING_ERROR':
        return 'Unable to parse file. Please check the file format and try again.'
      default:
        return 'An unexpected error occurred'
    }
  }

  // Handle HTTP status codes
  if (error?.status) {
    switch (error.status) {
      case 400:
        return 'Invalid request. Please check your input and try again.'
      case 401:
        return 'Authentication required. Please log in.'
      case 403:
        return 'Access denied. You don\'t have permission for this action.'
      case 404:
        return 'Resource not found.'
      case 408:
        return 'Request timeout. Please try again.'
      case 413:
        return 'File too large. Please choose a smaller file.'
      case 422:
        return 'Invalid data. Please check your input.'
      case 429:
        return 'Too many requests. Please wait a moment and try again.'
      case 500:
        return 'Server error. Please try again later.'
      case 503:
        return 'Service temporarily unavailable. Please try again later.'
      default:
        return 'An unexpected error occurred'
    }
  }

  // Fallback for unknown errors
  return 'An unexpected error occurred'
}

// Validate file type and size
export function validateFile(file: File, maxSizeBytes: number = 100 * 1024 * 1024): { isValid: boolean; error?: string } {
  const allowedTypes = [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json'
  ]

  const allowedExtensions = ['.csv', '.xlsx', '.xls', '.txt', '.docx', '.json']

  // Check file size
  if (file.size > maxSizeBytes) {
    return {
      isValid: false,
      error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds the maximum allowed size (${Math.round(maxSizeBytes / 1024 / 1024)}MB)`
    }
  }

  // Check file type
  const fileName = file.name.toLowerCase()
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext))
  const hasValidMimeType = allowedTypes.includes(file.type)

  if (!hasValidExtension && !hasValidMimeType) {
    return {
      isValid: false,
      error: 'Unsupported file format. Please use CSV, Excel, TXT, DOCX, or JSON files.'
    }
  }

  return { isValid: true }
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 Bytes'

  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

// Create a delay function for testing
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Validate email format
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate phone number format
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+[1-9]\d{8,14}$/
  return phoneRegex.test(phone)
}

// Calculate data quality score based on completeness
export function calculateDataQuality(data: Record<string, any>): number {
  const requiredFields = ['name', 'email', 'phone']
  const optionalFields = ['address', 'profession', 'dateOfBirth']
  const allFields = [...requiredFields, ...optionalFields]

  let score = 0
  let maxScore = 0

  // Required fields worth more
  requiredFields.forEach(field => {
    maxScore += 30
    if (data[field] && String(data[field]).trim()) {
      score += 30
    }
  })

  // Optional fields worth less
  optionalFields.forEach(field => {
    maxScore += 10
    if (data[field] && String(data[field]).trim()) {
      score += 10
    }
  })

  return Math.round((score / maxScore) * 100)
}

// Safe JSON parse with fallback
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString)
  } catch {
    return fallback
  }
}

// Debounce function for search inputs
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout

  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Retry function for handling temporary failures
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      if (attempt === maxRetries) {
        throw lastError
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt))
    }
  }

  throw lastError
}

// Upload file using XMLHttpRequest with progress tracking
// Current Issue (September 2025): Experiencing timeout errors on large file uploads
// affecting data import workflows. Both uploadFile and uploadFileWithFormData functions
// are affected by XMLHttpRequest timeout limitations.
// TODO: Consider implementing chunked uploads or configurable timeout values
export function uploadFile(
  url: string,
  file: File,
  options: {
    onProgress?: (progress: number) => void;
    timeout?: number;
    token?: string;
  } = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    // Set up progress tracking
    if (options.onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100
          options.onProgress!(progress)
        }
      })
    }

    // Set up response handling
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve(response)
        } catch (error) {
          resolve({ success: true, data: xhr.responseText })
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'))
    })

    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload timeout'))
    })

    // Configure request
    xhr.open('POST', url)

    // Add authorization header if token provided
    if (options.token) {
      xhr.setRequestHeader('Authorization', `Bearer ${options.token}`)
    }

    // Set timeout if specified
    if (options.timeout) {
      xhr.timeout = options.timeout
    }

    // Send the request
    xhr.send(formData)
  })
}

// Upload FormData using XMLHttpRequest with progress tracking
// Same timeout issues as uploadFile function above - consider unified solution
export function uploadFileWithFormData(
  url: string,
  formData: FormData,
  options: {
    onProgress?: (progress: number) => void;
    timeout?: number;
    token?: string;
  } = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    // Set up progress tracking
    if (options.onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100
          options.onProgress!(progress)
        }
      })
    }

    // Set up response handling
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve(response)
        } catch (error) {
          resolve({ success: true, data: xhr.responseText })
        }
      } else {
        try {
          const errorResponse = JSON.parse(xhr.responseText)
          reject(new Error(errorResponse.error || `Upload failed with status ${xhr.status}`))
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'))
    })

    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload timeout'))
    })

    // Configure request
    xhr.open('POST', url)

    // Add authorization header if token provided
    if (options.token) {
      xhr.setRequestHeader('Authorization', `Bearer ${options.token}`)
    }

    // Set timeout if specified
    if (options.timeout) {
      xhr.timeout = options.timeout
    }

    // Send the request with FormData
    xhr.send(formData)
  })
}

// Make API requests with authentication and error handling
export async function makeApiRequest(
  method: string,
  url: string,
  options: {
    data?: any;
    timeout?: number;
    token?: string;
  } = {}
): Promise<any> {
  const { data, timeout = 5000, token } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw error
  }
}
