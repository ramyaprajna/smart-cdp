import React, { useState, memo, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import Header from "@/components/layout/header";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import LinkRecordDialog from "@/components/lite-cdp/link-record-dialog";
import MergeClusterDialog from "@/components/lite-cdp/merge-cluster-dialog";
import {
  Fingerprint,
  FileText,
  Layers,
  Target,
  Calendar,
  Database,
  LinkIcon,
  Merge,
  Unlink,
  Mail,
  Phone,
  MessageCircle,
  Radio,
  Globe,
  Ticket,
  Smartphone,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Identifier {
  type: string;
  value: string;
}

interface MergeHistoryEntry {
  action: string;
  at: string;
  by: string;
  reason?: string;
}

interface LinkedRecord {
  id: string;
  streamId: string;
  streamName: string;
  attributes: Record<string, unknown>;
}

interface ClusterDetail {
  id: string;
  primaryLabel: string | null;
  identifiers: Identifier[];
  streamCount: number;
  recordCount: number;
  avgConfidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  mergeHistory?: MergeHistoryEntry[];
}

interface ClusterDetailResponse {
  cluster: ClusterDetail;
  records: LinkedRecord[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── IdentifierBadge ─────────────────────────────────────────────────────────

const identifierConfig: Record<
  string,
  { icon: React.ElementType; className: string }
> = {
  email: { icon: Mail, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  phone: { icon: Phone, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  wa_number: { icon: MessageCircle, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rfid: { icon: Radio, className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  cookie: { icon: Globe, className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  ticket_number: { icon: Ticket, className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  device_id: { icon: Smartphone, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

function IdentifierBadge({ identifier }: { identifier: Identifier }) {
  const config = identifierConfig[identifier.type] ?? {
    icon: Tag,
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        config.className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-mono text-xs">{identifier.value}</span>
      <span className="text-xs opacity-60">({identifier.type})</span>
    </span>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number | undefined;
  icon: React.ElementType;
}) {
  return (
    <Card className="border border-border">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default memo(function ClusterDetail() {
  const [, params] = useRoute("/clusters/:id");
  const clusterId = params?.id;
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ClusterDetailResponse>({
    queryKey: ["/api/lite-cdp/clusters", clusterId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/lite-cdp/clusters/${clusterId}`);
      return res.json();
    },
    enabled: !!clusterId,
  });

  const unlinkMutation = useMutation({
    mutationFn: async (recordId: string) => {
      await apiRequest("DELETE", `/api/lite-cdp/clusters/${clusterId}/link/${recordId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lite-cdp/clusters", clusterId] });
      toast({ title: "Record unlinked", description: "The record has been removed from this cluster." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unlink record.", variant: "destructive" });
    },
  });

  // Group records by stream
  const groupedByStream = useMemo(() => {
    if (!data?.records) return [];
    const map = new Map<string, LinkedRecord[]>();
    for (const record of data.records) {
      const key = record.streamName || record.streamId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(record);
    }
    return Array.from(map.entries());
  }, [data?.records]);

  if (isLoading) {
    return (
      <>
        <Header title="Identity Cluster" subtitle="Unified profile from multiple data streams" />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  const cluster = data?.cluster;

  return (
    <>
      <Header
        title={cluster?.primaryLabel || "Identity Cluster"}
        subtitle="Unified profile from multiple data streams"
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Identity Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="h-5 w-5" />
              Known Identifiers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cluster?.identifiers?.length ? (
              <div className="flex flex-wrap gap-2">
                {cluster.identifiers.map((id, idx) => (
                  <IdentifierBadge key={idx} identifier={id} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No identifiers found for this cluster.</p>
            )}
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Records" value={cluster?.recordCount} icon={FileText} />
          <StatCard label="Streams" value={cluster?.streamCount} icon={Layers} />
          <StatCard
            label="Confidence"
            value={`${Math.round((cluster?.avgConfidence ?? 0) * 100)}%`}
            icon={Target}
          />
          <StatCard label="First Seen" value={formatDate(cluster?.firstSeenAt)} icon={Calendar} />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLinkDialog(true)}>
            <LinkIcon className="h-4 w-4 mr-2" />
            Link Record
          </Button>
          <Button variant="outline" onClick={() => setShowMergeDialog(true)}>
            <Merge className="h-4 w-4 mr-2" />
            Merge with Another Cluster
          </Button>
        </div>

        {/* Records by Stream — grouped */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Linked Records</h3>
          {groupedByStream.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records linked to this cluster yet.</p>
          ) : (
            groupedByStream.map(([streamName, streamRecords]) => {
              // Derive column headers from first record
              const columns = streamRecords[0]
                ? Object.keys(streamRecords[0].attributes).slice(0, 6)
                : [];

              return (
                <Card key={streamName}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {streamName}
                      <Badge variant="outline">{streamRecords.length} record{streamRecords.length !== 1 ? "s" : ""}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {columns.map((col) => (
                              <TableHead key={col} className="text-xs capitalize whitespace-nowrap">
                                {col.replace(/_/g, " ")}
                              </TableHead>
                            ))}
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {streamRecords.map((record) => (
                            <TableRow key={record.id}>
                              {columns.map((col) => (
                                <TableCell key={col} className="text-sm max-w-[200px] truncate">
                                  {String(record.attributes[col] ?? "")}
                                </TableCell>
                              ))}
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={unlinkMutation.isPending}
                                  onClick={() => unlinkMutation.mutate(record.id)}
                                  title="Unlink record"
                                >
                                  <Unlink className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Merge History Timeline */}
        {(cluster?.mergeHistory?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Merge History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {cluster!.mergeHistory!.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.at)} by {entry.by}
                      </p>
                      {entry.reason && (
                        <p className="text-xs text-muted-foreground">{entry.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {clusterId && (
        <>
          <LinkRecordDialog
            open={showLinkDialog}
            onOpenChange={setShowLinkDialog}
            clusterId={clusterId}
          />
          <MergeClusterDialog
            open={showMergeDialog}
            onOpenChange={setShowMergeDialog}
            clusterId={clusterId}
          />
        </>
      )}
    </>
  );
});
