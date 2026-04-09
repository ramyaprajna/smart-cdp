import type { Express } from "express";
import { storage } from "../storage";
import { insertCustomerSchema, insertCustomerEventSchema } from "@shared/schema";
import { z } from "zod";
import { cacheMiddleware, rateLimitMiddleware } from "../performance-middleware";
import { requireAuth } from "../jwt-utils";
import { dataLineageService } from "../data-lineage-service";
import { secureLogger } from '../utils/secure-logger';

export function setupCustomerRoutes(app: Express): void {
  app.get("/api/customers", cacheMiddleware(300000), async (req, res) => {
    try {
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await storage.getCustomers(offset, limit);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      const customers = await storage.searchCustomers(query);
      res.json({ customers, total: customers.length });
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/customers/filter", async (req, res) => {
    try {
      const filters = req.body;
      const customers = await storage.getFilteredCustomers(filters);
      res.json({ customers });
    } catch (error) {
      secureLogger.error('Filter error:', { error: String(error) });
      res.status(500).json({ error: "Filter failed" });
    }
  });

  app.post("/api/customers/similarity-search", requireAuth, rateLimitMiddleware(10, 60000), async (req, res) => {
    try {
      const { query, threshold = 0.15, limit = 20 } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Search query is required" });
      }

      const { vectorEngine } = await import('../vector-engine');
      const embedding = await vectorEngine.generateSearchEmbedding(query);
      const similarCustomers = await vectorEngine.findSimilarCustomers(embedding, {
        threshold, limit, embeddingType: 'customer_profile'
      });

      res.json(similarCustomers);
    } catch (error) {
      secureLogger.error('Similarity search error:', { error: String(error) });
      res.status(500).json({ error: "Similarity search failed" });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid customer data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, customerData);
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid customer data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  app.get("/api/customers/:id/events", async (req, res) => {
    try {
      const events = await storage.getCustomerEvents(req.params.id);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer events" });
    }
  });

  app.post("/api/customers/:id/events", async (req, res) => {
    try {
      const eventData = insertCustomerEventSchema.parse({
        ...req.body,
        customerId: req.params.id
      });
      const event = await storage.createCustomerEvent(eventData);
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid event data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.post("/api/customers/:id/embedding", async (req, res) => {
    try {
      const { embeddingType = "customer_profile" } = req.body;
      const embedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
      const result = await storage.upsertCustomerEmbedding(req.params.id, embedding, embeddingType);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate embedding" });
    }
  });

  app.get("/api/customers/:id/segments", async (req, res) => {
    try {
      const segments = await storage.getCustomerSegments(req.params.id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer segments" });
    }
  });

  app.get("/api/customers/:id/lineage", cacheMiddleware(300000), async (req, res) => {
    try {
      const { id } = req.params;
      const lineage = await dataLineageService.getCustomerLineage(id);
      if (!lineage) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(lineage);
    } catch (error) {
      secureLogger.error('Customer lineage error:', { error: String(error) });
      res.status(500).json({ error: "Failed to get customer lineage" });
    }
  });
}
