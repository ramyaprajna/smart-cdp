import { useState, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Merge, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Identifier {
  type: string;
  value: string;
}

interface ClusterSummary {
  id: string;
  primaryLabel: string | null;
  identifiers: Identifier[];
  recordCount: number;
  streamCount: number;
}

interface ClustersResponse {
  clusters: ClusterSummary[];
  total: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface MergeClusterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default memo(function MergeClusterDialog({
  open,
  onOpenChange,
  clusterId,
}: MergeClusterDialogProps) {
  const [targetClusterId, setTargetClusterId] = useState("");
  const [reason, setReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: searchResults, isLoading: isSearching } = useQuery<ClustersResponse>({
    queryKey: ["/api/lite-cdp/clusters", { search: debouncedSearch, page: 1, pageSize: 10 }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "10" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await apiRequest("GET", `/api/lite-cdp/clusters?${params.toString()}`);
      return res.json();
    },
    enabled: open && debouncedSearch.length >= 2,
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/lite-cdp/clusters/merge", {
        clusterAId: clusterId,
        clusterBId: targetClusterId,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lite-cdp/clusters"] });
      toast({
        title: "Clusters merged",
        description: "The clusters have been merged successfully.",
      });
      onOpenChange(false);
      setTargetClusterId("");
      setReason("");
      setSearchQuery("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to merge clusters. Please try again.",
        variant: "destructive",
      });
    },
  });

  function handleClose(open: boolean) {
    if (!open) {
      setTargetClusterId("");
      setReason("");
      setSearchQuery("");
    }
    onOpenChange(open);
  }

  // Filter out current cluster from results
  const filteredResults = searchResults?.clusters?.filter((c) => c.id !== clusterId) ?? [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge Clusters</DialogTitle>
          <DialogDescription>
            All records and identifiers from the target cluster will be merged into this cluster.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Warning banner */}
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">
            Merging is permanent. The target cluster will be deleted and all its data moved here.
          </p>
        </div>

        {/* Search for target cluster */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Find target cluster</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or identifier…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (targetClusterId) setTargetClusterId("");
              }}
              className="pl-9"
            />
          </div>

          {/* Results */}
          {searchQuery.length >= 2 && (
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {isSearching ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-md" />
                  ))}
                </div>
              ) : filteredResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Merge className="h-7 w-7 opacity-30" />
                  <p className="text-sm">No other clusters found.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredResults.map((cluster) => {
                    const isSelected = targetClusterId === cluster.id;
                    const previewIdentifiers = cluster.identifiers?.slice(0, 3) ?? [];

                    return (
                      <button
                        key={cluster.id}
                        type="button"
                        className={cn(
                          "w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-muted/50 transition-colors",
                          isSelected && "bg-muted"
                        )}
                        onClick={() => setTargetClusterId(isSelected ? "" : cluster.id)}
                      >
                        <div className="mt-0.5 shrink-0">
                          <CheckCircle2
                            className={cn(
                              "h-4 w-4",
                              isSelected ? "text-primary" : "text-muted-foreground/30"
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground truncate">
                              {cluster.primaryLabel || "Unknown Identity"}
                            </span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {cluster.recordCount} records
                            </Badge>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {cluster.streamCount} streams
                            </Badge>
                          </div>
                          {previewIdentifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {previewIdentifiers.map((id, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground font-mono"
                                >
                                  {id.value.length > 18 ? id.value.slice(0, 18) + "…" : id.value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {searchQuery.length > 0 && searchQuery.length < 2 && (
            <p className="text-xs text-muted-foreground">Type at least 2 characters to search.</p>
          )}
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Reason <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            placeholder="e.g. Duplicate profiles, same customer detected across systems…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mergeMutation.mutate()}
            disabled={!targetClusterId || mergeMutation.isPending}
          >
            {mergeMutation.isPending ? "Merging…" : "Merge Clusters"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
