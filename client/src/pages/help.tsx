import { memo, useRef, useState, useCallback } from "react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Webhook, Send, Megaphone, MessageSquare, Plug, FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre">
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function EventTypeRow({ event, desc, fields }: { event: string; desc: string; fields: string }) {
  return (
    <div className="flex items-start gap-3 p-2 bg-muted rounded">
      <Badge variant="outline" className="shrink-0 mt-0.5 font-mono text-xs">{event}</Badge>
      <div>
        <p className="text-sm">{desc}</p>
        <p className="text-xs text-muted-foreground mt-1">Key fields: {fields}</p>
      </div>
    </div>
  );
}

const pdfSection: React.CSSProperties = { marginBottom: "32px", pageBreakInside: "avoid" as const };
const pdfHeading: React.CSSProperties = { fontSize: "20px", fontWeight: "bold", margin: "0 0 16px 0", color: "#0a0a0a", borderBottom: "1px solid #e5e5e5", paddingBottom: "8px" };
const pdfSubheading: React.CSSProperties = { fontSize: "15px", fontWeight: 600, margin: "16px 0 8px 0", color: "#171717" };
const pdfText: React.CSSProperties = { fontSize: "13px", color: "#525252", lineHeight: "1.6", margin: "0 0 8px 0" };
const pdfCode: React.CSSProperties = { background: "#f5f5f5", border: "1px solid #e5e5e5", borderRadius: "6px", padding: "12px 16px", fontSize: "11px", fontFamily: "monospace", whiteSpace: "pre-wrap" as const, overflowWrap: "break-word" as const, margin: "8px 0 16px 0", color: "#171717" };
const pdfBadge: React.CSSProperties = { display: "inline-block", background: "#f5f5f5", border: "1px solid #d4d4d4", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontFamily: "monospace", marginRight: "8px" };
const pdfRow: React.CSSProperties = { background: "#fafafa", border: "1px solid #e5e5e5", borderRadius: "6px", padding: "8px 12px", marginBottom: "6px", fontSize: "13px" };

function PdfWabaWebhook() {
  return (
    <div data-pdf-section style={pdfSection}>
      <h2 style={pdfHeading}>1. WABA Webhook Setup with Meta</h2>
      <p style={pdfText}>The Smart CDP platform receives WhatsApp Business API events via a webhook endpoint. Meta sends delivery status updates (sent, delivered, read, failed) and inbound messages to this endpoint for real-time event processing.</p>
      <h3 style={pdfSubheading}>Webhook Verification (GET)</h3>
      <p style={pdfText}>When configuring the webhook in Meta's App Dashboard, Meta sends a verification request:</p>
      <p style={pdfText}><span style={pdfBadge}>GET</span> <code>/api/webhooks/waba</code></p>
      <p style={pdfText}>Set the WABA_WEBHOOK_VERIFY_TOKEN environment variable to a secret string. Enter the same string as the "Verify Token" in Meta's webhook configuration.</p>
      <h3 style={pdfSubheading}>Event Callbacks (POST)</h3>
      <p style={pdfText}><span style={pdfBadge}>POST</span> <code>/api/webhooks/waba</code></p>
      <p style={pdfText}>Meta sends event payloads with an X-Hub-Signature-256 header for HMAC-SHA256 verification. Set WABA_WEBHOOK_SECRET to your app secret for signature validation. In production, WABA_WEBHOOK_SECRET must be set — all webhook POSTs are rejected without it.</p>
      <h3 style={pdfSubheading}>Environment Variables</h3>
      <pre style={pdfCode}>{`WABA_ACCESS_TOKEN=your_meta_access_token
WABA_PHONE_NUMBER_ID=your_phone_number_id
WABA_BUSINESS_ACCOUNT_ID=your_business_account_id
WABA_WEBHOOK_VERIFY_TOKEN=your_chosen_verify_token
WABA_WEBHOOK_SECRET=your_meta_app_secret`}</pre>
      <h3 style={pdfSubheading}>Rise CRM + n8n Automation</h3>
      <p style={pdfText}>WABA delivery status events can be forwarded to Rise CRM via n8n workflows to automate CRM actions based on WhatsApp message outcomes.</p>
      <p style={pdfText}><strong>CRM actions by delivery status:</strong></p>
      <div style={pdfRow}><span style={pdfBadge}>sent</span> Log a Rise CRM activity note via POST /index.php/notes</div>
      <div style={pdfRow}><span style={pdfBadge}>failed</span> Auto-create a Rise CRM support ticket via POST /index.php/tickets</div>
      <div style={pdfRow}><span style={pdfBadge}>delivered</span> Add a client note in Rise CRM via POST /index.php/notes</div>
      <div style={pdfRow}><span style={pdfBadge}>read</span> Update lead status in Rise CRM kanban via PUT /index.php/leads/&lt;id&gt;</div>
      <pre style={pdfCode}>{`// n8n Switch Node — route by WABA delivery status
// Branch: "failed" → HTTP Request to Rise CRM
Method: POST
URL: https://your-rise-crm.com/index.php/tickets
Headers:
  Authorization: Bearer {{ $credentials.riseCrmToken }}
Body:
{
  "title": "WhatsApp delivery failed — {{ $json.recipientPhone }}",
  "description": "Template: {{ $json.templateName }}\\nError: {{ $json.failureReason }}",
  "client_id": {{ $json.riseCrmClientId }},
  "labels": ["whatsapp-failure", "auto-generated"]
}

// Branch: "read" → HTTP Request to Rise CRM
Method: PUT
URL: https://your-rise-crm.com/index.php/leads/{{ $json.riseCrmLeadId }}
Body:
{
  "status": "Engaged",
  "note": "Customer read WhatsApp campaign at {{ $json.readTimestamp }}"
}`}</pre>
    </div>
  );
}

function PdfEventIngestion() {
  return (
    <div data-pdf-section style={pdfSection}>
      <h2 style={pdfHeading}>2. Event Ingestion API</h2>
      <h3 style={pdfSubheading}>Endpoint</h3>
      <p style={pdfText}><span style={pdfBadge}>POST</span> <code>/api/ingest/event</code></p>
      <p style={pdfText}>Ingest customer events into the CDP pipeline. Events go through a 4-step process: Validate → Normalize → Deduplicate → Write. Rate limited to 60 requests per minute.</p>
      <h3 style={pdfSubheading}>Authentication</h3>
      <p style={pdfText}>No JWT authentication required for this endpoint, but it is rate-limited. The rate limiter allows 60 requests per 60 seconds per IP.</p>
      <h3 style={pdfSubheading}>Payload Format</h3>
      <pre style={pdfCode}>{`{
  "eventType": "invoice.paid",
  "sourceChannel": "rise_crm",
  "identifiers": [
    { "type": "email", "value": "client@example.com" },
    { "type": "phone", "value": "+60123456789" },
    { "type": "crm_id", "value": "42" }
  ],
  "idempotencyKey": "rise-invoice.paid-42-2026-03-30T10:00:00Z",
  "eventTimestamp": "2026-03-30T10:00:00Z",
  "properties": {
    "invoice_id": "INV-1234",
    "amount": 2500.00,
    "currency": "MYR",
    "source_system": "rise_crm"
  }
}`}</pre>
      <h3 style={pdfSubheading}>Idempotency</h3>
      <p style={pdfText}>The idempotencyKey field ensures duplicate events are not processed twice. If a duplicate is detected, the API returns 200 with status: "already_processed" instead of creating a new event.</p>
      <h3 style={pdfSubheading}>Response</h3>
      <pre style={pdfCode}>{`// Success (201)
{
  "status": "created",
  "event": { "id": "...", "profileId": "...", ... },
  "isNewProfile": false
}

// Duplicate (200)
{
  "status": "already_processed",
  "eventId": "...",
  "message": "Duplicate event — already ingested"
}`}</pre>
      <h3 style={pdfSubheading}>Supported Source Channels</h3>
      <p style={pdfText}>{["web", "mobile", "api", "waba", "wa_flow", "rise_crm", "crm", "import"].map(ch => `[${ch}]`).join("  ")}</p>
      <h3 style={pdfSubheading}>Rise CRM Plugin Hook (PHP)</h3>
      <pre style={pdfCode}>{`<?php
// File: app/Hooks/CdpEventHook.php (CodeIgniter 4)
namespace App\\Hooks;

use App\\Models\\ClientsModel;
use App\\Models\\InvoicesModel;
use App\\Models\\TicketsModel;

class CdpEventHook {
    private string $n8nUrl = 'https://your-n8n.com/webhook/rise-crm-events';

    public function onClientCreated(int $clientId): void {
        $client = model(ClientsModel::class)->find($clientId);
        $this->emit('client.created', [
            'client_id' => $clientId,
            'email'     => $client['email'],
            'phone'     => $client['phone'],
            'company'   => $client['company_name'],
        ]);
    }

    public function onInvoicePaid(int $invoiceId): void {
        $invoice = model(InvoicesModel::class)->find($invoiceId);
        $this->emit('invoice.paid', [
            'client_id'  => $invoice['client_id'],
            'invoice_id' => $invoiceId,
            'amount'     => $invoice['invoice_value'],
            'currency'   => $invoice['currency'],
        ]);
    }

    private function emit(string $event, array $data): void {
        $payload = array_merge($data, [
            'event'     => $event,
            'timestamp' => date('c'),
            'source'    => 'rise_crm',
        ]);
        $client = \\Config\\Services::curlrequest();
        $client->post($this->n8nUrl, [
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => json_encode($payload),
            'timeout' => 5,
        ]);
    }
}`}</pre>
      <h3 style={pdfSubheading}>n8n Workflow — Transform & Forward to CDP</h3>
      <pre style={pdfCode}>{`Method: POST
URL: https://your-cdp.com/api/ingest/event
Headers: Content-Type: application/json
Body:
{
  "eventType": "{{ $json.event }}",
  "sourceChannel": "rise_crm",
  "identifiers": [
    { "type": "email", "value": "{{ $json.email }}" },
    { "type": "phone", "value": "{{ $json.phone }}" },
    { "type": "crm_id", "value": "{{ $json.client_id }}" }
  ],
  "idempotencyKey": "rise-{{ $json.event }}-{{ $json.client_id }}-{{ $json.timestamp }}",
  "properties": {
    "company": "{{ $json.company }}",
    "source_system": "rise_crm",
    "rise_crm_entity": "client"
  }
}`}</pre>
      <h3 style={pdfSubheading}>Common Rise CRM Event Types</h3>
      {[
        { event: "client.created", desc: "New client added to Rise CRM" },
        { event: "invoice.paid", desc: "Client paid an invoice" },
        { event: "ticket.opened", desc: "Support ticket created" },
        { event: "lead.converted", desc: "Lead converted to client" },
        { event: "task.completed", desc: "Project task marked done" },
        { event: "proposal.accepted", desc: "Client accepted a proposal" },
      ].map(e => (
        <div key={e.event} style={pdfRow}><span style={pdfBadge}>{e.event}</span> {e.desc}</div>
      ))}
    </div>
  );
}

function PdfCampaignApi() {
  return (
    <div data-pdf-section style={pdfSection}>
      <h2 style={pdfHeading}>3. Campaign API Reference</h2>
      <h3 style={pdfSubheading}>Authentication</h3>
      <p style={pdfText}>All campaign endpoints require JWT authentication via Authorization: Bearer &lt;token&gt;. Write operations require admin or marketing role. Read operations also allow the analyst role.</p>
      <h3 style={pdfSubheading}>Endpoints</h3>
      {[
        { method: "POST", path: "/api/campaigns", desc: "Create a new campaign" },
        { method: "GET", path: "/api/campaigns", desc: "List campaigns (supports ?status, ?channel, ?limit, ?offset)" },
        { method: "GET", path: "/api/campaigns/:id", desc: "Get campaign details" },
        { method: "PATCH", path: "/api/campaigns/:id", desc: "Update campaign (draft only)" },
        { method: "POST", path: "/api/campaigns/:id/schedule", desc: "Schedule campaign for future execution" },
        { method: "POST", path: "/api/campaigns/:id/execute", desc: "Execute campaign (resolve audience + generate messages)" },
        { method: "POST", path: "/api/campaigns/:id/cancel", desc: "Cancel a draft or scheduled campaign" },
        { method: "POST", path: "/api/campaigns/:id/complete", desc: "Mark a sending campaign as completed" },
        { method: "GET", path: "/api/campaigns/:id/analytics", desc: "Get campaign delivery analytics" },
        { method: "GET", path: "/api/campaigns/:id/messages", desc: "List campaign messages" },
        { method: "POST", path: "/api/campaigns/:id/delivery-status", desc: "Update delivery status (channel callback)" },
        { method: "GET", path: "/api/campaigns/:id/audience-preview", desc: "Preview audience without executing" },
      ].map(ep => (
        <div key={ep.path + ep.method} style={pdfRow}><span style={pdfBadge}>{ep.method}</span> <code>{ep.path}</code> — {ep.desc}</div>
      ))}
      <h3 style={pdfSubheading}>Create Campaign Payload</h3>
      <pre style={pdfCode}>{`{
  "name": "March Promo",
  "description": "Monthly promotion campaign",
  "channel": "whatsapp",
  "segmentDefinitionId": "uuid-of-segment",
  "templateId": "hello_world",
  "scheduledAt": "2026-04-01T09:00:00Z",
  "metadata": { "source": "marketing_team" }
}`}</pre>
      <h3 style={pdfSubheading}>Campaign Status Lifecycle</h3>
      <p style={pdfText}>draft → scheduled → sending → completed | cancelled</p>
      <h3 style={pdfSubheading}>Rise CRM + n8n Campaign Workflows</h3>
      <p style={pdfText}>Use n8n to trigger CDP WhatsApp campaigns automatically based on Rise CRM events.</p>
      {[
        { trigger: "Onboarding", desc: "Rise CRM client.created → Welcome WhatsApp campaign" },
        { trigger: "Payment", desc: "Rise CRM overdue invoice → Payment reminder via WhatsApp" },
        { trigger: "Re-engage", desc: "Rise CRM inactive leads → Re-engagement WhatsApp campaign" },
        { trigger: "Survey", desc: "Rise CRM project completed → Post-project satisfaction survey" },
      ].map(s => (
        <div key={s.trigger} style={pdfRow}><span style={pdfBadge}>{s.trigger}</span> {s.desc}</div>
      ))}
      <h3 style={pdfSubheading}>n8n Workflow — New Client Onboarding Campaign</h3>
      <pre style={pdfCode}>{`// Step 1: n8n Webhook Trigger receives Rise CRM client.created event

// Step 2: Authenticate with CDP
Method: POST
URL: https://your-cdp.com/api/auth/login
Body: { "email": "n8n-bot@company.com", "password": "{{ $credentials.cdpBotPassword }}" }

// Step 3: Create campaign
Method: POST
URL: https://your-cdp.com/api/campaigns
Headers: Authorization: Bearer {{ $node["Auth"].json.token }}
Body:
{
  "name": "Welcome — {{ $node["Webhook"].json.company }}",
  "channel": "whatsapp",
  "templateId": "welcome_new_client",
  "segmentDefinitionId": "new-clients-segment-uuid",
  "metadata": {
    "source": "rise_crm",
    "trigger": "client.created",
    "rise_crm_client_id": "{{ $node["Webhook"].json.client_id }}"
  }
}

// Step 4: Execute campaign
Method: POST
URL: https://your-cdp.com/api/campaigns/{{ $node["Create"].json.id }}/execute
Headers: Authorization: Bearer {{ $node["Auth"].json.token }}`}</pre>
    </div>
  );
}

function PdfWabaSend() {
  return (
    <div data-pdf-section style={pdfSection}>
      <h2 style={pdfHeading}>4. WABA Send APIs</h2>
      <h3 style={pdfSubheading}>Authentication</h3>
      <p style={pdfText}>All send endpoints require JWT authentication and admin or marketing role. WABA must be configured via environment variables.</p>
      <h3 style={pdfSubheading}>Send Template Message</h3>
      <p style={pdfText}><span style={pdfBadge}>POST</span> <code>/api/waba/send/template</code></p>
      <pre style={pdfCode}>{`{
  "to": "60123456789",
  "templateName": "hello_world",
  "languageCode": "en",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "John" }
      ]
    }
  ]
}`}</pre>
      <h3 style={pdfSubheading}>Send Text Message</h3>
      <p style={pdfText}><span style={pdfBadge}>POST</span> <code>/api/waba/send/text</code></p>
      <pre style={pdfCode}>{`{
  "to": "60123456789",
  "text": "Hello! This is a test message.",
  "previewUrl": false
}`}</pre>
      <p style={pdfText}>Text messages can only be sent within a 24-hour conversation window.</p>
      <h3 style={pdfSubheading}>Send Interactive Message</h3>
      <p style={pdfText}><span style={pdfBadge}>POST</span> <code>/api/waba/send/interactive</code></p>
      <pre style={pdfCode}>{`{
  "to": "60123456789",
  "interactive": {
    "type": "button",
    "body": { "text": "Choose an option:" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "btn_yes", "title": "Yes" } },
        { "type": "reply", "reply": { "id": "btn_no", "title": "No" } }
      ]
    }
  }
}`}</pre>
      <h3 style={pdfSubheading}>Campaign Broadcast</h3>
      <p style={pdfText}><span style={pdfBadge}>POST</span> <code>/api/waba/campaigns/:id/broadcast</code></p>
      <pre style={pdfCode}>{`{
  "concurrency": 10,
  "batchDelayMs": 1000
}`}</pre>
      <p style={pdfText}>Broadcasts all pending messages for an executed campaign with configurable concurrency and rate limiting delay between batches.</p>
      <h3 style={pdfSubheading}>Rise CRM Triggered Messages via n8n</h3>
      <p style={pdfText}>Use n8n workflows to send individual WhatsApp messages triggered by Rise CRM events. These are 1:1 messages (not campaign broadcasts) sent via the CDP WABA Send API.</p>
      {[
        { trigger: "Invoice", desc: "Rise CRM invoice created → WhatsApp notification to client (template: invoice_notification)" },
        { trigger: "Reminder", desc: "Rise CRM task/event due → WhatsApp appointment reminder (template: appointment_reminder)" },
        { trigger: "Support", desc: "Rise CRM ticket reply → WhatsApp update to client (template: ticket_update)" },
        { trigger: "Lead", desc: "Rise CRM new lead → WhatsApp follow-up from sales (template: lead_followup)" },
      ].map(s => (
        <div key={s.trigger} style={pdfRow}><span style={pdfBadge}>{s.trigger}</span> {s.desc}</div>
      ))}
      <h3 style={pdfSubheading}>n8n Workflow — Invoice Notification</h3>
      <pre style={pdfCode}>{`// Trigger: n8n Webhook receives Rise CRM invoice.created event

// Step 1: Authenticate with CDP
Method: POST
URL: https://your-cdp.com/api/auth/login
Body: { "email": "n8n-bot@company.com", "password": "{{ $credentials.cdpBotPassword }}" }

// Step 2: Send WhatsApp template message via CDP
Method: POST
URL: https://your-cdp.com/api/waba/send/template
Headers: Authorization: Bearer {{ $node["Auth"].json.token }}
Body:
{
  "to": "{{ $json.client_phone }}",
  "templateName": "invoice_notification",
  "languageCode": "en",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "{{ $json.client_name }}" },
        { "type": "text", "text": "{{ $json.invoice_number }}" },
        { "type": "text", "text": "{{ $json.currency }} {{ $json.amount }}" },
        { "type": "text", "text": "{{ $json.due_date }}" }
      ]
    }
  ]
}`}</pre>
    </div>
  );
}

function PdfIntegrations() {
  return (
    <div data-pdf-section style={pdfSection}>
      <h2 style={pdfHeading}>5. Rise CRM + n8n Integration</h2>
      <h3 style={pdfSubheading}>Architecture Overview</h3>
      <p style={pdfText}>The Smart CDP platform is the single source of truth for customer data, while Rise CRM (RISE Ultimate Project Manager — CodeIgniter 4 / PHP 8.x / MySQL 8.x) serves as the operational CRM. n8n acts as the orchestration bridge between both systems.</p>
      <pre style={pdfCode}>{`Rise CRM (PHP/MySQL)  ──plugin hooks──→  n8n (bridge)  ──HTTP POST──→  Smart CDP (Node/PG)
                      ←──REST API calls──              ←──segment/events──`}</pre>
      <p style={pdfText}><strong>CDP → Rise CRM (via n8n):</strong> Golden record syncs, segment membership changes, campaign delivery status updates</p>
      <p style={pdfText}><strong>Rise CRM → CDP (via n8n):</strong> Client events (created, updated), invoice events (paid, overdue), ticket events, lead conversions</p>
      <p style={pdfText}><strong>Identity linking:</strong> Rise CRM client IDs are stored in CDP's customer_identity table with identifier_type: "crm_id" for bidirectional mapping</p>

      <h3 style={pdfSubheading}>Rise CRM Plugin Hook Setup</h3>
      <p style={pdfText}>Rise CRM supports plugin hooks that let you run custom PHP code when entities change. Register hooks in Rise CRM's Settings → Plugin Hooks.</p>
      <p style={pdfText}><strong>Recommended hooks to register:</strong></p>
      {[
        { hook: "after_client_created", action: "Capture new client data for CDP profile creation" },
        { hook: "after_client_updated", action: "Sync client updates (email, phone, custom fields) to CDP" },
        { hook: "after_invoice_payment_recorded", action: "Record payment event with amount and method" },
        { hook: "after_ticket_created", action: "Track support interactions in CDP event timeline" },
        { hook: "after_lead_status_changed", action: "Update lead score and stage in CDP" },
        { hook: "after_lead_converted_to_client", action: "Merge lead profile with new client profile" },
        { hook: "after_proposal_accepted", action: "Track conversion value in CDP for analytics" },
        { hook: "after_task_completed", action: "Log project milestones for engagement scoring" },
      ].map(h => (
        <div key={h.hook} style={pdfRow}><span style={pdfBadge}>{h.hook}</span> {h.action}</div>
      ))}
      <h3 style={pdfSubheading}>Base Hook Class (PHP)</h3>
      <pre style={pdfCode}>{`<?php
// File: app/Hooks/CdpWebhookBase.php (CodeIgniter 4)
namespace App\\Hooks;

class CdpWebhookBase {
    protected string $n8nUrl;

    public function __construct() {
        $this->n8nUrl = get_setting('cdp_n8n_webhook_url')
            ?: 'https://your-n8n.com/webhook/rise-crm-events';
    }

    protected function emit(string $event, array $data): void {
        $payload = array_merge($data, [
            'event'     => $event,
            'timestamp' => date('c'),
            'source'    => 'rise_crm',
        ]);
        $client = \\Config\\Services::curlrequest();
        $client->post($this->n8nUrl, [
            'headers' => ['Content-Type' => 'application/json', 'X-Rise-Hook' => $event],
            'body'    => json_encode($payload),
            'timeout' => 5,
        ]);
    }
}`}</pre>

      <h3 style={pdfSubheading}>n8n Orchestration Patterns</h3>
      <p style={pdfText}><strong>Pattern 1: Rise CRM Event → CDP Ingestion</strong></p>
      <p style={pdfText}>Webhook Trigger → Switch node (routes by event) → Set node (transform fields) → HTTP Request (POST /api/ingest/event) → IF (isNewProfile) → HTTP Request (store CDP ID in Rise CRM)</p>
      <p style={pdfText}><strong>Pattern 2: CDP Segment Change → Rise CRM Client Update</strong></p>
      <p style={pdfText}>Cron Trigger (15 min) → GET segment members → Code node (diff) → SplitInBatches → PUT Rise CRM client custom field</p>
      <p style={pdfText}><strong>Pattern 3: Bidirectional Golden Record Sync</strong></p>
      <p style={pdfText}>Cron Trigger (hourly) → GET CDP updated profiles → Map fields → PUT Rise CRM clients → GET Rise CRM updated clients → POST CDP event ingestion</p>

      <h3 style={pdfSubheading}>Bidirectional Identity Mapping</h3>
      <pre style={pdfCode}>{`// CDP customer_identity record for Rise CRM link
{
  "profileId": "cdp-uuid-abc-123",
  "identifierType": "crm_id",
  "identifierValue": "42",        // Rise CRM client ID
  "sourceSystem": "rise_crm",
  "confidence": 1.0
}

// Identity resolution flow:
// 1. Rise CRM event arrives with client_id=42, email=john@example.com
// 2. CDP checks customer_identity for crm_id=42 or email=john@example.com
// 3. If found → links event to existing profile
// 4. If not found → creates new profile + stores both identifiers
// 5. If both found on different profiles → merges into single golden record`}</pre>

      <h3 style={pdfSubheading}>Environment & Prerequisites</h3>
      <p style={pdfText}>1. <strong>Rise CRM</strong> — Install RISE (CI4, PHP 8.x, MySQL 8.x). Add custom field cdp_profile_id to Clients. Enable plugin hooks.</p>
      <p style={pdfText}>2. <strong>n8n</strong> — Self-host or use n8n Cloud. Create Webhook Trigger node for Rise CRM events. Store credentials in n8n.</p>
      <p style={pdfText}>3. <strong>CDP</strong> — Create service account (n8n-bot@company.com) with marketing role for campaign operations.</p>
      <p style={pdfText}>4. <strong>Rise CRM Plugin Hooks</strong> — Deploy PHP hook classes to app/Hooks/ and register in Settings → Plugin Hooks.</p>
    </div>
  );
}

export default memo(function Help() {
  const pdfRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleDownloadPdf = useCallback(async () => {
    setIsGenerating(true);
    const container = pdfRef.current;
    try {
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const html2canvas = html2canvasModule.default;
      const { jsPDF } = jsPDFModule;

      if (!container) return;

      container.style.display = "block";
      await new Promise((r) => setTimeout(r, 300));

      const pdf = new jsPDF("p", "mm", "a4");
      const margin = 10;
      const contentWidth = 210 - margin * 2;
      const usableHeight = 297 - margin * 2;

      const sections = container.querySelectorAll("[data-pdf-section]");
      let isFirstPage = true;

      for (const section of Array.from(sections)) {
        const el = section as HTMLElement;
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: 900,
        });

        const imgHeight = (canvas.height * contentWidth) / canvas.width;
        const imgData = canvas.toDataURL("image/png");

        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;

        if (imgHeight <= usableHeight) {
          pdf.addImage(imgData, "PNG", margin, margin, contentWidth, imgHeight);
        } else {
          let heightLeft = imgHeight;
          let position = margin;
          let pageIndex = 0;

          while (heightLeft > 0) {
            if (pageIndex > 0) {
              pdf.addPage();
            }
            pdf.addImage(
              imgData,
              "PNG",
              margin,
              position,
              contentWidth,
              imgHeight
            );
            heightLeft -= usableHeight;
            position -= usableHeight;
            pageIndex++;
          }
        }
      }

      container.style.display = "none";
      pdf.save("Smart_CDP_API_Reference.pdf");
    } catch (err) {
      if (container) container.style.display = "none";
      console.error("PDF generation failed:", err);
      toast({
        title: "PDF generation failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [toast]);

  return (
    <div className="flex-1 overflow-auto">
      <Header title="Help & API Reference" subtitle="Documentation for webhooks, APIs, and Rise CRM + n8n integrations" />

      <div className="p-6">
        <Tabs defaultValue="waba-webhook">
          <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="waba-webhook">
              <Webhook className="h-4 w-4 mr-2" />
              WABA Webhook
            </TabsTrigger>
            <TabsTrigger value="event-ingestion">
              <Send className="h-4 w-4 mr-2" />
              Event Ingestion
            </TabsTrigger>
            <TabsTrigger value="campaign-api">
              <Megaphone className="h-4 w-4 mr-2" />
              Campaign API
            </TabsTrigger>
            <TabsTrigger value="waba-send">
              <MessageSquare className="h-4 w-4 mr-2" />
              WABA Send
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <Plug className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            {isGenerating ? "Generating..." : "Download PDF"}
          </Button>
          </div>

          <TabsContent value="waba-webhook" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  WABA Webhook Setup with Meta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Overview">
                  <p className="text-sm text-muted-foreground">
                    The Smart CDP platform receives WhatsApp Business API events via a webhook endpoint.
                    Meta sends delivery status updates (sent, delivered, read, failed) and inbound messages
                    to this endpoint for real-time event processing.
                  </p>
                </Section>

                <Section title="Webhook Verification (GET)">
                  <p className="text-sm text-muted-foreground mb-2">
                    When configuring the webhook in Meta's App Dashboard, Meta sends a verification request:
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>GET</Badge>
                    <code className="text-sm">/api/webhooks/waba</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Set the <code>WABA_WEBHOOK_VERIFY_TOKEN</code> environment variable to a secret string.
                    Enter the same string as the "Verify Token" in Meta's webhook configuration.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Meta will send <code>hub.mode=subscribe</code>, <code>hub.verify_token</code>, and
                    <code> hub.challenge</code> as query parameters. If the token matches, the platform
                    returns the challenge string to complete verification.
                  </p>
                </Section>

                <Section title="Event Callbacks (POST)">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>POST</Badge>
                    <code className="text-sm">/api/webhooks/waba</code>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Meta sends event payloads with an <code>X-Hub-Signature-256</code> header for HMAC-SHA256
                    verification. Set <code>WABA_WEBHOOK_SECRET</code> to your app secret for signature validation.
                  </p>
                  <p className="text-sm text-muted-foreground font-medium">
                    In production, <code>WABA_WEBHOOK_SECRET</code> must be set — all webhook POSTs are rejected without it.
                  </p>
                </Section>

                <Section title="Environment Variables">
                  <CodeBlock>{`WABA_ACCESS_TOKEN=your_meta_access_token
WABA_PHONE_NUMBER_ID=your_phone_number_id
WABA_BUSINESS_ACCOUNT_ID=your_business_account_id
WABA_WEBHOOK_VERIFY_TOKEN=your_chosen_verify_token
WABA_WEBHOOK_SECRET=your_meta_app_secret`}</CodeBlock>
                </Section>

                <Section title="Rise CRM + n8n Automation">
                  <p className="text-sm text-muted-foreground mb-2">
                    WABA delivery status events can be forwarded to Rise CRM via n8n workflows
                    to automate CRM actions based on WhatsApp message outcomes.
                  </p>
                  <p className="text-sm font-medium mb-2">Recommended n8n workflow:</p>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 mb-3">
                    <li><strong>n8n Webhook Trigger</strong> — Receives CDP delivery status forwarding</li>
                    <li><strong>Switch Node</strong> — Routes by status: <code>sent</code>, <code>delivered</code>, <code>read</code>, <code>failed</code></li>
                    <li><strong>HTTP Request to Rise CRM</strong> — Executes the appropriate CRM action</li>
                  </ol>
                  <p className="text-sm font-medium mb-2">CRM actions by delivery status:</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">sent</Badge>
                      <span>Log a Rise CRM activity note via <code>POST /index.php/notes</code> recording that the WhatsApp message was dispatched for the client record</span>
                    </div>
                    <div className="flex items-start gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">failed</Badge>
                      <span>Auto-create a Rise CRM support ticket via <code>POST /index.php/tickets</code> with the failure reason and customer phone for agent follow-up</span>
                    </div>
                    <div className="flex items-start gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">delivered</Badge>
                      <span>Add a client note in Rise CRM via <code>POST /index.php/notes</code> logging the delivery confirmation with message ID and timestamp</span>
                    </div>
                    <div className="flex items-start gap-2 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">read</Badge>
                      <span>Update lead status in Rise CRM kanban via <code>PUT /index.php/leads/&lt;id&gt;</code> — move to "Engaged" when a campaign message is read</span>
                    </div>
                  </div>
                  <CodeBlock>{`// n8n Switch Node — route by WABA delivery status
// Input: CDP webhook forwarding payload

// Branch: "failed" → HTTP Request to Rise CRM
Method: POST
URL: https://your-rise-crm.com/index.php/tickets
Headers:
  Authorization: Bearer {{ $credentials.riseCrmToken }}
  Content-Type: application/json
Body:
{
  "title": "WhatsApp delivery failed — {{ $json.recipientPhone }}",
  "description": "Template: {{ $json.templateName }}\\nError: {{ $json.failureReason }}",
  "client_id": {{ $json.riseCrmClientId }},
  "labels": ["whatsapp-failure", "auto-generated"]
}

// Branch: "read" → HTTP Request to Rise CRM
Method: PUT
URL: https://your-rise-crm.com/index.php/leads/{{ $json.riseCrmLeadId }}
Body:
{
  "status": "Engaged",
  "note": "Customer read WhatsApp campaign at {{ $json.readTimestamp }}"
}`}</CodeBlock>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="event-ingestion" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Event Ingestion API
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Endpoint">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>POST</Badge>
                    <code className="text-sm">/api/ingest/event</code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ingest customer events into the CDP pipeline. Events go through a 4-step process:
                    Validate → Normalize → Deduplicate → Write. Rate limited to 60 requests per minute.
                  </p>
                </Section>

                <Section title="Authentication">
                  <p className="text-sm text-muted-foreground">
                    No JWT authentication required for this endpoint, but it is rate-limited.
                    The rate limiter allows 60 requests per 60 seconds per IP.
                  </p>
                </Section>

                <Section title="Payload Format">
                  <CodeBlock>{`{
  "eventType": "invoice.paid",
  "sourceChannel": "rise_crm",
  "identifiers": [
    { "type": "email", "value": "client@example.com" },
    { "type": "phone", "value": "+60123456789" },
    { "type": "crm_id", "value": "42" }
  ],
  "idempotencyKey": "rise-invoice.paid-42-2026-03-30T10:00:00Z",
  "eventTimestamp": "2026-03-30T10:00:00Z",
  "properties": {
    "invoice_id": "INV-1234",
    "amount": 2500.00,
    "currency": "MYR",
    "source_system": "rise_crm"
  }
}`}</CodeBlock>
                </Section>

                <Section title="Idempotency">
                  <p className="text-sm text-muted-foreground">
                    The <code>idempotencyKey</code> field ensures duplicate events are not processed twice.
                    If a duplicate is detected, the API returns <code>200</code> with
                    <code> status: "already_processed"</code> instead of creating a new event.
                  </p>
                </Section>

                <Section title="Response">
                  <CodeBlock>{`// Success (201)
{
  "status": "created",
  "event": { "id": "...", "profileId": "...", ... },
  "isNewProfile": false
}

// Duplicate (200)
{
  "status": "already_processed",
  "eventId": "...",
  "message": "Duplicate event — already ingested"
}`}</CodeBlock>
                </Section>

                <Section title="Supported Source Channels">
                  <div className="flex flex-wrap gap-2">
                    {["web", "mobile", "api", "waba", "wa_flow", "rise_crm", "crm", "import"].map((ch) => (
                      <Badge key={ch} variant="outline">{ch}</Badge>
                    ))}
                  </div>
                </Section>

                <Section title="Sending Events from Rise CRM via n8n">
                  <p className="text-sm text-muted-foreground mb-3">
                    Rise CRM (RISE Ultimate Project Manager) fires internal events when clients, invoices,
                    tickets, leads, or tasks change. Use Rise CRM's <strong>plugin hook system</strong> to
                    POST these events to an n8n webhook, which then forwards them to the CDP with
                    <code> sourceChannel: "rise_crm"</code>.
                  </p>
                  <p className="text-sm font-medium mb-2">Data flow: Rise CRM Plugin Hook → n8n → CDP Event Ingestion</p>

                  <p className="text-sm font-medium mt-3 mb-2">Rise CRM Plugin Hook (PHP):</p>
                  <CodeBlock>{`<?php
// File: app/Hooks/CdpEventHook.php (CodeIgniter 4)
// Rise CRM plugin hook — fires on entity changes

namespace App\\Hooks;

use App\\Models\\ClientsModel;
use App\\Models\\InvoicesModel;
use App\\Models\\TicketsModel;
use CodeIgniter\\HTTP\\CURLRequest;

class CdpEventHook {
    private string $n8nUrl = 'https://your-n8n.com/webhook/rise-crm-events';

    public function onClientCreated(int $clientId): void {
        $client = model(ClientsModel::class)->find($clientId);
        $this->emit('client.created', [
            'client_id' => $clientId,
            'email'     => $client['email'],
            'phone'     => $client['phone'],
            'company'   => $client['company_name'],
        ]);
    }

    public function onInvoicePaid(int $invoiceId): void {
        $invoice = model(InvoicesModel::class)->find($invoiceId);
        $this->emit('invoice.paid', [
            'client_id'  => $invoice['client_id'],
            'invoice_id' => $invoiceId,
            'amount'     => $invoice['invoice_value'],
            'currency'   => $invoice['currency'],
        ]);
    }

    public function onTicketOpened(int $ticketId): void {
        $ticket = model(TicketsModel::class)->find($ticketId);
        $this->emit('ticket.opened', [
            'client_id' => $ticket['client_id'],
            'ticket_id' => $ticketId,
            'subject'   => $ticket['title'],
            'priority'  => $ticket['priority'],
        ]);
    }

    public function onLeadConverted(int $leadId, int $clientId): void {
        $this->emit('lead.converted', [
            'lead_id'   => $leadId,
            'client_id' => $clientId,
        ]);
    }

    private function emit(string $event, array $data): void {
        $payload = array_merge($data, [
            'event'     => $event,
            'timestamp' => date('c'),
            'source'    => 'rise_crm',
        ]);
        $client = \\Config\\Services::curlrequest();
        $client->post($this->n8nUrl, [
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => json_encode($payload),
            'timeout' => 5,
        ]);
    }
}`}</CodeBlock>

                  <p className="text-sm font-medium mt-4 mb-2">n8n Workflow — Transform & Forward to CDP:</p>
                  <CodeBlock>{`// n8n HTTP Request Node — forwards Rise CRM event to CDP
Method: POST
URL: https://your-cdp.com/api/ingest/event
Headers:
  Content-Type: application/json
Body:
{
  "eventType": "{{ $json.event }}",
  "sourceChannel": "rise_crm",
  "identifiers": [
    { "type": "email", "value": "{{ $json.email }}" },
    { "type": "phone", "value": "{{ $json.phone }}" },
    { "type": "crm_id", "value": "{{ $json.client_id }}" }
  ],
  "idempotencyKey": "rise-{{ $json.event }}-{{ $json.client_id }}-{{ $json.timestamp }}",
  "properties": {
    "company": "{{ $json.company }}",
    "source_system": "rise_crm",
    "rise_crm_entity": "client"
  }
}`}</CodeBlock>

                  <p className="text-sm font-medium mt-4 mb-2">Common Rise CRM Event Types:</p>
                  <div className="space-y-2">
                    <EventTypeRow event="client.created" desc="New client added to Rise CRM" fields="email, phone, company_name, custom_fields" />
                    <EventTypeRow event="invoice.paid" desc="Client paid an invoice" fields="invoice_id, amount, currency, payment_method" />
                    <EventTypeRow event="ticket.opened" desc="Support ticket created" fields="ticket_id, subject, priority, assigned_to" />
                    <EventTypeRow event="lead.converted" desc="Lead converted to client" fields="lead_id, new_client_id, source, conversion_value" />
                    <EventTypeRow event="task.completed" desc="Project task marked done" fields="task_id, project_id, assignee, hours_logged" />
                    <EventTypeRow event="proposal.accepted" desc="Client accepted a proposal" fields="proposal_id, total_value, items_count" />
                  </div>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaign-api" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Campaign API Reference
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Authentication">
                  <p className="text-sm text-muted-foreground">
                    All campaign endpoints require JWT authentication via <code>Authorization: Bearer &lt;token&gt;</code>.
                    Write operations require <code>admin</code> or <code>marketing</code> role.
                    Read operations also allow the <code>analyst</code> role.
                  </p>
                </Section>

                <Section title="Endpoints">
                  <div className="space-y-3">
                    {[
                      { method: "POST", path: "/api/campaigns", desc: "Create a new campaign" },
                      { method: "GET", path: "/api/campaigns", desc: "List campaigns (supports ?status, ?channel, ?limit, ?offset)" },
                      { method: "GET", path: "/api/campaigns/:id", desc: "Get campaign details" },
                      { method: "PATCH", path: "/api/campaigns/:id", desc: "Update campaign (draft only)" },
                      { method: "POST", path: "/api/campaigns/:id/schedule", desc: "Schedule campaign for future execution" },
                      { method: "POST", path: "/api/campaigns/:id/execute", desc: "Execute campaign (resolve audience + generate messages)" },
                      { method: "POST", path: "/api/campaigns/:id/cancel", desc: "Cancel a draft or scheduled campaign" },
                      { method: "POST", path: "/api/campaigns/:id/complete", desc: "Mark a sending campaign as completed" },
                      { method: "GET", path: "/api/campaigns/:id/analytics", desc: "Get campaign delivery analytics" },
                      { method: "GET", path: "/api/campaigns/:id/messages", desc: "List campaign messages" },
                      { method: "POST", path: "/api/campaigns/:id/delivery-status", desc: "Update delivery status (channel callback)" },
                      { method: "GET", path: "/api/campaigns/:id/audience-preview", desc: "Preview audience without executing" },
                    ].map((ep) => (
                      <div key={ep.path + ep.method} className="flex items-start gap-3 p-2 bg-muted rounded">
                        <Badge className="shrink-0 mt-0.5">{ep.method}</Badge>
                        <div>
                          <code className="text-sm">{ep.path}</code>
                          <p className="text-xs text-muted-foreground mt-1">{ep.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Create Campaign Payload">
                  <CodeBlock>{`{
  "name": "March Promo",
  "description": "Monthly promotion campaign",
  "channel": "whatsapp",
  "segmentDefinitionId": "uuid-of-segment",
  "templateId": "hello_world",
  "scheduledAt": "2026-04-01T09:00:00Z",
  "metadata": { "source": "marketing_team" }
}`}</CodeBlock>
                </Section>

                <Section title="Campaign Status Lifecycle">
                  <div className="flex items-center gap-2 flex-wrap">
                    {["draft", "scheduled", "sending", "completed", "cancelled"].map((s, i) => (
                      <span key={s} className="flex items-center gap-1">
                        <Badge variant="outline">{s}</Badge>
                        {i < 3 && <span className="text-muted-foreground">→</span>}
                      </span>
                    ))}
                  </div>
                </Section>

                <Section title="Rise CRM + n8n Campaign Workflows">
                  <p className="text-sm text-muted-foreground mb-3">
                    Use n8n to trigger CDP WhatsApp campaigns automatically based on Rise CRM events.
                    Each workflow authenticates with the CDP, creates a campaign, and executes it.
                  </p>
                  <p className="text-sm font-medium mb-2">Common trigger scenarios:</p>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Onboarding</Badge>
                      <div>
                        <p className="text-sm">Rise CRM <code>client.created</code> → Welcome WhatsApp campaign</p>
                        <p className="text-xs text-muted-foreground mt-1">Send product catalog and intro offer when a new client is added</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Payment</Badge>
                      <div>
                        <p className="text-sm">Rise CRM overdue invoice → Payment reminder via WhatsApp</p>
                        <p className="text-xs text-muted-foreground mt-1">n8n cron checks Rise CRM for unpaid invoices past due date, triggers reminder campaign</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Re-engage</Badge>
                      <div>
                        <p className="text-sm">Rise CRM inactive leads → Re-engagement WhatsApp campaign</p>
                        <p className="text-xs text-muted-foreground mt-1">Weekly n8n cron queries leads not updated in 30+ days, creates targeted re-engagement</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Survey</Badge>
                      <div>
                        <p className="text-sm">Rise CRM project completed → Post-project satisfaction survey</p>
                        <p className="text-xs text-muted-foreground mt-1">When a project is marked complete, send a CSAT WA Flow survey via CDP</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm font-medium mb-2">n8n Workflow — New Client Onboarding Campaign:</p>
                  <CodeBlock>{`// Step 1: n8n Webhook Trigger receives Rise CRM client.created event

// Step 2: HTTP Request — Authenticate with CDP
Method: POST
URL: https://your-cdp.com/api/auth/login
Body: { "email": "n8n-bot@company.com", "password": "{{ $credentials.cdpBotPassword }}" }
// Store: {{ $json.token }}

// Step 3: HTTP Request — Create campaign
Method: POST
URL: https://your-cdp.com/api/campaigns
Headers:
  Authorization: Bearer {{ $node["Auth"].json.token }}
  Content-Type: application/json
Body:
{
  "name": "Welcome — {{ $node["Webhook"].json.company }}",
  "channel": "whatsapp",
  "templateId": "welcome_new_client",
  "segmentDefinitionId": "new-clients-segment-uuid",
  "metadata": {
    "source": "rise_crm",
    "trigger": "client.created",
    "rise_crm_client_id": "{{ $node["Webhook"].json.client_id }}"
  }
}

// Step 4: HTTP Request — Execute campaign
Method: POST
URL: https://your-cdp.com/api/campaigns/{{ $node["Create"].json.id }}/execute
Headers:
  Authorization: Bearer {{ $node["Auth"].json.token }}`}</CodeBlock>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="waba-send" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  WABA Send APIs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Authentication">
                  <p className="text-sm text-muted-foreground">
                    All send endpoints require JWT authentication and <code>admin</code> or <code>marketing</code> role.
                    WABA must be configured via environment variables.
                  </p>
                </Section>

                <Section title="Send Template Message">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>POST</Badge>
                    <code className="text-sm">/api/waba/send/template</code>
                  </div>
                  <CodeBlock>{`{
  "to": "60123456789",
  "templateName": "hello_world",
  "languageCode": "en",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "John" }
      ]
    }
  ]
}`}</CodeBlock>
                </Section>

                <Section title="Send Text Message">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>POST</Badge>
                    <code className="text-sm">/api/waba/send/text</code>
                  </div>
                  <CodeBlock>{`{
  "to": "60123456789",
  "text": "Hello! This is a test message.",
  "previewUrl": false
}`}</CodeBlock>
                  <p className="text-sm text-muted-foreground mt-2">
                    Text messages can only be sent within a 24-hour conversation window.
                  </p>
                </Section>

                <Section title="Send Interactive Message">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>POST</Badge>
                    <code className="text-sm">/api/waba/send/interactive</code>
                  </div>
                  <CodeBlock>{`{
  "to": "60123456789",
  "interactive": {
    "type": "button",
    "body": { "text": "Choose an option:" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "btn_yes", "title": "Yes" } },
        { "type": "reply", "reply": { "id": "btn_no", "title": "No" } }
      ]
    }
  }
}`}</CodeBlock>
                </Section>

                <Section title="Campaign Broadcast">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>POST</Badge>
                    <code className="text-sm">/api/waba/campaigns/:id/broadcast</code>
                  </div>
                  <CodeBlock>{`{
  "concurrency": 10,
  "batchDelayMs": 1000
}`}</CodeBlock>
                  <p className="text-sm text-muted-foreground mt-2">
                    Broadcasts all pending messages for an executed campaign with configurable
                    concurrency and rate limiting delay between batches.
                  </p>
                </Section>

                <Section title="Rise CRM Triggered Messages via n8n">
                  <p className="text-sm text-muted-foreground mb-3">
                    Use n8n workflows to send individual WhatsApp messages triggered by Rise CRM events.
                    These are 1:1 messages (not campaign broadcasts) sent via the CDP WABA Send API.
                  </p>
                  <p className="text-sm font-medium mb-2">Common Rise CRM → WhatsApp message scenarios:</p>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Invoice</Badge>
                      <div>
                        <p className="text-sm">Rise CRM invoice created → WhatsApp notification to client</p>
                        <p className="text-xs text-muted-foreground mt-1">Template: invoice_notification with amount, due date, payment link</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Reminder</Badge>
                      <div>
                        <p className="text-sm">Rise CRM task/event due → WhatsApp appointment reminder</p>
                        <p className="text-xs text-muted-foreground mt-1">Template: appointment_reminder with date, time, location</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Support</Badge>
                      <div>
                        <p className="text-sm">Rise CRM ticket reply → WhatsApp update to client</p>
                        <p className="text-xs text-muted-foreground mt-1">Template: ticket_update with ticket ID, status, agent response summary</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0 mt-0.5">Lead</Badge>
                      <div>
                        <p className="text-sm">Rise CRM new lead → WhatsApp follow-up from sales</p>
                        <p className="text-xs text-muted-foreground mt-1">Template: lead_followup with agent name, service offerings, meeting link</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm font-medium mb-2">n8n Workflow — Invoice Notification:</p>
                  <CodeBlock>{`// Trigger: n8n Webhook receives Rise CRM invoice.created event

// Step 1: Lookup client phone from Rise CRM event payload
// (phone comes in $json.client_phone from the plugin hook)

// Step 2: Authenticate with CDP
Method: POST
URL: https://your-cdp.com/api/auth/login
Body: { "email": "n8n-bot@company.com", "password": "{{ $credentials.cdpBotPassword }}" }

// Step 3: Send WhatsApp template message via CDP
Method: POST
URL: https://your-cdp.com/api/waba/send/template
Headers:
  Authorization: Bearer {{ $node["Auth"].json.token }}
  Content-Type: application/json
Body:
{
  "to": "{{ $json.client_phone }}",
  "templateName": "invoice_notification",
  "languageCode": "en",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "{{ $json.client_name }}" },
        { "type": "text", "text": "{{ $json.invoice_number }}" },
        { "type": "text", "text": "{{ $json.currency }} {{ $json.amount }}" },
        { "type": "text", "text": "{{ $json.due_date }}" }
      ]
    }
  ]
}`}</CodeBlock>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5" />
                  Rise CRM + n8n Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Section title="Architecture Overview">
                  <p className="text-sm text-muted-foreground mb-3">
                    The Smart CDP platform is the single source of truth for customer data, while
                    Rise CRM (RISE Ultimate Project Manager — CodeIgniter 4 / PHP 8.x / MySQL 8.x)
                    serves as the operational CRM for day-to-day client management, invoicing, support
                    tickets, and lead workflows. <strong>n8n</strong> acts as the orchestration bridge
                    between both systems.
                  </p>
                  <div className="p-4 bg-muted rounded-lg text-sm font-mono space-y-1">
                    <p>┌─────────────┐    plugin hooks     ┌──────────┐    HTTP POST     ┌──────────────┐</p>
                    <p>│  Rise CRM   │ ──────────────────→ │   n8n    │ ──────────────→ │  Smart CDP   │</p>
                    <p>│ (PHP/MySQL) │                      │ (bridge) │                  │ (Node/PG)    │</p>
                    <p>│             │ ←────────────────── │          │ ←────────────── │              │</p>
                    <p>└─────────────┘    REST API calls    └──────────┘  segment/events  └──────────────┘</p>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p><strong>CDP → Rise CRM (via n8n):</strong> Golden record syncs, segment membership changes, campaign delivery status updates</p>
                    <p><strong>Rise CRM → CDP (via n8n):</strong> Client events (created, updated), invoice events (paid, overdue), ticket events, lead conversions</p>
                    <p><strong>Identity linking:</strong> Rise CRM client IDs are stored in CDP's <code>customer_identity</code> table with <code>identifier_type: "crm_id"</code> for bidirectional mapping</p>
                  </div>
                </Section>

                <Section title="Rise CRM Plugin Hook Setup">
                  <p className="text-sm text-muted-foreground mb-2">
                    Rise CRM supports <strong>plugin hooks</strong> that let you run custom PHP code when
                    entities change, without modifying core Rise code. Register hooks in Rise CRM's
                    Settings → Plugin Hooks to fire on key events.
                  </p>
                  <p className="text-sm font-medium mb-2">Recommended hooks to register:</p>
                  <div className="space-y-2 mb-3">
                    {[
                      { hook: "after_client_created", action: "Capture new client data for CDP profile creation" },
                      { hook: "after_client_updated", action: "Sync client updates (email, phone, custom fields) to CDP" },
                      { hook: "after_invoice_payment_recorded", action: "Record payment event with amount and method" },
                      { hook: "after_ticket_created", action: "Track support interactions in CDP event timeline" },
                      { hook: "after_lead_status_changed", action: "Update lead score and stage in CDP" },
                      { hook: "after_lead_converted_to_client", action: "Merge lead profile with new client profile" },
                      { hook: "after_proposal_accepted", action: "Track conversion value in CDP for analytics" },
                      { hook: "after_task_completed", action: "Log project milestones for engagement scoring" },
                    ].map((h) => (
                      <div key={h.hook} className="flex items-start gap-3 p-2 bg-muted rounded">
                        <code className="text-xs shrink-0 mt-0.5">{h.hook}</code>
                        <p className="text-xs text-muted-foreground">{h.action}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-sm font-medium mb-2">Base hook class (PHP):</p>
                  <CodeBlock>{`<?php
// File: app/Hooks/CdpWebhookBase.php (CodeIgniter 4)
// Base class for all Rise CRM → n8n webhook hooks

namespace App\\Hooks;

class CdpWebhookBase {
    protected string $n8nUrl;

    public function __construct() {
        // Configure in Rise CRM Settings → Custom Config
        $this->n8nUrl = get_setting('cdp_n8n_webhook_url')
            ?: 'https://your-n8n.com/webhook/rise-crm-events';
    }

    protected function emit(string $event, array $data): void {
        $payload = array_merge($data, [
            'event'     => $event,
            'timestamp' => date('c'),
            'source'    => 'rise_crm',
        ]);

        $client = \\Config\\Services::curlrequest();
        $client->post($this->n8nUrl, [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Rise-Hook'  => $event,
            ],
            'body'    => json_encode($payload),
            'timeout' => 5,
        ]);
    }
}`}</CodeBlock>
                </Section>

                <Section title="n8n Orchestration Patterns">
                  <p className="text-sm text-muted-foreground mb-3">
                    Use n8n as the middleware layer between Rise CRM and the CDP. Below are the
                    recommended workflow patterns for common integration scenarios.
                  </p>

                  <p className="text-sm font-medium mb-2">Pattern 1: Rise CRM Event → CDP Ingestion</p>
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground mb-3">
                    <p className="font-medium text-foreground mb-1">Workflow nodes:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Webhook Trigger (receives Rise CRM plugin hook POST)</li>
                      <li>Switch node (routes by <code>event</code> field)</li>
                      <li>Set node (transforms Rise CRM fields to CDP event format)</li>
                      <li>HTTP Request (POST to <code>/api/ingest/event</code> with <code>sourceChannel: "rise_crm"</code>)</li>
                      <li>IF node (check if CDP returned <code>isNewProfile: true</code>)</li>
                      <li>HTTP Request (POST back to Rise CRM to store CDP profile ID as custom field)</li>
                    </ol>
                  </div>

                  <p className="text-sm font-medium mb-2">Pattern 2: CDP Segment Change → Rise CRM Client Update</p>
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground mb-3">
                    <p className="font-medium text-foreground mb-1">Workflow nodes:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Cron Trigger (runs every 15 minutes)</li>
                      <li>HTTP Request (GET CDP segment members via <code>/api/segments/:id/members</code>)</li>
                      <li>Code node (diff current vs. previous member list)</li>
                      <li>SplitInBatches node (process changes in batches of 10)</li>
                      <li>HTTP Request (PUT Rise CRM client custom field: <code>cdp_segment = "VIP"</code>)</li>
                    </ol>
                  </div>

                  <p className="text-sm font-medium mb-2">Pattern 3: Bidirectional Golden Record Sync</p>
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground mb-3">
                    <p className="font-medium text-foreground mb-1">Workflow nodes:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Cron Trigger (runs hourly)</li>
                      <li>HTTP Request (GET CDP profiles updated since last sync via <code>/api/customers?updatedSince=...</code>)</li>
                      <li>Code node (map CDP fields to Rise CRM client fields)</li>
                      <li>HTTP Request (PUT Rise CRM client: <code>/index.php/clients/&lt;crm_id&gt;</code>)</li>
                      <li>HTTP Request (GET Rise CRM clients updated since last sync)</li>
                      <li>HTTP Request (POST CDP event ingestion with <code>sourceChannel: "rise_crm"</code>)</li>
                    </ol>
                  </div>
                </Section>

                <Section title="Bidirectional Identity Mapping">
                  <p className="text-sm text-muted-foreground mb-3">
                    The CDP uses the <code>customer_identity</code> table to link CDP profiles to Rise CRM
                    client IDs. When a Rise CRM event includes a <code>client_id</code>, it's stored
                    as an identifier with <code>type: "crm_id"</code> during identity resolution.
                  </p>
                  <CodeBlock>{`// CDP customer_identity record for Rise CRM link
{
  "profileId": "cdp-uuid-abc-123",
  "identifierType": "crm_id",
  "identifierValue": "42",        // Rise CRM client ID
  "sourceSystem": "rise_crm",
  "confidence": 1.0
}

// Identity resolution flow:
// 1. Rise CRM event arrives with client_id=42, email=john@example.com
// 2. CDP checks customer_identity for crm_id=42 or email=john@example.com
// 3. If found → links event to existing profile
// 4. If not found → creates new profile + stores both identifiers
// 5. If both found on different profiles → merges into single golden record`}</CodeBlock>

                  <p className="text-sm font-medium mt-3 mb-2">Storing CDP Profile ID back in Rise CRM:</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Add a custom field <code>cdp_profile_id</code> in Rise CRM (Settings → Custom Fields → Clients).
                    When the CDP creates a new profile from a Rise CRM event, use n8n to write the CDP profile ID
                    back to this custom field for reverse lookups.
                  </p>
                  <CodeBlock>{`// n8n workflow — after CDP returns isNewProfile: true
// Step: HTTP Request to Rise CRM
Method: PUT
URL: https://your-rise-crm.com/index.php/clients/{{ $json.rise_crm_client_id }}
Headers:
  Authorization: Bearer {{ $credentials.riseCrmToken }}
Body:
{
  "custom_fields": {
    "cdp_profile_id": "{{ $json.cdp_profile_id }}"
  }
}`}</CodeBlock>
                </Section>

                <Section title="Campaign API from n8n">
                  <p className="text-sm text-muted-foreground mb-2">
                    To create and execute CDP campaigns from n8n workflows triggered by Rise CRM events:
                  </p>
                  <CodeBlock>{`// n8n Workflow — Programmatic Campaign via CDP API

// Node 1: HTTP Request — Authenticate
Method: POST
URL: https://your-cdp.com/api/auth/login
Body: {
  "email": "n8n-bot@company.com",
  "password": "{{ $credentials.cdpBotPassword }}"
}

// Node 2: HTTP Request — Create Campaign
Method: POST
URL: https://your-cdp.com/api/campaigns
Headers:
  Authorization: Bearer {{ $node["Auth"].json.token }}
  Content-Type: application/json
Body: {
  "name": "Rise CRM Triggered — {{ $json.campaign_name }}",
  "channel": "whatsapp",
  "templateId": "{{ $json.template_id }}",
  "segmentDefinitionId": "{{ $json.segment_id }}",
  "metadata": {
    "source": "rise_crm",
    "triggered_by": "{{ $json.event }}",
    "rise_crm_ref": "{{ $json.client_id }}"
  }
}

// Node 3: HTTP Request — Execute Campaign
Method: POST
URL: https://your-cdp.com/api/campaigns/{{ $node["Create"].json.id }}/execute
Headers:
  Authorization: Bearer {{ $node["Auth"].json.token }}`}</CodeBlock>
                </Section>

                <Section title="Environment & Prerequisites">
                  <p className="text-sm text-muted-foreground mb-2">
                    To set up the Rise CRM + n8n + CDP integration:
                  </p>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                    <li>
                      <strong>Rise CRM</strong> — Install RISE (CodeIgniter 4, PHP 8.x, MySQL 8.x).
                      Add a custom field <code>cdp_profile_id</code> to the Clients module. Enable plugin hooks in Settings.
                    </li>
                    <li>
                      <strong>n8n</strong> — Self-host or use n8n Cloud. Create a Webhook Trigger node with a dedicated URL for Rise CRM events.
                      Store CDP and Rise CRM credentials in n8n Credentials.
                    </li>
                    <li>
                      <strong>CDP</strong> — Create a service account (<code>n8n-bot@company.com</code>) with <code>marketing</code> role
                      for campaign operations, or use rate-limited unauthenticated access for event ingestion only.
                    </li>
                    <li>
                      <strong>Rise CRM Plugin Hooks</strong> — Deploy the PHP hook classes to
                      <code> app/Hooks/</code> and register them in Rise CRM's Settings → Plugin Hooks.
                    </li>
                  </ol>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div
        ref={pdfRef}
        style={{
          display: "none",
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "900px",
          background: "#ffffff",
          color: "#0a0a0a",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "40px",
        }}
      >
        <div data-pdf-section style={{ marginBottom: "40px", borderBottom: "2px solid #e5e5e5", paddingBottom: "24px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", margin: "0 0 8px 0", color: "#0a0a0a" }}>
            Smart CDP — API Reference & Technical Guide
          </h1>
          <p style={{ fontSize: "14px", color: "#737373", margin: 0 }}>
            Documentation for WABA webhooks, event ingestion, campaign management, and Rise CRM + n8n integrations
          </p>
          <p style={{ fontSize: "12px", color: "#a3a3a3", marginTop: "8px" }}>
            Generated on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        <PdfWabaWebhook />
        <PdfEventIngestion />
        <PdfCampaignApi />
        <PdfWabaSend />
        <PdfIntegrations />
      </div>
    </div>
  );
});