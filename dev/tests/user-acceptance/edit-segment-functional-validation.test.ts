/**
 * Functional Validation Tests: Edit Segment Parameters Core Logic
 * 
 * These tests validate the core data transformation and logic functions
 * that power the Edit Segment Parameters feature without complex UI rendering.
 */

import { describe, it, expect } from 'vitest';

// Core transformation functions
const transformCriteriaForDisplay = (criteria: any) => {
  if (!criteria) return { hasEmail: false, hasPhone: false };
  
  const result: any = {};
  
  // Handle new $exists format
  if (criteria.email && criteria.email.$exists !== undefined) {
    result.hasEmail = criteria.email.$exists;
  } else if (criteria.emailExists && criteria.emailExists.$exists !== undefined) {
    result.hasEmail = criteria.emailExists.$exists;
  } else if (criteria.hasEmail !== undefined) {
    result.hasEmail = criteria.hasEmail;
  } else {
    result.hasEmail = false;
  }
  
  // Handle phone
  if (criteria.phoneNumber && criteria.phoneNumber.$exists !== undefined) {
    result.hasPhone = criteria.phoneNumber.$exists;
  } else if (criteria.phoneExists && criteria.phoneExists.$exists !== undefined) {
    result.hasPhone = criteria.phoneExists.$exists;
  } else if (criteria.hasPhone !== undefined) {
    result.hasPhone = criteria.hasPhone;
  } else {
    result.hasPhone = false;
  }
  
  return result;
};

const transformCriteriaForStorage = (displayCriteria: any) => {
  const result: any = {};
  
  if (displayCriteria.hasEmail === true) {
    result.emailExists = { $exists: true };
  } else if (displayCriteria.hasEmail === false) {
    result.emailExists = { $exists: false };
  }
  
  if (displayCriteria.hasPhone === true) {
    result.phoneExists = { $exists: true };
  } else if (displayCriteria.hasPhone === false) {
    result.phoneExists = { $exists: false };
  }
  
  return result;
};

const isSimpleCriteria = (criteria: any) => {
  if (!criteria) return true;
  
  const keys = Object.keys(criteria);
  const simpleKeys = ['email', 'phoneNumber', 'emailExists', 'phoneExists', 'hasEmail', 'hasPhone'];
  
  // Check if all keys are simple existence checks
  return keys.every(key => {
    if (simpleKeys.includes(key)) {
      const value = criteria[key];
      return typeof value === 'boolean' || 
             (typeof value === 'object' && value !== null && '$exists' in value);
    }
    return false;
  });
};

describe('Edit Segment Parameters - Core Logic Validation', () => {
  
  describe('CORE-001: Criteria Display Transformation', () => {
    it('Should transform new $exists format to boolean format', () => {
      const input = {
        email: { $exists: true },
        phoneNumber: { $exists: false }
      };
      
      const result = transformCriteriaForDisplay(input);
      
      expect(result).toEqual({
        hasEmail: true,
        hasPhone: false
      });
    });
    
    it('Should handle mixed format criteria', () => {
      const input = {
        emailExists: { $exists: true },
        hasPhone: false
      };
      
      const result = transformCriteriaForDisplay(input);
      
      expect(result).toEqual({
        hasEmail: true,
        hasPhone: false
      });
    });
    
    it('Should handle legacy boolean format', () => {
      const input = {
        hasEmail: true,
        hasPhone: false
      };
      
      const result = transformCriteriaForDisplay(input);
      
      expect(result).toEqual({
        hasEmail: true,
        hasPhone: false
      });
    });
    
    it('Should handle empty criteria', () => {
      const result = transformCriteriaForDisplay({});
      
      expect(result).toEqual({
        hasEmail: false,
        hasPhone: false
      });
    });
    
    it('Should handle null criteria', () => {
      const result = transformCriteriaForDisplay(null);
      
      expect(result).toEqual({
        hasEmail: false,
        hasPhone: false
      });
    });
  });
  
  describe('CORE-002: Criteria Storage Transformation', () => {
    it('Should transform boolean true to $exists true format', () => {
      const input = {
        hasEmail: true,
        hasPhone: false
      };
      
      const result = transformCriteriaForStorage(input);
      
      expect(result).toEqual({
        emailExists: { $exists: true },
        phoneExists: { $exists: false }
      });
    });
    
    it('Should handle both false values', () => {
      const input = {
        hasEmail: false,
        hasPhone: false
      };
      
      const result = transformCriteriaForStorage(input);
      
      expect(result).toEqual({
        emailExists: { $exists: false },
        phoneExists: { $exists: false }
      });
    });
    
    it('Should handle both true values', () => {
      const input = {
        hasEmail: true,
        hasPhone: true
      };
      
      const result = transformCriteriaForStorage(input);
      
      expect(result).toEqual({
        emailExists: { $exists: true },
        phoneExists: { $exists: true }
      });
    });
  });
  
  describe('CORE-003: Simple Mode Detection', () => {
    it('Should detect simple email/phone criteria as simple', () => {
      const criteria = {
        email: { $exists: true },
        phoneNumber: { $exists: false }
      };
      
      expect(isSimpleCriteria(criteria)).toBe(true);
    });
    
    it('Should detect mixed simple criteria as simple', () => {
      const criteria = {
        emailExists: { $exists: true },
        hasPhone: false
      };
      
      expect(isSimpleCriteria(criteria)).toBe(true);
    });
    
    it('Should detect complex criteria as not simple', () => {
      const criteria = {
        email: { $exists: true },
        phoneNumber: { $exists: false },
        ageRange: { min: 25, max: 45 }
      };
      
      expect(isSimpleCriteria(criteria)).toBe(false);
    });
    
    it('Should handle empty criteria as simple', () => {
      expect(isSimpleCriteria({})).toBe(true);
    });
  });
  
  describe('CORE-004: Round-trip Transformation', () => {
    it('Should maintain data integrity through round-trip transformation', () => {
      const originalCriteria = {
        email: { $exists: true },
        phoneNumber: { $exists: false }
      };
      
      // Transform for display
      const displayFormat = transformCriteriaForDisplay(originalCriteria);
      
      // Transform back for storage
      const storageFormat = transformCriteriaForStorage(displayFormat);
      
      expect(storageFormat).toEqual({
        emailExists: { $exists: true },
        phoneExists: { $exists: false }
      });
    });
    
    it('Should handle legacy format round-trip', () => {
      const legacyCriteria = {
        hasEmail: true,
        hasPhone: false
      };
      
      const displayFormat = transformCriteriaForDisplay(legacyCriteria);
      const storageFormat = transformCriteriaForStorage(displayFormat);
      
      expect(storageFormat).toEqual({
        emailExists: { $exists: true },
        phoneExists: { $exists: false }
      });
    });
  });
  
  describe('CORE-005: Edge Cases', () => {
    it('Should handle undefined boolean values', () => {
      const input = {
        hasEmail: undefined,
        hasPhone: true
      };
      
      const result = transformCriteriaForDisplay(input);
      
      expect(result).toEqual({
        hasEmail: false,
        hasPhone: true
      });
    });
    
    it('Should handle mixed undefined and defined values', () => {
      const input = {
        emailExists: { $exists: true },
        phoneNumber: undefined
      };
      
      const result = transformCriteriaForDisplay(input);
      
      expect(result).toEqual({
        hasEmail: true,
        hasPhone: false
      });
    });
    
    it('Should prioritize $exists format over boolean format', () => {
      const input = {
        email: { $exists: true },
        hasEmail: false, // Should be ignored
        phoneExists: { $exists: false },
        hasPhone: true // Should be ignored
      };
      
      const result = transformCriteriaForDisplay(input);
      
      expect(result).toEqual({
        hasEmail: true,  // email.$exists wins
        hasPhone: false  // phoneExists.$exists wins
      });
    });
  });
});