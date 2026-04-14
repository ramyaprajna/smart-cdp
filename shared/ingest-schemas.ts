import { z } from "zod";

export const sourceChannels = ["waba", "wa_flow", "crm", "web", "iot", "api", "webhook"] as const;
export type SourceChannel = (typeof sourceChannels)[number];

const identifierSchema = z.object({
  type: z.enum(["email", "phone", "national_id", "wa_id", "external_id", "device_id", "session_id", "cookie_id"]),
  value: z.string().min(1),
});

const baseIngestPayloadSchema = z.object({
  sourceChannel: z.enum(sourceChannels),
  idempotencyKey: z.string().min(1).max(256),
  eventType: z.string().min(1).max(128),
  eventTimestamp: z.string().datetime().optional(),
  identifiers: z.array(identifierSchema).optional().default([]),  // Optional — anonymous events allowed
  properties: z.record(z.unknown()).optional().default({}),
});

const wabaPayloadSchema = baseIngestPayloadSchema.extend({
  sourceChannel: z.literal("waba"),
  wabaMetadata: z
    .object({
      waMessageId: z.string().optional(),
      waPhoneNumberId: z.string().optional(),
      waBusinessAccountId: z.string().optional(),
      templateName: z.string().optional(),
      messageType: z.enum(["text", "image", "document", "template", "interactive", "reaction", "location", "contacts", "sticker", "audio", "video", "order", "unknown"]).optional(),
    })
    .optional()
    .default({}),
});

const waFlowPayloadSchema = baseIngestPayloadSchema.extend({
  sourceChannel: z.literal("wa_flow"),
  flowMetadata: z
    .object({
      flowId: z.string().optional(),
      flowName: z.string().optional(),
      screenId: z.string().optional(),
      responsePayload: z.record(z.unknown()).optional(),
    })
    .optional()
    .default({}),
});

const crmPayloadSchema = baseIngestPayloadSchema.extend({
  sourceChannel: z.literal("crm"),
  crmMetadata: z
    .object({
      crmSystem: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      changeType: z.enum(["create", "update", "delete", "merge"]).optional(),
    })
    .optional()
    .default({}),
});

export const ingestPayloadSchema = z.discriminatedUnion("sourceChannel", [
  wabaPayloadSchema,
  waFlowPayloadSchema,
  crmPayloadSchema,
]);

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
export type IngestIdentifier = z.infer<typeof identifierSchema>;
export type WabaPayload = z.infer<typeof wabaPayloadSchema>;
export type WaFlowPayload = z.infer<typeof waFlowPayloadSchema>;
export type CrmPayload = z.infer<typeof crmPayloadSchema>;
