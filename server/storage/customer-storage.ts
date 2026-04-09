import { customers, customerEvents, customerSegments, type Customer, type InsertCustomer, type CustomerEvent, type InsertCustomerEvent } from "@shared/schema";
import { db } from "../db";
import { eq, desc, ilike, gte, lte, and, sql, or, count } from "drizzle-orm";
import { cacheManager } from "../cache";
import { SecuritySanitizer } from "../utils/security-sanitizer";
import { RawDataStorageBase } from "./raw-data-storage";
import { applicationLogger } from "../services/application-logger";

export abstract class CustomerStorageBase extends RawDataStorageBase {
  async getCustomer(id: string): Promise<Customer | undefined> {
    try {
      // Check cache first
      const cached = cacheManager.getCustomer(id);
      if (cached) return cached;

      const [customer] = await db.select().from(customers).where(eq(customers.id, id));

      // Cache the result
      if (customer) {
        cacheManager.setCustomer(id, customer);
      }

      return customer || undefined;
    } catch (error) {
      applicationLogger.error('database', 'Failed to get customer', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      throw new Error('Failed to retrieve customer data');
    }
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    try {
      const [customer] = await db.select().from(customers).where(eq(customers.email, email));
      return customer || undefined;
    } catch (error) {
      applicationLogger.error('database', 'Failed to get customer by email', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      throw new Error('Failed to retrieve customer by email');
    }
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    try {
      const [newCustomer] = await db
        .insert(customers)
        .values({ ...customer, updatedAt: new Date() })
        .returning();
      return newCustomer;
    } catch (error) {
      applicationLogger.error('database', 'Failed to create customer', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      if (error instanceof Error && error.message.includes('duplicate key')) {
        throw new Error('A customer with this email already exists');
      }
      throw new Error('Failed to create customer');
    }
  }

  async updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer> {
    try {
      const [updatedCustomer] = await db
        .update(customers)
        .set({ ...customer, updatedAt: new Date() })
        .where(eq(customers.id, id))
        .returning();

      if (!updatedCustomer) {
        throw new Error('Customer not found');
      }

      return updatedCustomer;
    } catch (error) {
      applicationLogger.error('database', 'Failed to update customer', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      if (error instanceof Error && error.message === 'Customer not found') {
        throw error;
      }
      throw new Error('Failed to update customer');
    }
  }

  async searchCustomers(query: string, limit = 50): Promise<Customer[]> {
    try {
      // SECURITY FIX: Sanitize search query to prevent SQL injection attacks
      const sanitizedQuery = SecuritySanitizer.sanitizeSQLParameter(query);

      if (!sanitizedQuery || sanitizedQuery.length < 1) {
        return []; // Return empty results for invalid queries
      }

      // Enhanced search with secure parameterized queries
      const searchPattern = `%${sanitizedQuery}%`;
      const textResults = await db
        .select()
        .from(customers)
        .where(
          or(
            ilike(customers.firstName, searchPattern),
            ilike(customers.lastName, searchPattern),
            ilike(customers.email, searchPattern),
            ilike(customers.customerSegment, searchPattern),
            sql`CONCAT(${customers.firstName}, ' ', ${customers.lastName}) ILIKE ${searchPattern}`
          )
        )
        .limit(limit);

      // If text search returns fewer than 5 results and query has semantic keywords,
      // also try vector search for customer characteristics
      const semanticKeywords = ['professional', 'student', 'entrepreneur', 'jakarta', 'tangerang', 'young', 'high value', 'government'];
      const hasSemanticIntent = semanticKeywords.some(keyword => sanitizedQuery.toLowerCase().includes(keyword));

      if (textResults.length < 5 && hasSemanticIntent && sanitizedQuery.length > 3) {
        try {
          // Import vector engine for semantic search
          const { vectorEngine } = await import('../vector-engine');
          // Generate embedding from sanitized search query text
          const embedding = await vectorEngine.generateSearchEmbedding(sanitizedQuery);
          const vectorResults = await vectorEngine.findSimilarCustomers(embedding, {
            threshold: 0.6, // Lower threshold for broader search
            limit: Math.max(5, limit - textResults.length),
            includeMetadata: true
          });

          // Combine and deduplicate results
          const combinedResults = [...textResults];
          const textResultIds = new Set(textResults.map(c => c.id));

          for (const vectorResult of vectorResults) {
            if (!textResultIds.has(vectorResult.customerId)) {
              const customer = await this.getCustomer(vectorResult.customerId);
              if (customer) {
                combinedResults.push(customer);
              }
            }
          }

          return combinedResults.slice(0, limit);
        } catch (error) {
          applicationLogger.warn('database', 'Vector search fallback failed', { error: String(error) }).catch(() => {});
          return textResults;
        }
      }

      return textResults;
    } catch (error) {
      applicationLogger.error('database', 'Failed to search customers', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      return []; // Return empty array on error to prevent UI breakage
    }
  }

  async getCustomers(offset = 0, limit = 50): Promise<{ customers: Customer[], total: number }> {
    try {
      const [customersResult, totalResult] = await Promise.all([
        db.select().from(customers).offset(offset).limit(limit).orderBy(desc(customers.createdAt)),
        db.select({ count: count() }).from(customers)
      ]);

      return {
        customers: customersResult,
        total: totalResult[0].count
      };
    } catch (error) {
      applicationLogger.error('database', 'Failed to get customers', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      return { customers: [], total: 0 };
    }
  }

  async getAllCustomersForAnalysis(): Promise<Customer[]> {
    // PERFORMANCE WARNING: This method loads ALL customers (348K+) and should be avoided.
    // Use getCustomerCountByCriteria() or other optimized methods instead.
    applicationLogger.warn('database', 'getAllCustomersForAnalysis() called - this loads 348K+ customers and causes 2+ second queries. Consider using COUNT queries instead.').catch(() => {});
    
    try {
      // EMERGENCY PERFORMANCE FIX: Add LIMIT to prevent full table scans
      const allCustomers = await db.select().from(customers)
        .orderBy(desc(customers.createdAt))
        .limit(50000); // Emergency limit - prevents catastrophic queries
      return allCustomers;
    } catch (error) {
      applicationLogger.error('database', 'Error fetching customers for analysis', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      throw error;
    }
  }

  async getFilteredCustomers(filters: any): Promise<Customer[]> {
    try {
      let query = db.select().from(customers);
      const conditions = [];

      // Segment filter
      if (filters.segment) {
        conditions.push(eq(customers.customerSegment, filters.segment));
      }

      // Data quality filter
      if (filters.dataQualityMin !== undefined) {
        conditions.push(gte(customers.dataQualityScore, filters.dataQualityMin));
      }
      if (filters.dataQualityMax !== undefined) {
        conditions.push(lte(customers.dataQualityScore, filters.dataQualityMax));
      }

      // Lifetime value filter
      if (filters.lifetimeValueMin !== undefined) {
        conditions.push(gte(customers.lifetimeValue, filters.lifetimeValueMin));
      }
      if (filters.lifetimeValueMax !== undefined) {
        conditions.push(lte(customers.lifetimeValue, filters.lifetimeValueMax));
      }

      // Gender filter
      if (filters.gender) {
        conditions.push(eq(customers.gender, filters.gender));
      }

      // Email filters
      if (filters.hasEmail === true) {
        conditions.push(and(
          sql`${customers.email} IS NOT NULL`,
          sql`${customers.email} != ''`
        ));
      }
      if (filters.missingEmail === true) {
        conditions.push(sql`(${customers.email} IS NULL OR ${customers.email} = '')`);
      }

      // Phone filters
      if (filters.hasPhone === true) {
        conditions.push(and(
          sql`${customers.phoneNumber} IS NOT NULL`,
          sql`${customers.phoneNumber} != ''`
        ));
      }
      if (filters.missingPhone === true) {
        conditions.push(sql`(${customers.phoneNumber} IS NULL OR ${customers.phoneNumber} = '')`);
      }

      // Apply conditions
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      return await query.limit(1000);
    } catch (error) {
      applicationLogger.error('database', 'Failed to get filtered customers', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      return [];
    }
  }

  async createCustomerEvent(event: InsertCustomerEvent): Promise<CustomerEvent> {
    try {
      const [newEvent] = await db
        .insert(customerEvents)
        .values(event)
        .returning();
      return newEvent;
    } catch (error) {
      applicationLogger.error('database', 'Failed to create customer event', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      throw new Error('Failed to create customer event');
    }
  }

  async getCustomerEvents(customerId: string, limit = 50): Promise<CustomerEvent[]> {
    try {
      return await db
        .select()
        .from(customerEvents)
        .where(eq(customerEvents.customerId, customerId))
        .orderBy(desc(customerEvents.eventTimestamp))
        .limit(limit);
    } catch (error) {
      applicationLogger.error('database', 'Failed to get customer events', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      return [];
    }
  }

}
