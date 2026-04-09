import { segments, customerSegments, customerEmbeddings, customers, type Segment, type InsertSegment } from "@shared/schema";
import { db } from "../db";
import { eq, desc, count, sql } from "drizzle-orm";
import { EmbeddingStorageBase } from "./embedding-storage";
import { secureLogger } from '../utils/secure-logger';

export abstract class SegmentStorageBase extends EmbeddingStorageBase {
  async getSegments(): Promise<Segment[]> {
    try {
      const result = await db.select().from(segments).where(eq(segments.isActive, true));
      // Debug logging removed - data flow working correctly
      return result;
    } catch (error) {
      secureLogger.error('[Storage] Failed to get segments:', { error: String(error) });
      return [];
    }
  }

  async createSegment(segment: InsertSegment): Promise<Segment> {
    try {
      const [newSegment] = await db
        .insert(segments)
        .values({ ...segment, updatedAt: new Date() })
        .returning();
      return newSegment;
    } catch (error) {
      secureLogger.error('[Storage] Failed to create segment:', { error: String(error) });
      if (error instanceof Error && error.message.includes('duplicate key')) {
        throw new Error('A segment with this name already exists');
      }
      throw new Error('Failed to create segment');
    }
  }

  async updateSegment(id: string, segment: Partial<InsertSegment>): Promise<Segment> {
    try {
      const [updatedSegment] = await db
        .update(segments)
        .set({ ...segment, updatedAt: new Date() })
        .where(eq(segments.id, id))
        .returning();

      if (!updatedSegment) {
        throw new Error('Segment not found');
      }

      return updatedSegment;
    } catch (error) {
      secureLogger.error('[Storage] Failed to update segment:', { error: String(error) });
      if (error instanceof Error && error.message === 'Segment not found') {
        throw error;
      }
      throw new Error('Failed to update segment');
    }
  }

  async getCustomerSegments(customerId: string): Promise<Segment[]> {
    try {
      const results = await db
        .select({ segment: segments })
        .from(customerSegments)
        .innerJoin(segments, eq(customerSegments.segmentId, segments.id))
        .where(eq(customerSegments.customerId, customerId));

      return results.map(r => r.segment);
    } catch (error) {
      secureLogger.error('[Storage] Failed to get customer segments:', { error: String(error) });
      return [];
    }
  }

  // Prepared statements for better performance
  protected customerCountQuery = db.select({ count: count() }).from(customers).prepare('customerCount');
  protected activeSegmentsQuery = db.select({ count: sql<string>`CAST(COUNT(DISTINCT ${customers.customerSegment}) AS TEXT)` }).from(customers).where(sql`${customers.customerSegment} IS NOT NULL`).prepare('activeSegments');
  protected avgQualityQuery = db.select({ avg: sql<number>`AVG(${customers.dataQualityScore})` }).from(customers).where(sql`${customers.dataQualityScore} IS NOT NULL`).prepare('avgQuality');
  protected embeddingsCountQuery = db.select({ count: count() }).from(customerEmbeddings).prepare('embeddingsCount');
}
