import { applicationLogs, errorGroups, logSettings, logAlerts, type ApplicationLog, type InsertApplicationLog, type ErrorGroup, type InsertErrorGroup, type LogSetting, type InsertLogSetting, type LogAlert, type InsertLogAlert } from "@shared/schema";
import { db } from "../db";
import { eq, desc, sql, and, gte, lte, count } from "drizzle-orm";
import { secureLogger } from "../utils/secure-logger";

export abstract class LogStorageBase {
  async getApplicationLogs(filters?: {
    level?: string;
    category?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    isArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: ApplicationLog[], total: number }> {
    try {
      let query = db.select().from(applicationLogs);
      let countQuery = db.select({ count: count() }).from(applicationLogs);

      const conditions = [];

      if (filters?.level) conditions.push(eq(applicationLogs.level, filters.level));
      if (filters?.category) conditions.push(eq(applicationLogs.category, filters.category));
      if (filters?.userId) conditions.push(eq(applicationLogs.userId, filters.userId));
      if (filters?.startDate) conditions.push(gte(applicationLogs.timestamp, filters.startDate));
      if (filters?.endDate) conditions.push(lte(applicationLogs.timestamp, filters.endDate));
      if (filters?.isArchived !== undefined) conditions.push(eq(applicationLogs.isArchived, filters.isArchived));

      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause) as any;
        countQuery = countQuery.where(whereClause) as any;
      }

      query = query.orderBy(desc(applicationLogs.timestamp)) as any;
      if (filters?.limit) query = query.limit(filters.limit) as any;
      if (filters?.offset) query = query.offset(filters.offset) as any;

      const [logs, totalResult] = await Promise.all([query, countQuery]);
      return { logs, total: totalResult[0]?.count || 0 };
    } catch (error) {
      secureLogger.error('[Storage] Failed to get application logs:', { error: String(error) });
      return { logs: [], total: 0 };
    }
  }

  async createApplicationLog(log: InsertApplicationLog): Promise<ApplicationLog> {
    try {
      const [newLog] = await db.insert(applicationLogs).values(log).returning();
      return newLog;
    } catch (error) {
      secureLogger.error('[Storage] Failed to create application log:', { error: String(error) });
      throw new Error('Failed to create log entry');
    }
  }

  async archiveApplicationLogs(logIds: string[]): Promise<void> {
    try {
      await db.update(applicationLogs)
        .set({ isArchived: true, archivedAt: new Date() })
        .where(sql`${applicationLogs.id} = ANY(${logIds})`);
    } catch (error) {
      secureLogger.error('[Storage] Failed to archive application logs:', { error: String(error) });
      throw new Error('Failed to archive logs');
    }
  }

  async deleteApplicationLogs(logIds: string[]): Promise<void> {
    try {
      await db.delete(applicationLogs).where(sql`${applicationLogs.id} = ANY(${logIds})`);
    } catch (error) {
      secureLogger.error('[Storage] Failed to delete application logs:', { error: String(error) });
      throw new Error('Failed to delete logs');
    }
  }

  async getLogStats(): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByCategory: Record<string, number>;
    recentErrors: number;
    archivedLogs: number;
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [stats, levelStats, categoryStats, recentErrors, archivedCount] = await Promise.all([
        db.select({ count: count() }).from(applicationLogs),
        db.select({ level: applicationLogs.level, count: count() }).from(applicationLogs).groupBy(applicationLogs.level),
        db.select({ category: applicationLogs.category, count: count() }).from(applicationLogs).groupBy(applicationLogs.category),
        db.select({ count: count() }).from(applicationLogs).where(and(
          sql`${applicationLogs.level} IN ('error', 'critical')`,
          gte(applicationLogs.timestamp, thirtyDaysAgo)
        )),
        db.select({ count: count() }).from(applicationLogs).where(eq(applicationLogs.isArchived, true))
      ]);

      const logsByLevel: Record<string, number> = {};
      levelStats.forEach(stat => { logsByLevel[stat.level] = stat.count; });

      const logsByCategory: Record<string, number> = {};
      categoryStats.forEach(stat => { logsByCategory[stat.category] = stat.count; });

      return {
        totalLogs: stats[0]?.count || 0,
        logsByLevel,
        logsByCategory,
        recentErrors: recentErrors[0]?.count || 0,
        archivedLogs: archivedCount[0]?.count || 0
      };
    } catch (error) {
      secureLogger.error('[Storage] Failed to get log stats:', { error: String(error) });
      return { totalLogs: 0, logsByLevel: {}, logsByCategory: {}, recentErrors: 0, archivedLogs: 0 };
    }
  }

  async findOrCreateErrorGroup(errorData: {
    fingerprint: string;
    level: string;
    category: string;
    service: string;
    messageTemplate: string;
    stackTraceHash?: string;
  }): Promise<string> {
    const existing = await db.select().from(errorGroups).where(eq(errorGroups.fingerprint, errorData.fingerprint)).limit(1);

    if (existing.length > 0) {
      await db.update(errorGroups)
        .set({ count: sql`${errorGroups.count} + 1`, lastSeen: new Date(), updatedAt: new Date() })
        .where(eq(errorGroups.id, existing[0].id));
      return existing[0].id;
    }

    const [newGroup] = await db.insert(errorGroups).values({
      fingerprint: errorData.fingerprint,
      level: errorData.level,
      category: errorData.category,
      service: errorData.service,
      messageTemplate: errorData.messageTemplate,
      stackTraceHash: errorData.stackTraceHash,
      count: 1,
      isResolved: false,
      firstSeen: new Date(),
      lastSeen: new Date(),
    }).returning();

    return newGroup.id;
  }

  async getErrorGroups(filters?: {
    level?: string;
    category?: string;
    service?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ errorGroups: ErrorGroup[], total: number }> {
    let query = db.select().from(errorGroups);
    let countQuery = db.select({ count: count() }).from(errorGroups);

    const conditions = [];
    if (filters?.level) conditions.push(eq(errorGroups.level, filters.level));
    if (filters?.category) conditions.push(eq(errorGroups.category, filters.category));
    if (filters?.service) conditions.push(eq(errorGroups.service, filters.service));

    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause) as any;
      countQuery = countQuery.where(whereClause) as any;
    }

    query = query.orderBy(desc(errorGroups.lastSeen)) as any;
    if (filters?.limit) query = query.limit(filters.limit) as any;
    if (filters?.offset) query = query.offset(filters.offset) as any;

    const [errorGroups_result, totalResult] = await Promise.all([query, countQuery]);
    return { errorGroups: errorGroups_result, total: totalResult[0]?.count || 0 };
  }

  async getErrorGroupById(id: string): Promise<ErrorGroup | undefined> {
    try {
      const result = await db.select().from(errorGroups).where(eq(errorGroups.id, id)).limit(1);
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to get error group by ID:', { error: String(error) });
      return undefined;
    }
  }

  async updateErrorGroupStatus(id: string, status: 'active' | 'resolved' | 'ignored'): Promise<ErrorGroup> {
    try {
      const [updated] = await db.update(errorGroups)
        .set({
          isResolved: status === 'resolved',
          resolvedAt: status === 'resolved' ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(errorGroups.id, id))
        .returning();

      if (!updated) throw new Error('Error group not found');
      return updated;
    } catch (error) {
      secureLogger.error('[Storage] Failed to update error group status:', { error: String(error) });
      if (error instanceof Error && error.message === 'Error group not found') throw error;
      throw new Error('Failed to update error group status');
    }
  }

  async getLogSettings(settingKey?: string): Promise<LogSetting | LogSetting[] | undefined> {
    if (settingKey) {
      const result = await db.select().from(logSettings).where(eq(logSettings.settingKey, settingKey)).limit(1);
      return result[0];
    }
    return await db.select().from(logSettings);
  }

  async upsertLogSetting(setting: InsertLogSetting): Promise<LogSetting> {
    const existing = await db.select().from(logSettings).where(eq(logSettings.settingKey, setting.settingKey)).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(logSettings)
        .set({ settingValue: setting.settingValue, description: setting.description, updatedAt: new Date() })
        .where(eq(logSettings.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(logSettings).values(setting).returning();
    return created;
  }

  async deleteLogSetting(settingKey: string): Promise<void> {
    try {
      await db.delete(logSettings).where(eq(logSettings.settingKey, settingKey));
    } catch (error) {
      secureLogger.error('[Storage] Failed to delete log setting:', { error: String(error) });
      throw new Error('Failed to delete log setting');
    }
  }

  async createLogAlert(alert: InsertLogAlert): Promise<LogAlert> {
    try {
      const [newAlert] = await db.insert(logAlerts).values(alert).returning();
      return newAlert;
    } catch (error) {
      secureLogger.error('[Storage] Failed to create log alert:', { error: String(error) });
      if (error instanceof Error && error.message.includes('duplicate key')) {
        throw new Error('A log alert with this configuration already exists');
      }
      throw new Error('Failed to create log alert');
    }
  }

  async getLogAlerts(filters?: {
    isActive?: boolean;
    alertLevel?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: LogAlert[], total: number }> {
    let query = db.select().from(logAlerts);
    let countQuery = db.select({ count: count() }).from(logAlerts);

    const conditions = [];
    if (filters?.isActive !== undefined) conditions.push(eq(logAlerts.status, filters.isActive ? 'active' : 'resolved'));
    if (filters?.alertLevel) conditions.push(eq(logAlerts.severity, filters.alertLevel));

    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause) as any;
      countQuery = countQuery.where(whereClause) as any;
    }

    query = query.orderBy(desc(logAlerts.createdAt)) as any;
    if (filters?.limit) query = query.limit(filters.limit) as any;
    if (filters?.offset) query = query.offset(filters.offset) as any;

    const [alerts, totalResult] = await Promise.all([query, countQuery]);
    return { alerts, total: totalResult[0]?.count || 0 };
  }

  async updateLogAlert(id: string, updates: Partial<InsertLogAlert>): Promise<LogAlert> {
    try {
      const [updated] = await db.update(logAlerts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(logAlerts.id, id))
        .returning();

      if (!updated) throw new Error('Log alert not found');
      return updated;
    } catch (error) {
      secureLogger.error('[Storage] Failed to update log alert:', { error: String(error) });
      if (error instanceof Error && error.message === 'Log alert not found') throw error;
      throw new Error('Failed to update log alert');
    }
  }

  async deleteLogAlert(id: string): Promise<void> {
    try {
      await db.delete(logAlerts).where(eq(logAlerts.id, id));
    } catch (error) {
      secureLogger.error('[Storage] Failed to delete log alert:', { error: String(error) });
      throw new Error('Failed to delete log alert');
    }
  }

  async getLogAnalytics(timeRange?: { startDate: Date; endDate: Date }): Promise<{
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByCategory: Record<string, number>;
    errorRate: number;
    errorGroups: number;
    topErrors: Array<{ fingerprint: string; count: number; message: string }>;
    timeSeriesData: Array<{ timestamp: Date; count: number; level: string }>;
    healthScore: number;
    trends: { errorTrend: 'increasing' | 'decreasing' | 'stable'; volumeTrend: 'increasing' | 'decreasing' | 'stable' };
  }> {
    const defaultTimeRange = {
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date()
    };
    const { startDate, endDate } = timeRange || defaultTimeRange;
    const timeCondition = and(gte(applicationLogs.timestamp, startDate), lte(applicationLogs.timestamp, endDate));

    const [totalLogsResult, levelStatsResult, categoryStatsResult, errorGroupsResult, topErrorsResult, timeSeriesResult] = await Promise.all([
      db.select({ count: count() }).from(applicationLogs).where(timeCondition),
      db.select({ level: applicationLogs.level, count: count() }).from(applicationLogs).where(timeCondition).groupBy(applicationLogs.level),
      db.select({ category: applicationLogs.category, count: count() }).from(applicationLogs).where(timeCondition).groupBy(applicationLogs.category),
      db.select({ count: count() }).from(errorGroups).where(and(gte(errorGroups.lastSeen, startDate), lte(errorGroups.lastSeen, endDate))),
      db.select({ fingerprint: errorGroups.fingerprint, count: errorGroups.count, message: errorGroups.messageTemplate })
        .from(errorGroups)
        .where(and(gte(errorGroups.lastSeen, startDate), lte(errorGroups.lastSeen, endDate)))
        .orderBy(desc(errorGroups.count))
        .limit(10),
      db.select({
        hour: sql<string>`date_trunc('hour', ${applicationLogs.timestamp})`,
        level: applicationLogs.level,
        count: count()
      }).from(applicationLogs).where(timeCondition)
        .groupBy(sql`date_trunc('hour', ${applicationLogs.timestamp})`, applicationLogs.level)
        .orderBy(sql`date_trunc('hour', ${applicationLogs.timestamp})`)
    ]);

    const totalLogs = totalLogsResult[0]?.count || 0;
    const logsByLevel: Record<string, number> = {};
    levelStatsResult.forEach(stat => { logsByLevel[stat.level] = stat.count; });

    const logsByCategory: Record<string, number> = {};
    categoryStatsResult.forEach(stat => { logsByCategory[stat.category] = stat.count; });

    const errorCount = (logsByLevel.error || 0) + (logsByLevel.fatal || 0);
    const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;
    const errorGroupsCount = errorGroupsResult[0]?.count || 0;

    const topErrors = topErrorsResult.map(err => ({
      fingerprint: err.fingerprint,
      count: err.count,
      message: err.message || 'No message'
    }));

    const timeSeriesData = timeSeriesResult.map(item => ({
      timestamp: new Date(item.hour),
      count: item.count,
      level: item.level
    }));

    let healthScore = 100;
    if (errorRate > 10) healthScore -= 30;
    else if (errorRate > 5) healthScore -= 15;
    else if (errorRate > 1) healthScore -= 5;
    if (errorGroupsCount > 50) healthScore -= 20;
    else if (errorGroupsCount > 20) healthScore -= 10;

    return {
      totalLogs,
      logsByLevel,
      logsByCategory,
      errorRate,
      errorGroups: errorGroupsCount,
      topErrors,
      timeSeriesData,
      healthScore: Math.max(0, healthScore),
      trends: { errorTrend: 'stable', volumeTrend: 'stable' }
    };
  }

  async getLogHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    metrics: { errorRate: number; logVolume: number; avgResponseTime: number; failedLogsCount: number };
    alerts: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
  }> {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [logMetrics, failedLogs] = await Promise.all([
        db.select({
          totalLogs: count(),
          errorLogs: sql<number>`sum(case when level in ('error', 'critical') then 1 else 0 end)`,
        }).from(applicationLogs).where(gte(applicationLogs.timestamp, last24Hours)),
        db.select({ count: count() }).from(applicationLogs).where(and(
          gte(applicationLogs.timestamp, last24Hours),
          eq(applicationLogs.level, 'critical')
        ))
      ]);

      const metrics = logMetrics[0];
      const totalLogs = metrics?.totalLogs || 0;
      const errorLogs = metrics?.errorLogs || 0;
      const failedLogsCount = failedLogs[0]?.count || 0;
      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0;

      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (errorRate > 10 || failedLogsCount > 100) status = 'critical';
      else if (errorRate > 5 || failedLogsCount > 50) status = 'warning';

      return {
        status,
        metrics: { errorRate, logVolume: totalLogs, avgResponseTime: 0, failedLogsCount },
        alerts: []
      };
    } catch (error) {
      secureLogger.error('Critical error in getLogHealthStatus:', { error: String(error) });
      return {
        status: 'warning',
        metrics: { errorRate: 0, logVolume: 0, avgResponseTime: 0, failedLogsCount: 0 },
        alerts: [{ type: 'system', message: 'Health monitoring system error', severity: 'medium' }]
      };
    }
  }
}
