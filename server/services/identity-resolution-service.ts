import { db } from '../db';
import { customerProfile, customerIdentity, eventStore } from '@shared/schema';
import type { CustomerProfile } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { secureLogger } from '../utils/secure-logger';

export interface IdentifierInput {
  type: 'email' | 'whatsapp' | 'crm_id' | 'phone' | string;
  value: string;
  sourceSystem?: string;
  confidence?: number;
}

export interface ResolveResult {
  profileId: string;
  isNew: boolean;
  mergedIdentifiers: number;
}

function canonicalizeIdentifier(type: string, value: string): string {
  const trimmed = value.trim();
  switch (type) {
    case 'email':
      return trimmed.toLowerCase();
    case 'phone':
    case 'whatsapp':
      return trimmed.replace(/[\s\-\(\)\.]+/g, '');
    default:
      return trimmed;
  }
}

export class IdentityResolutionService {
  async resolve(identifiers: IdentifierInput[]): Promise<ResolveResult> {
    if (!identifiers.length) {
      throw new Error('At least one identifier is required');
    }

    const canonicalized = identifiers.map(id => ({
      ...id,
      value: canonicalizeIdentifier(id.type, id.value),
    }));

    return await db.transaction(async (tx) => {
      const matchedProfileIds = new Set<string>();

      for (const identifier of canonicalized) {
        const existing = await tx
          .select({ profileId: customerIdentity.profileId })
          .from(customerIdentity)
          .where(
            and(
              eq(customerIdentity.identifierType, identifier.type),
              eq(customerIdentity.identifierValue, identifier.value)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          matchedProfileIds.add(existing[0].profileId);
        }
      }

      const uniqueProfileIds = Array.from(matchedProfileIds);

      if (uniqueProfileIds.length === 0) {
        return await this.createNewProfile(tx, canonicalized);
      }

      const primaryProfileId = uniqueProfileIds[0];

      if (uniqueProfileIds.length > 1) {
        await this.mergeProfiles(tx, primaryProfileId, uniqueProfileIds.slice(1));
      }

      await this.addMissingIdentifiers(tx, primaryProfileId, canonicalized);

      return {
        profileId: primaryProfileId,
        isNew: false,
        mergedIdentifiers: canonicalized.length,
      };
    });
  }

  private async createNewProfile(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    identifiers: IdentifierInput[]
  ): Promise<ResolveResult> {
    const profileData: Record<string, string | undefined> = {};

    for (const id of identifiers) {
      if (id.type === 'email') profileData.email = id.value;
      if (id.type === 'phone') profileData.phoneNumber = id.value;
      if (id.type === 'whatsapp') profileData.whatsappId = id.value;
    }

    const [profile] = await tx
      .insert(customerProfile)
      .values({
        email: profileData.email,
        phoneNumber: profileData.phoneNumber,
        whatsappId: profileData.whatsappId,
      })
      .returning();

    for (const identifier of identifiers) {
      await tx.insert(customerIdentity).values({
        profileId: profile.id,
        identifierType: identifier.type,
        identifierValue: identifier.value,
        sourceSystem: identifier.sourceSystem,
        confidence: identifier.confidence ?? 1.0,
      });
    }

    secureLogger.info('Created new CDP profile via identity resolution', {
      profileId: profile.id,
      identifierCount: identifiers.length,
    }, 'IDENTITY_RESOLUTION');

    return {
      profileId: profile.id,
      isNew: true,
      mergedIdentifiers: identifiers.length,
    };
  }

  private async mergeProfiles(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    primaryId: string,
    secondaryIds: string[]
  ): Promise<void> {
    for (const secondaryId of secondaryIds) {
      await tx
        .update(customerIdentity)
        .set({ profileId: primaryId })
        .where(eq(customerIdentity.profileId, secondaryId));

      await tx
        .update(eventStore)
        .set({ profileId: primaryId })
        .where(eq(eventStore.profileId, secondaryId));

      const [primary] = await tx
        .select({ mergedProfileIds: customerProfile.mergedProfileIds })
        .from(customerProfile)
        .where(eq(customerProfile.id, primaryId));

      const existingMerged = primary?.mergedProfileIds ?? [];
      const updatedMerged = [...existingMerged, secondaryId];

      await tx
        .update(customerProfile)
        .set({
          mergedProfileIds: updatedMerged,
          updatedAt: new Date(),
        })
        .where(eq(customerProfile.id, primaryId));

      await tx
        .delete(customerProfile)
        .where(eq(customerProfile.id, secondaryId));

      secureLogger.info('Merged CDP profiles', {
        primaryProfileId: primaryId,
        mergedProfileId: secondaryId,
      }, 'IDENTITY_RESOLUTION');
    }
  }

  private async addMissingIdentifiers(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    profileId: string,
    identifiers: IdentifierInput[]
  ): Promise<void> {
    for (const identifier of identifiers) {
      const existing = await tx
        .select({ id: customerIdentity.id })
        .from(customerIdentity)
        .where(
          and(
            eq(customerIdentity.identifierType, identifier.type),
            eq(customerIdentity.identifierValue, identifier.value)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await tx.insert(customerIdentity).values({
          profileId,
          identifierType: identifier.type,
          identifierValue: identifier.value,
          sourceSystem: identifier.sourceSystem,
          confidence: identifier.confidence ?? 1.0,
        });
      } else {
        await tx
          .update(customerIdentity)
          .set({ lastSeenAt: new Date() })
          .where(eq(customerIdentity.id, existing[0].id));
      }
    }
  }

  async getProfileByIdentifier(type: string, value: string): Promise<CustomerProfile | undefined> {
    const canonical = canonicalizeIdentifier(type, value);

    const result = await db
      .select({ profileId: customerIdentity.profileId })
      .from(customerIdentity)
      .where(
        and(
          eq(customerIdentity.identifierType, type),
          eq(customerIdentity.identifierValue, canonical)
        )
      )
      .limit(1);

    if (result.length === 0) return undefined;

    const [profile] = await db
      .select()
      .from(customerProfile)
      .where(eq(customerProfile.id, result[0].profileId));

    return profile;
  }
}

export const identityResolutionService = new IdentityResolutionService();
