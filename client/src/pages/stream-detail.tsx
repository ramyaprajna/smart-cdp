import { memo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";

import Header from "@/components/layout/header";
import { cn } from "@/lib/utils";
import {
  getStream,
  getStreamRecords,
  getProjectStats,
  type Stream,
  type StreamRecord,
  type FieldDefinition,
  type ProjectStats,
} from "@/lib/lite-cdp-api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  Database,
  UserCheck,
  Link as LinkIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Filter,
} from "lucide-react";

// ── StatCard ───────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
          </div>
          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="size-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── FilterBar ──────────────────────────────────────────────────────────────────

interface FilterState {
  field: string;
  operator: string;
  value: string;
}

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
];

function FilterBar({
  fields,
  onApply,
}: {
  fields: FieldDefinition[];
  onApply: (filters: FilterState[]) => void;
}) {
  const [filter, setFilter] = useState<FilterState>({ field: "", operator: "eq", value: "" });

  const handleApply = () => {
    if (filter.field && filter.value) {
      onApply([filter]);
    }
  };

  const handleClear = () => {
    setFilter({ field: "", operator: "eq", value: "" });
    onApply([]);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="size-4 text-muted-foreground shrink-0" />
      <Select
        value={filter.field || "__none__"}
        onValueChange={(v) => setFilter((prev) => ({ ...prev, field: v === "__none__" ? "" : v }))}
      >
        <SelectTrigger className="h-8 text-xs w-36">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-xs">
            Select field
          </SelectItem>
          {fields.map((f) => (
            <SelectItem key={f.key} value={f.key} className="text-xs">
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.operator}
        onValueChange={(v) => setFilter((prev) => ({ ...prev, operator: v }))}
      >
        <SelectTrigger className="h-8 text-xs w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs">
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        className="h-8 text-xs w-36"
        placeholder="Value"
        value={filter.value}
        onChange={(e) => setFilter((prev) => ({ ...prev, value: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && handleApply()}
      />

      <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={handleApply}>
        Apply
      </Button>
      {filter.value && (
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleClear}>
          Clear
        </Button>
      )}
    </div>
  );
}

// ── DynamicRecordsTable ────────────────────────────────────────────────────────

const MAX_VISIBLE_COLUMNS = 8;

function DynamicRecordsTable({
  streamId,
  schema,
}: {
  streamId: string;
  schema?: Stream["schemaDefinition"];
}) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filters, setFilters] = useState<FilterState[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visibleColumnOffset, setVisibleColumnOffset] = useState(0);

  const fields = schema?.fields ?? [];
  const visibleFields = fields.slice(visibleColumnOffset, visibleColumnOffset + MAX_VISIBLE_COLUMNS);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/lite-cdp/streams", streamId, "records", page, pageSize, filters, sortBy, sortDir],
    queryFn: () =>
      getStreamRecords(streamId, {
        page,
        pageSize,
        filters: filters.length > 0 ? filters : undefined,
        sortBy: sortBy ?? undefined,
        sortDir,
      }),
    enabled: !!streamId,
  });

  const handleSort = useCallback(
    (key: string) => {
      if (sortBy === key) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(key);
        setSortDir("asc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handleFiltersApply = useCallback((newFilters: FilterState[]) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const records: StreamRecord[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      {fields.length > 0 && (
        <FilterBar fields={fields} onApply={handleFiltersApply} />
      )}

      {/* Column navigation for many fields */}
      {fields.length > MAX_VISIBLE_COLUMNS && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing columns {visibleColumnOffset + 1}–
            {Math.min(visibleColumnOffset + MAX_VISIBLE_COLUMNS, fields.length)} of {fields.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            disabled={visibleColumnOffset === 0}
            onClick={() => setVisibleColumnOffset((v) => Math.max(0, v - MAX_VISIBLE_COLUMNS))}
          >
            <ChevronLeft className="size-3" />
            Prev cols
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            disabled={visibleColumnOffset + MAX_VISIBLE_COLUMNS >= fields.length}
            onClick={() =>
              setVisibleColumnOffset((v) =>
                Math.min(fields.length - MAX_VISIBLE_COLUMNS, v + MAX_VISIBLE_COLUMNS)
              )
            }
          >
            Next cols
            <ChevronRight className="size-3" />
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                {visibleFields.map((field) => (
                  <TableHead
                    key={field.key}
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort(field.key)}
                  >
                    <div className="flex items-center gap-1">
                      {field.label}
                      {sortBy === field.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-30" />
                      )}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-28">Identity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {visibleFields.map((f) => (
                      <TableCell key={f.key}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 1}
                    className="text-center py-10 text-sm text-muted-foreground"
                  >
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id} className="hover:bg-muted/20">
                    {visibleFields.map((field) => {
                      const val = record.attributes[field.key];
                      return (
                        <TableCell key={field.key} className="max-w-[200px]">
                          <span className="truncate block text-sm">
                            {val == null ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : typeof val === "boolean" ? (
                              val ? "Yes" : "No"
                            ) : String(val)}
                          </span>
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      {record.identityClusterId ? (
                        <Link
                          href={`/clusters/${record.identityClusterId}`}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {record.identityClusterLabel ?? "Cluster"}
                          <ExternalLink className="size-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total.toLocaleString()} records · Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stream info helpers ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  active: { label: "Active", className: "bg-green-100 text-green-700 border-green-200" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

function StreamInfoCard({ stream }: { stream: Stream }) {
  const statusCfg = STATUS_CONFIG[stream.status] ?? STATUS_CONFIG.draft;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Stream Details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</p>
          <Badge variant="outline" className={cn("text-xs", statusCfg.className)}>
            {statusCfg.label}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Entity Type</p>
          <p className="font-medium capitalize">{stream.entityType ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Source Type</p>
          <p className="font-medium">{stream.sourceType?.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Schema Fields</p>
          <p className="font-medium">{stream.schemaDefinition?.fields?.length ?? 0}</p>
        </div>
        {stream.activatedAt && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Activated</p>
            <p className="font-medium">
              {new Date(stream.activatedAt).toLocaleDateString()}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created</p>
          <p className="font-medium">{new Date(stream.createdAt).toLocaleDateString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── StreamDetail Page ──────────────────────────────────────────────────────────

export default memo(function StreamDetail() {
  const [routeParams] = useRoute("/streams/:id");
  const streamId = routeParams?.id ?? "";

  const { data: stream, isLoading: streamLoading } = useQuery<Stream>({
    queryKey: ["/api/lite-cdp/streams", streamId],
    queryFn: () => getStream(streamId),
    enabled: !!streamId,
  });

  const identityRate =
    stream && stream.totalRecords > 0
      ? Math.round((stream.identifiedRecords / stream.totalRecords) * 100)
      : 0;

  return (
    <>
      <Header
        title={streamLoading ? "Loading…" : (stream?.name ?? "Stream")}
        subtitle={stream?.description ?? "Data stream records and analytics"}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {streamLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-3">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-7 w-24" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <StatCard
                label="Total Records"
                value={(stream?.totalRecords ?? 0).toLocaleString()}
                icon={Database}
              />
              <StatCard
                label="Identified"
                value={(stream?.identifiedRecords ?? 0).toLocaleString()}
                icon={UserCheck}
              />
              <StatCard
                label="Identity Rate"
                value={`${identityRate}%`}
                icon={LinkIcon}
              />
              <StatCard
                label="Clusters"
                value="—"
                icon={Users}
              />
            </>
          )}
        </div>

        {/* Stream info */}
        {stream && <StreamInfoCard stream={stream} />}

        {/* Records table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Records</CardTitle>
          </CardHeader>
          <CardContent>
            <DynamicRecordsTable streamId={streamId} schema={stream?.schemaDefinition} />
          </CardContent>
        </Card>
      </div>
    </>
  );
});
