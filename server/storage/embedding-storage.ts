import { customerEmbeddings, type CustomerEmbedding, type Customer } from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { CustomerStorageBase } from "./customer-storage";
import { secureLogger } from '../utils/secure-logger';

export abstract class EmbeddingStorageBase extends CustomerStorageBase {
  protected validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding) || embedding.length === 0) return false;
    return embedding.every(val => typeof val === 'number' && Number.isFinite(val));
  }

  async findSimilarCustomers(embedding: number[], threshold = 0.8, limit = 10): Promise<Array<Customer & { similarity: number }>> {
    try {
      // Critical security fix: Enhanced input validation
      if (!this.validateEmbedding(embedding)) {
        throw new Error('Invalid embedding: must be array of finite numbers');
      }

      // Validate threshold and limit parameters with proper bounds
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        throw new Error('Invalid threshold: must be number between 0 and 1');
      }

      if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new Error('Invalid limit: must be integer between 1 and 100');
      }

      // Use proper parameterized query - fix SQL injection vulnerability
      const results = await db.execute(sql`
        SELECT c.*, 1 - (e.embedding <=> ${embedding}::vector) as similarity
        FROM customers c
        JOIN customer_embeddings e ON c.customer_id = e.customer_id
        WHERE 1 - (e.embedding <=> ${embedding}::vector) >= ${threshold}
        ORDER BY e.embedding <=> ${embedding}::vector
        LIMIT ${limit}
      `);

      return results.rows as Array<Customer & { similarity: number }>;
    } catch (error) {
      secureLogger.error('[Storage] Failed to find similar customers:', { error: String(error) });
      if (error instanceof Error && error.message.includes('Invalid')) {
        throw error; // Re-throw validation errors
      }
      throw new Error('Failed to search for similar customers');
    }
  }

  async getCustomerEmbedding(customerId: string): Promise<CustomerEmbedding | undefined> {
    try {
      const [embedding] = await db
        .select()
        .from(customerEmbeddings)
        .where(eq(customerEmbeddings.customerId, customerId));
      return embedding || undefined;
    } catch (error) {
      secureLogger.error('[Storage] Failed to get customer embedding:', { error: String(error) });
      throw new Error('Failed to retrieve customer embedding');
    }
  }

  async upsertCustomerEmbedding(customerId: string, embedding: number[], embeddingType: string): Promise<CustomerEmbedding> {
    try {
      const [result] = await db
        .insert(customerEmbeddings)
        .values({
          customerId,
          embedding: embedding,
          embeddingVector: embedding, // OPTIMIZED: pgvector column for HNSW indexing
          embeddingType,
          lastGeneratedAt: new Date()
        })
        .onConflictDoUpdate({
          target: customerEmbeddings.customerId,
          set: {
            embedding: embedding,
            embeddingVector: embedding, // OPTIMIZED: Ensure vector search uses optimized column
            embeddingType,
            lastGeneratedAt: new Date()
          }
        })
        .returning();
      return result;
    } catch (error) {
      secureLogger.error('[Storage] Failed to upsert customer embedding:', { error: String(error) });
      throw new Error('Failed to save customer embedding');
    }
  }

}
