import { memo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import Header from "@/components/layout/header";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getStreams, createStream, type Stream } from "@/lib/lite-cdp-api";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  Database,
  Users,
  CreditCard,
  Monitor,
  MessageSquare,
  Smartphone,
  HelpCircle,
  UserCheck,
  TrendingUp,
} from "lucide-react";

// ── Entity helpers ─────────────────────────────────────────────────────────────

const ENTITY_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  person: { icon: Users, label: "Person", color: "bg-blue-100 text-blue-700" },
  transaction: { icon: CreditCard, label: "Transaction", color: "bg-green-100 text-green-700" },
  session: { icon: Monitor, label: "Session", color: "bg-purple-100 text-purple-700" },
  interaction: { icon: MessageSquare, label: "Interaction", color: "bg-orange-100 text-orange-700" },
  device: { icon: Smartphone, label: "Device", color: "bg-pink-100 text-pink-700" },
  unknown: { icon: HelpCircle, label: "Unknown", color: "bg-gray-100 text-gray-600" },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  active: { label: "Active", className: "bg-green-100 text-green-700 border-green-200" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ── StreamCard ─────────────────────────────────────────────────────────────────

function StreamCard({ stream }: { stream: Stream }) {
  const [, navigate] = useLocation();
  const entityKey = stream.entityType ?? "unknown";
  const entityCfg = ENTITY_CONFIG[entityKey] ?? ENTITY_CONFIG.unknown;
  const statusCfg = STATUS_CONFIG[stream.status] ?? STATUS_CONFIG.draft;
  const EntityIcon = entityCfg.icon;

  const identityRate =
    stream.totalRecords > 0
      ? Math.round((stream.identifiedRecords / stream.totalRecords) * 100)
      : 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border"
      onClick={() => navigate(`/streams/${stream.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold line-clamp-1">{stream.name}</CardTitle>
          <Badge variant="outline" className={cn("shrink-0 text-xs", statusCfg.className)}>
            {statusCfg.label}
          </Badge>
        </div>
        {stream.description && (
          <CardDescription className="text-xs line-clamp-2 mt-0.5">
            {stream.description}
          </CardDescription>
        )}
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
              entityCfg.color
            )}
          >
            <EntityIcon className="size-3" />
            {entityCfg.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
          <div>
            <p className="text-lg font-bold tabular-nums">
              {stream.totalRecords.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">
              {stream.identifiedRecords.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Identified</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">{identityRate}%</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ID Rate</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
      <Database className="size-12 mb-4 opacity-30" />
      <p className="text-base font-medium">No data streams yet</p>
      <p className="text-sm mt-1">Create your first stream to start ingesting data.</p>
    </div>
  );
}

// ── StreamsSkeleton ────────────────────────────────────────────────────────────

function StreamsSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4 mt-1" />
            <Skeleton className="h-5 w-20 mt-2 rounded-full" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="border-t pt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex flex-col items-center gap-1">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

// ── CreateStreamDialog ─────────────────────────────────────────────────────────

const createStreamSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  sourceType: z.enum(["csv_upload", "excel_upload", "api_push", "webhook", "manual"], {
    required_error: "Select a source type",
  }),
});

type CreateStreamValues = z.infer<typeof createStreamSchema>;

const SOURCE_TYPE_OPTIONS = [
  { value: "csv_upload", label: "CSV Upload" },
  { value: "excel_upload", label: "Excel Upload" },
  { value: "api_push", label: "API Push" },
  { value: "webhook", label: "Webhook" },
  { value: "manual", label: "Manual" },
];

function CreateStreamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const form = useForm<CreateStreamValues>({
    resolver: zodResolver(createStreamSchema),
    defaultValues: { name: "", description: "", sourceType: undefined },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateStreamValues) =>
      createStream({
        name: values.name,
        description: values.description || undefined,
        sourceType: values.sourceType,
      }),
    onSuccess: (newStream) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lite-cdp/streams"] });
      onOpenChange(false);
      form.reset();
      navigate(`/streams/${newStream.id}/setup`);
    },
  });

  function onSubmit(values: CreateStreamValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Stream</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stream Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Event Attendees 2025" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description of this data stream"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sourceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a source type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SOURCE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create & Setup"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Streams Page ───────────────────────────────────────────────────────────────

export default memo(function Streams() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: streams, isLoading } = useQuery<Stream[]>({
    queryKey: ["/api/lite-cdp/streams"],
    queryFn: () => getStreams(),
  });

  return (
    <>
      <Header
        title="Data Streams"
        subtitle="Manage your data sources and ingestion streams"
        actionLabel="New Stream"
        onAction={() => setShowCreateDialog(true)}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <StreamsSkeleton />
          ) : (
            <>
              {streams?.map((stream) => (
                <StreamCard key={stream.id} stream={stream} />
              ))}
              {(!streams || streams.length === 0) && <EmptyState />}
            </>
          )}
        </div>
      </div>

      <CreateStreamDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </>
  );
});
