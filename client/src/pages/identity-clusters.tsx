import { useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/layout/header";
import { apiRequest } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Search,
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

interface Cluster {
  id: string;
  primaryLabel: string | null;
  identifiers: Identifier[];
  streamCount: number;
  recordCount: number;
  avgConfidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface ClustersResponse {
  clusters: Cluster[];
  total: number;
  page: number;
  pageSize: number;
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
  { icon: React.ElementType; className: string; label: string }
> = {
  email: { icon: Mail, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Email" },
  phone: { icon: Phone, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "Phone" },
  wa_number: { icon: MessageCircle, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "WA" },
  rfid: { icon: Radio, className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", label: "RFID" },
  cookie: { icon: Globe, className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", label: "Cookie" },
  ticket_number: { icon: Ticket, className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Ticket" },
  device_id: { icon: Smartphone, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", label: "Device" },
};

function IdentifierBadgeSmall({ identifier }: { identifier: Identifier }) {
  const config = identifierConfig[identifier.type] ?? {
    icon: Tag,
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    label: identifier.type,
  };
  const Icon = config.icon;
  const truncated =
    identifier.value.length > 20
      ? identifier.value.slice(0, 20) + "…"
      : identifier.value;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {truncated}
    </span>
  );
}

// ─── ClusterCard ─────────────────────────────────────────────────────────────

function streamCountBadgeClass(count: number): string {
  if (count >= 3) return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  if (count === 2) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const [, navigate] = useLocation();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow duration-200 border border-border"
      onClick={() => navigate(`/clusters/${cluster.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-foreground truncate">
            {cluster.primaryLabel || "Unknown Identity"}
          </p>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
              streamCountBadgeClass(cluster.streamCount)
            )}
          >
            Linked to {cluster.streamCount} stream{cluster.streamCount !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Identifier badges */}
        {cluster.identifiers?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cluster.identifiers.slice(0, 5).map((id, idx) => (
              <IdentifierBadgeSmall key={idx} identifier={id} />
            ))}
            {cluster.identifiers.length > 5 && (
              <span className="text-xs text-muted-foreground self-center">
                +{cluster.identifiers.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Record count */}
        <p className="text-sm text-muted-foreground">
          {cluster.recordCount ?? 0} record{cluster.recordCount !== 1 ? "s" : ""}
        </p>

        {/* Confidence */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Confidence</span>
            <span>{Math.round((cluster.avgConfidence ?? 0) * 100)}%</span>
          </div>
          <Progress value={(cluster.avgConfidence ?? 0) * 100} className="h-1.5" />
        </div>

        {/* Dates */}
        <div className="flex justify-between text-xs text-muted-foreground pt-1">
          <span>First seen: {formatDate(cluster.firstSeenAt)}</span>
          <span>Last seen: {formatDate(cluster.lastSeenAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ClustersSkeleton ────────────────────────────────────────────────────────

function ClustersSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="border border-border">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-24" />
            <div className="space-y-1">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-1.5 w-full" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-28" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── PaginationControls ───────────────────────────────────────────────────────

interface PaginationControlsProps {
  page: number;
  total?: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function PaginationControls({ page, total = 0, pageSize, onPageChange }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} &middot; {total} total
      </p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (page > 1) onPageChange(page - 1);
              }}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (page < totalPages) onPageChange(page + 1);
              }}
              className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default memo(function IdentityClusters() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [minStreamCount, setMinStreamCount] = useState<number | undefined>();
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery<ClustersResponse>({
    queryKey: ["/api/lite-cdp/clusters", { page, search: debouncedSearch, minStreamCount }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (minStreamCount !== undefined) params.set("minStreamCount", String(minStreamCount));
      const res = await apiRequest("GET", `/api/lite-cdp/clusters?${params.toString()}`);
      return res.json();
    },
  });

  return (
    <>
      <Header title="Identity Clusters" subtitle="Unified profiles across data streams" />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clusters..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={minStreamCount !== undefined ? String(minStreamCount) : "all"}
            onValueChange={(val) => {
              setMinStreamCount(val === "all" ? undefined : Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Min streams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clusters</SelectItem>
              <SelectItem value="2">2+ streams (cross-linked)</SelectItem>
              <SelectItem value="3">3+ streams</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cluster cards grid */}
        {isLoading ? (
          <ClustersSkeleton />
        ) : (
          <>
            {data?.clusters?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Search className="h-10 w-10 opacity-30" />
                <p className="text-sm">No clusters found. Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.clusters?.map((cluster) => (
                  <ClusterCard key={cluster.id} cluster={cluster} />
                ))}
              </div>
            )}
            <PaginationControls
              page={page}
              total={data?.total}
              pageSize={20}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
});
