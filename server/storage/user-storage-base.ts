import { users, userSessions, type User, type InsertUser, type UserSession, type InsertUserSession } from "@shared/schema";
import { db } from "../db";
import { eq, desc, count, sql } from "drizzle-orm";
import { secureLogger } from "../utils/secure-logger";
import { LogStorageBase } from "./log-storage-base";

export abstract class UserStorageBase extends LogStorageBase {
  async getUsers(offset = 0, limit = 50): Promise<{ users: User[], total: number }> {
    try {
      const [userList, totalResult] = await Promise.all([
        db.select().from(users).limit(limit).offset(offset).orderBy(desc(users.createdAt)),
        db.select({ count: count() }).from(users)
      ]);
      return { users: userList, total: totalResult[0].count };
    } catch (error) {
      secureLogger.error('[Storage] Failed to get users:', { error: String(error) });
      return { users: [], total: 0 };
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to get user:', { error: String(error) });
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to get user by email:', { error: String(error) });
      return undefined;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      const result = await db.insert(users).values(user).returning();
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to create user:', { error: String(error) });
      if (error instanceof Error && error.message.includes('duplicate key')) {
        throw new Error('A user with this email already exists');
      }
      throw new Error('Failed to create user');
    }
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User> {
    try {
      const result = await db.update(users).set({ ...user, updatedAt: new Date() }).where(eq(users.id, id)).returning();
      if (!result[0]) throw new Error('User not found');
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to update user:', { error: String(error) });
      if (error instanceof Error && error.message === 'User not found') throw error;
      throw new Error('Failed to update user');
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const result = await db.delete(users).where(eq(users.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      secureLogger.error('[Storage] Failed to delete user:', { error: String(error) });
      throw new Error('Failed to delete user');
    }
  }

  async createUserSession(session: InsertUserSession): Promise<UserSession> {
    try {
      const result = await db.insert(userSessions).values(session).returning();
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to create user session:', { error: String(error) });
      throw new Error('Failed to create session');
    }
  }

  async getUserSession(sessionToken: string): Promise<UserSession | undefined> {
    try {
      const result = await db.select().from(userSessions).where(eq(userSessions.sessionToken, sessionToken)).limit(1);
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to get user session:', { error: String(error) });
      return undefined;
    }
  }

  async deleteUserSession(sessionToken: string): Promise<boolean> {
    try {
      const result = await db.delete(userSessions).where(eq(userSessions.sessionToken, sessionToken));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      secureLogger.error('[Storage] Failed to delete user session:', { error: String(error) });
      return false;
    }
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    try {
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    } catch (error) {
      secureLogger.error('[Storage] Failed to update user last login:', { error: String(error) });
    }
  }

  async getUserByActivationToken(token: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.activationToken, token)).limit(1);
      return result[0];
    } catch (error) {
      secureLogger.error('Failed to get user by activation token', { error: error instanceof Error ? error.message : String(error) }, 'STORAGE');
      return undefined;
    }
  }

  async activateUser(id: string): Promise<User> {
    try {
      const result = await db.update(users)
        .set({ isActive: true, isEmailVerified: true, activationToken: null, activationTokenExpires: null, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      if (!result[0]) throw new Error('User not found');
      return result[0];
    } catch (error) {
      secureLogger.error('[Storage] Failed to activate user:', { error: String(error) });
      if (error instanceof Error && error.message === 'User not found') throw error;
      throw new Error('Failed to activate user');
    }
  }

  async updateUserActivationToken(id: string, token: string, expires: Date): Promise<User> {
    try {
      const result = await db.update(users)
        .set({ activationToken: token, activationTokenExpires: expires, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      if (!result[0]) throw new Error('User not found');
      return result[0];
    } catch (error) {
      secureLogger.error('Failed to update user activation token', { error: error instanceof Error ? error.message : String(error) }, 'STORAGE');
      if (error instanceof Error && error.message === 'User not found') throw error;
      throw new Error('Failed to update activation token');
    }
  }
}
