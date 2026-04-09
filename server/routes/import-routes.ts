import type { Express } from "express";
import { storage } from "../storage";
import { insertCustomerSchema, insertDataImportSchema } from "@shared/schema";
import { dataLineageService } from "../data-lineage-service";
import { applicationLogger } from "../services/application-logger";
import { requireAuth } from "../jwt-utils";
import { cacheMiddleware as cacheMiddlewarePerf } from "../performance-middleware";

export function setupImportRoutes(app: Express): void {
  app.post("/api/data/import", async (req, res) => {
    try {
      const { customers: customerData } = req.body;

      if (!Array.isArray(customerData)) {
        return res.status(400).json({ error: "Expected array of customers" });
      }

      const results = [];
      for (const customer of customerData) {
        try {
          const parsedCustomer = insertCustomerSchema.parse(customer);
          const result = await storage.createCustomer(parsedCustomer);
          results.push({ success: true, customer: result });
        } catch (error) {
          results.push({ success: false, error: (error as Error).message, data: customer });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        summary: { successful, failed, total: customerData.length },
        results
      });
    } catch (error) {
      res.status(500).json({ error: "Import failed" });
    }
  });

  app.post("/api/imports/start", async (req, res) => {
    try {
      const validatedData = insertDataImportSchema.parse(req.body);

      await applicationLogger.info('import', 'Data import process started', {
        fileName: validatedData.fileName,
        importType: validatedData.importType,
        importSource: validatedData.importSource,
        initiatedBy: req.user?.id,
        initiatedByEmail: req.user?.email,
        initiatedByRole: req.user?.role,
        fileSize: (validatedData.importMetadata as any)?.fileSize,
        recordCount: (validatedData.importMetadata as any)?.recordCount
      }, req);

      const importId = await dataLineageService.startImport({
        fileName: validatedData.fileName || '',
        filePath: validatedData.filePath || '',
        importType: validatedData.importType as 'json' | 'excel' | 'csv' | 'api',
        importSource: validatedData.importSource || '',
        importedBy: validatedData.importedBy || '',
        metadata: validatedData.importMetadata as Record<string, any> || {},
      });

      await applicationLogger.info('import', 'Data import successfully initiated', {
        importId, fileName: validatedData.fileName,
        importType: validatedData.importType, initiatedBy: req.user?.id
      }, req);

      res.json({ importId });
    } catch (error) {
      applicationLogger.error('import', 'Import start error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('import', 'Failed to start data import', error as Error, {
        fileName: req.body.fileName,
        importType: req.body.importType,
        initiatedBy: req.user?.id
      }, req);
      res.status(400).json({ error: "Failed to start import" });
    }
  });

  app.get("/api/imports", requireAuth, cacheMiddlewarePerf(60000), async (req, res) => {
    try {
      const { search, status, type, dateRange, limit = 50, offset = 0 } = req.query;

      const filters = {
        search: search as string,
        status: status as string,
        type: type as string,
        dateRange: dateRange as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const { importAccessLogger } = await import('../utils/import-logging-utils');
      await importAccessLogger.logHistoryAccess(req, filters);

      const imports = await dataLineageService.getImportHistory(filters);

      const resultCount = imports.length || (imports as any).imports?.length || 0;
      const appliedFilters = Object.keys(filters).filter(key => filters[key as keyof typeof filters]);
      await importAccessLogger.logHistoryResults(req, resultCount, appliedFilters);

      res.json(imports);
    } catch (error) {
      applicationLogger.error('import', 'Import history error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});

      try {
        const { importOperationLogger } = await import('../utils/import-logging-utils');
        await importOperationLogger.logFailure(req, 'import_history_retrieval', error as Error, {
          filtersRequested: req.query
        });
      } catch (logError) {
        applicationLogger.error('import', 'Failed to log import error:', logError instanceof Error ? logError : new Error(String(logError))).catch(() => {});
      }

      return res.status(500).json({ error: "Failed to get import history" });
    }
  });

  app.get("/api/imports/duplicates", cacheMiddlewarePerf(600000), async (req, res) => {
    try {
      const duplicates = await dataLineageService.detectDuplicateImports();
      res.json(duplicates);
    } catch (error) {
      applicationLogger.error('import', 'Duplicate detection error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      res.status(500).json({ error: "Failed to detect duplicates" });
    }
  });

  app.get("/api/imports/:importSource/customers", cacheMiddlewarePerf(300000), async (req, res) => {
    try {
      const { importSource } = req.params;
      const customers = await dataLineageService.getCustomersByImportSource(importSource);

      const { importAccessLogger } = await import('../utils/import-logging-utils');
      const customerCount = Array.isArray(customers) ? customers.length : (customers as any)?.length || 0;
      await importAccessLogger.logSourceAccess(req, importSource, customerCount);

      res.json(customers);
    } catch (error) {
      applicationLogger.error('import', 'Import customers error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      const { importOperationLogger } = await import('../utils/import-logging-utils');
      await importOperationLogger.logFailure(req, 'import_source_retrieval', error as Error, {
        importSource: req.params.importSource
      });
      res.status(500).json({ error: "Failed to get customers by import source" });
    }
  });

  app.post("/api/imports/:importId/customers", async (req, res) => {
    try {
      const { importId } = req.params;
      const { customers: customersData, sourceRowNumbers } = req.body;

      if (!Array.isArray(customersData)) {
        await applicationLogger.warn('import', 'Customer import failed - invalid data format', {
          importId,
          dataType: typeof customersData,
          isArray: Array.isArray(customersData),
          processedBy: req.user?.id
        }, req);
        return res.status(400).json({ error: "Customers data must be an array" });
      }

      await applicationLogger.info('import', 'Customer data import started', {
        importId,
        customerCount: customersData.length,
        hasSourceRowNumbers: !!sourceRowNumbers,
        processedBy: req.user?.id,
        processedByEmail: req.user?.email
      }, req);

      const result = await dataLineageService.importCustomers(importId, customersData, sourceRowNumbers);

      await applicationLogger.info('import', 'Customer data import completed', {
        importId,
        importedCount: (result as any).imported?.length || 0,
        failedCount: (result as any).failed?.length || 0,
        successRate: (result as any).imported ? (((result as any).imported.length / customersData.length) * 100).toFixed(2) + '%' : '0%',
        processedBy: req.user?.id
      }, req);

      res.json(result);
    } catch (error) {
      applicationLogger.error('import', 'Import customers error:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      await applicationLogger.error('import', 'Customer data import failed', error as Error, {
        importId: req.params.importId,
        customerCount: Array.isArray(req.body.customers) ? req.body.customers.length : 'unknown',
        processedBy: req.user?.id
      }, req);
      res.status(400).json({ error: "Failed to import customers" });
    }
  });

  app.get("/api/raw-data/:importSessionId", requireAuth, async (req, res) => {
    try {
      const { importSessionId } = req.params;
      const { limit = 100, offset = 0 } = req.query;
      const rawData = await storage.getRawDataImports(importSessionId, Number(limit), Number(offset));
      res.json({ success: true, data: rawData, count: rawData.length });
    } catch (error) {
      applicationLogger.error('import', 'Error retrieving raw data:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      res.status(500).json({ success: false, message: 'Failed to retrieve raw data' });
    }
  });

  app.get("/api/raw-data/:importSessionId/stats", requireAuth, async (req, res) => {
    try {
      const { importSessionId } = req.params;
      const stats = await storage.getRawDataStats(importSessionId);
      res.json({ success: true, data: stats });
    } catch (error) {
      applicationLogger.error('import', 'Error retrieving raw data stats:', error instanceof Error ? error : new Error(String(error))).catch(() => {});
      res.status(500).json({ success: false, message: 'Failed to retrieve raw data statistics' });
    }
  });
}
