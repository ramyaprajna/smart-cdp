import { memo, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";

import Header from "@/components/layout/header";
import { cn } from "@/lib/utils";
import {
  getStream,
  uploadStreamFile,
  analyzeStream,
  updateStreamSchema,
  activateStream,
  type Stream,
  type AIAnalysisResult,
  type SchemaDefinition,
  type FieldDefinition,
} from "@/lib/lite-cdp-api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Upload,
  Brain,
  Settings,
  Rocket,
  Check,
  FileUp,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: "Upload Data", icon: Upload },
  { number: 2, label: "AI Analysis", icon: Brain },
  { number: 3, label: "Review Schema", icon: Settings },
  { number: 4, label: "Activate", icon: Rocket },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center w-full mb-8">
      {STEPS.map((step, idx) => {
        const StepIcon = step.icon;
        const isCompleted = step.number < currentStep;
        const isCurrent = step.number === currentStep;

        return (
          <div key={step.number} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center rounded-full size-10 border-2 transition-colors",
                  isCompleted
                    ? "bg-primary border-primary text-primary-foreground"
                    : isCurrent
                    ? "border-primary text-primary bg-primary/10"
                    : "border-muted-foreground/30 text-muted-foreground/50"
                )}
              >
                {isCompleted ? (
                  <Check className="size-4" />
                ) : (
                  <StepIcon className="size-4" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCurrent
                    ? "text-primary"
                    : isCompleted
                    ? "text-foreground"
                    : "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-16 sm:w-24 mx-2 mb-6 transition-colors",
                  step.number < currentStep ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────

function UploadStep({
  streamId,
  onNext,
}: {
  streamId: string;
  onNext: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadStreamFile(streamId, f),
    onSuccess: () => {
      onNext(file!);
    },
    onError: (err: Error) => {
      setUploadError(err.message ?? "Upload failed. Please try again.");
    },
  });

  const handleFileSelect = useCallback((selected: File) => {
    setUploadError(null);
    setFile(selected);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  const handleAnalyze = () => {
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Upload your data file</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Supports CSV, Excel (.xlsx, .xls) files
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/5"
            : file
            ? "border-green-400 bg-green-50"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />

        {file ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="size-10 text-green-500" />
            <p className="font-medium text-sm">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            <p className="text-xs text-muted-foreground">Click to change file</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <FileUp className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Drop your file here</p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
          <AlertCircle className="size-4 shrink-0" />
          {uploadError}
        </div>
      )}

      <Button
        className="w-full"
        disabled={!file || uploadMutation.isPending}
        onClick={handleAnalyze}
      >
        {uploadMutation.isPending ? "Uploading…" : "Analyze with AI"}
      </Button>
    </div>
  );
}

// ── Step 2: AI Analysis ────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  person: "bg-blue-100 text-blue-700",
  transaction: "bg-green-100 text-green-700",
  session: "bg-purple-100 text-purple-700",
  interaction: "bg-orange-100 text-orange-700",
  device: "bg-pink-100 text-pink-700",
  unknown: "bg-gray-100 text-gray-600",
};

function AnalysisStep({
  streamId,
  onNext,
}: {
  streamId: string;
  onNext: (result: AIAnalysisResult) => void;
}) {
  const analyzeMutation = useMutation({
    mutationFn: () => analyzeStream(streamId),
    onSuccess: onNext,
  });

  // Kick off analysis on mount
  const hasStarted = useRef(false);
  if (!hasStarted.current) {
    hasStarted.current = true;
    analyzeMutation.mutate();
  }

  const result = analyzeMutation.data;
  const isLoading = analyzeMutation.isPending;
  const isError = analyzeMutation.isError;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {isLoading && (
        <div className="flex flex-col items-center gap-6 py-10">
          <div className="relative flex items-center justify-center">
            <div className="absolute size-20 rounded-full bg-primary/10 animate-ping" />
            <div className="size-16 rounded-full bg-primary/20 flex items-center justify-center">
              <Brain className="size-8 text-primary animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold">AI is analyzing your data…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Detecting entity types, field schemas, and identity signals
            </p>
          </div>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <div>
            <p className="font-medium">Analysis failed</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(analyzeMutation.error as Error)?.message ?? "Please try again."}
            </p>
          </div>
          <Button onClick={() => analyzeMutation.mutate()}>Retry Analysis</Button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="text-center">
            <CheckCircle2 className="size-8 text-green-500 mx-auto mb-2" />
            <h2 className="text-lg font-semibold">Analysis Complete</h2>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Stream type */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Stream Type</span>
                <span className="text-sm font-medium">{result.streamType}</span>
              </div>

              {/* Entity type */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Entity Type</span>
                <Badge
                  className={cn(
                    "text-xs capitalize",
                    ENTITY_COLORS[result.entityType] ?? ENTITY_COLORS.unknown
                  )}
                  variant="outline"
                >
                  {result.entityType}
                </Badge>
              </div>

              {/* Confidence */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span className="text-sm font-medium tabular-nums">
                    {Math.round(result.confidence * 100)}%
                  </span>
                </div>
                <Progress value={result.confidence * 100} className="h-2" />
              </div>

              {/* Fields detected */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fields Detected</span>
                <span className="text-sm font-medium">{result.fieldsDetected}</span>
              </div>

              {/* Identity fields */}
              <div>
                <span className="text-sm text-muted-foreground">Identity Fields</span>
                {result.identityFields.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {result.identityFields.map((f) => (
                      <Badge key={f.key} variant="secondary" className="text-xs">
                        {f.key} ({f.identifierType})
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Info className="size-3" />
                    No identity fields found — this data can still provide aggregate insights
                  </p>
                )}
              </div>

              {/* Notes */}
              {result.notes && (
                <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">AI Notes</p>
                  {result.notes}
                </div>
              )}
            </CardContent>
          </Card>

          <Button className="w-full" onClick={() => onNext(result)}>
            Review Details
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Review & Edit ──────────────────────────────────────────────────────

const DATA_TYPE_OPTIONS = ["string", "number", "date", "boolean", "json"] as const;
const GROUP_OPTIONS = ["identity", "demographic", "behavioral", "transactional", "metadata"] as const;
const IDENTIFIER_TYPE_OPTIONS = [
  "email", "phone", "wa_number", "device_id", "ticket_number",
  "rfid", "cookie", "session_id", "crm_id", "member_id", "custom",
] as const;

function ReviewStep({
  analysisResult,
  onNext,
}: {
  analysisResult: AIAnalysisResult;
  onNext: (schema: SchemaDefinition) => void;
}) {
  const [fields, setFields] = useState<FieldDefinition[]>(
    analysisResult.suggestedSchema.fields ?? []
  );
  const [suggestedSegments, setSuggestedSegments] = useState<string[]>(
    analysisResult.suggestedSchema.suggestedSegments ?? []
  );
  const [embeddingTemplate, setEmbeddingTemplate] = useState(
    analysisResult.suggestedSchema.embeddingTemplate ?? ""
  );
  const [groupByFields, setGroupByFields] = useState<string[]>(
    analysisResult.suggestedSchema.analyticsConfig?.groupByFields ?? []
  );
  const [timeField, setTimeField] = useState(
    analysisResult.suggestedSchema.analyticsConfig?.timeField ?? ""
  );

  function updateField(idx: number, patch: Partial<FieldDefinition>) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function handleSave() {
    onNext({
      fields,
      identityFields: analysisResult.identityFields,
      suggestedSegments,
      embeddingTemplate,
      analyticsConfig: {
        groupByFields,
        timeField: timeField || undefined,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Review & Edit Schema</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Adjust field definitions, identity settings, and analytics configuration
        </p>
      </div>

      {/* Fields table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Field Definitions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px]">Key</TableHead>
                  <TableHead className="min-w-[140px]">Label</TableHead>
                  <TableHead className="min-w-[110px]">Type</TableHead>
                  <TableHead className="min-w-[130px]">Group</TableHead>
                  <TableHead className="min-w-[90px] text-center">Identifier</TableHead>
                  <TableHead className="min-w-[140px]">ID Type</TableHead>
                  <TableHead className="min-w-[70px] text-center">PII</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, idx) => (
                  <TableRow key={field.key}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {field.key}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(idx, { label: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={field.dataType}
                        onValueChange={(v) =>
                          updateField(idx, { dataType: v as FieldDefinition["dataType"] })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={field.group}
                        onValueChange={(v) =>
                          updateField(idx, { group: v as FieldDefinition["group"] })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUP_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g} className="text-xs capitalize">
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={field.isIdentifier}
                        onChange={(e) => updateField(idx, { isIdentifier: e.target.checked })}
                        className="size-4 cursor-pointer accent-primary"
                      />
                    </TableCell>
                    <TableCell>
                      {field.isIdentifier && (
                        <Select
                          value={field.identifierType ?? "custom"}
                          onValueChange={(v) => updateField(idx, { identifierType: v })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IDENTIFIER_TYPE_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t} className="text-xs">
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={field.isPII ?? false}
                        onChange={(e) => updateField(idx, { isPII: e.target.checked })}
                        className="size-4 cursor-pointer accent-primary"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Suggested segments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Suggested Segments</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={suggestedSegments.join("\n")}
            onChange={(e) =>
              setSuggestedSegments(e.target.value.split("\n").filter(Boolean))
            }
            rows={3}
            placeholder="One segment per line, e.g. VIP Attendees"
            className="text-sm"
          />
        </CardContent>
      </Card>

      {/* Embedding template */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Embedding Template</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={embeddingTemplate}
            onChange={(e) => setEmbeddingTemplate(e.target.value)}
            rows={3}
            placeholder="e.g. {name} attended {event} on {date}"
            className="text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Use {"{fieldKey}"} placeholders to build text for semantic embedding.
          </p>
        </CardContent>
      </Card>

      {/* Analytics config */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Analytics Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium mb-2">Group By Fields</p>
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupByFields.includes(f.key)}
                    onChange={(e) =>
                      setGroupByFields((prev) =>
                        e.target.checked
                          ? [...prev, f.key]
                          : prev.filter((k) => k !== f.key)
                      )
                    }
                    className="size-3 accent-primary"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium mb-1.5">Time Field</p>
            <Select value={timeField || "__none__"} onValueChange={(v) => setTimeField(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs max-w-xs">
                <SelectValue placeholder="Select time field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">
                  None
                </SelectItem>
                {fields
                  .filter((f) => f.dataType === "date")
                  .map((f) => (
                    <SelectItem key={f.key} value={f.key} className="text-xs">
                      {f.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave}>
        Save & Activate
      </Button>
    </div>
  );
}

// ── Step 4: Activate ───────────────────────────────────────────────────────────

function ActivateStep({
  streamId,
  schema,
  onSuccess,
}: {
  streamId: string;
  schema: SchemaDefinition;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [activated, setActivated] = useState(false);

  const identifierCount = schema.fields.filter((f) => f.isIdentifier).length;
  const totalFields = schema.fields.length;

  const mutation = useMutation({
    mutationFn: async () => {
      await updateStreamSchema(streamId, schema);
      await activateStream(streamId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lite-cdp/streams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lite-cdp/streams", streamId] });
      setActivated(true);
      setTimeout(onSuccess, 1500);
    },
  });

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Activate Stream</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review the summary below and confirm to activate
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Fields</span>
            <span className="font-medium">{totalFields}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Identity Fields</span>
            <span className="font-medium">{identifierCount}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Suggested Segments</span>
            <span className="font-medium">{schema.suggestedSegments?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Embedding Template</span>
            <span className="font-medium">{schema.embeddingTemplate ? "Configured" : "Not set"}</span>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 space-y-1">
        <p className="font-medium">What will happen:</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>{totalFields} field indexes will be created</li>
          {identifierCount > 0 && (
            <li>{identifierCount} identity field{identifierCount > 1 ? "s" : ""} will be configured for deduplication</li>
          )}
          <li>Stream status will change to "Active"</li>
          <li>New data ingestion will be enabled</li>
        </ul>
      </div>

      {activated ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="size-14 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="size-7 text-green-600" />
          </div>
          <p className="font-semibold text-green-700">Stream Activated!</p>
          <p className="text-sm text-muted-foreground">Redirecting to stream…</p>
        </div>
      ) : (
        <Button
          className="w-full"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Activating…" : "Confirm & Activate"}
        </Button>
      )}

      {mutation.isError && (
        <p className="text-xs text-destructive text-center">
          {(mutation.error as Error)?.message ?? "Activation failed. Please retry."}
        </p>
      )}
    </div>
  );
}

// ── Main StreamSetup Page ──────────────────────────────────────────────────────

export default memo(function StreamSetup() {
  const [params] = useRoute("/streams/:id/setup");
  const streamId = params?.id ?? "";
  const [, navigate] = useLocation();

  const [step, setStep] = useState(1);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [editedSchema, setEditedSchema] = useState<SchemaDefinition | null>(null);

  const { data: stream } = useQuery<Stream>({
    queryKey: ["/api/lite-cdp/streams", streamId],
    queryFn: () => getStream(streamId),
    enabled: !!streamId,
  });

  return (
    <>
      <Header
        title={stream?.name ?? "Stream Setup"}
        subtitle="Configure your stream with AI-powered schema detection"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <StepIndicator currentStep={step} />

          {step === 1 && (
            <UploadStep
              streamId={streamId}
              onNext={(_file) => setStep(2)}
            />
          )}

          {step === 2 && (
            <AnalysisStep
              streamId={streamId}
              onNext={(result) => {
                setAnalysisResult(result);
                setStep(3);
              }}
            />
          )}

          {step === 3 && analysisResult && (
            <ReviewStep
              analysisResult={analysisResult}
              onNext={(schema) => {
                setEditedSchema(schema);
                setStep(4);
              }}
            />
          )}

          {step === 4 && editedSchema && (
            <ActivateStep
              streamId={streamId}
              schema={editedSchema}
              onSuccess={() => navigate(`/streams/${streamId}`)}
            />
          )}
        </div>
      </div>
    </>
  );
});
