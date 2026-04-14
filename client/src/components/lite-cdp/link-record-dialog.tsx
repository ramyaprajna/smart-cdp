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
import { Search, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StreamRecord {
  id: string;
  streamId: string;
  streamName: string;
  attributes: Record<string, unknown>;
}

interface RecordsSearchResponse {
  records: StreamRecord[];
  total: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface LinkRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default memo(function LinkRecordDialog({
  open,
  onOpenChange,
  clusterId,
}: LinkRecordDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<RecordsSearchResponse>({
    queryKey: ["/api/lite-cdp/records/search", debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await apiRequest("GET", `/api/lite-cdp/records?${params.toString()}`);
      return res.json();
    },
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/lite-cdp/clusters/${clusterId}/link`, {
        recordId: selectedRecord,
        linkType: "manual_linked",
        confidence: 1.0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lite-cdp/clusters", clusterId] });
      toast({ title: "Record linked", description: "The record has been added to this cluster." });
      onOpenChange(false);
      setSearchQuery("");
      setSelectedRecord(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to link the record. Please try again.",
        variant: "destructive",
      });
    },
  });

  function handleClose(open: boolean) {
    if (!open) {
      setSearchQuery("");
      setSelectedRecord(null);
    }
    onOpenChange(open);
  }

  function getPreviewAttributes(attributes: Record<string, unknown>): string {
    return Object.entries(attributes)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v ?? "")}`)
      .join(" · ");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link Record to Cluster</DialogTitle>
          <DialogDescription>
            Search for a record to link to this identity cluster.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by record ID or attribute value…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Results list */}
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : !data?.records?.length ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <FileText className="h-8 w-8 opacity-30" />
              <p className="text-sm">
                {searchQuery ? "No records found. Try a different search." : "Start typing to search records."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.records.map((record) => {
                const isSelected = selectedRecord === record.id;
                return (
                  <button
                    key={record.id}
                    type="button"
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-muted/50 transition-colors",
                      isSelected && "bg-muted"
                    )}
                    onClick={() => setSelectedRecord(isSelected ? null : record.id)}
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs text-foreground truncate">
                          {record.id.slice(0, 16)}…
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {record.streamName || record.streamId}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {getPreviewAttributes(record.attributes)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={!selectedRecord || linkMutation.isPending}
          >
            {linkMutation.isPending ? "Linking…" : "Link Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
