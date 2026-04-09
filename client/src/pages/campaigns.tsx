import { useState, memo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, Play, Square, Clock, CheckCircle2, XCircle, Send, BarChart3, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  sending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  draft: Clock,
  scheduled: Clock,
  sending: Send,
  completed: CheckCircle2,
  cancelled: XCircle,
};

interface Campaign {
  id: string;
  name: string;
  description?: string;
  channel: string;
  status: string;
  segmentDefinitionId?: string;
  templateId?: string;
  scheduledAt?: string;
  createdAt: string;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  failedCount?: number;
  audienceSize?: number;
}

export default memo(function Campaigns() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    channel: "whatsapp" as string,
    segmentDefinitionId: "",
    templateId: "",
  });

  const { data: campaignsData, isLoading } = useQuery<{ campaigns: Campaign[]; total: number }>({
    queryKey: ["/api/campaigns", filterStatus !== "all" ? `?status=${filterStatus}` : ""],
    queryFn: async () => {
      const url = filterStatus !== "all" ? `/api/campaigns?status=${filterStatus}` : "/api/campaigns";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["/api/campaigns", selectedCampaign, "analytics"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/campaigns/${selectedCampaign}/analytics`);
      return res.json();
    },
    enabled: !!selectedCampaign,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        description: data.description || undefined,
        channel: data.channel,
        templateId: data.templateId || undefined,
      };
      if (data.segmentDefinitionId.trim()) {
        payload.segmentDefinitionId = data.segmentDefinitionId.trim();
      }
      const res = await apiRequest("POST", "/api/campaigns", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsCreateOpen(false);
      setFormData({ name: "", description: "", channel: "whatsapp", segmentDefinitionId: "", templateId: "" });
      toast({ title: "Campaign created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await apiRequest("POST", `/api/campaigns/${id}/${action}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campaign updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const campaigns = campaignsData?.campaigns ?? [];

  const handleCreate = useCallback(() => {
    if (!formData.name.trim()) return;
    createMutation.mutate(formData);
  }, [formData, createMutation]);

  return (
    <div className="flex-1 overflow-auto">
      <Header
        title="Campaign Management"
        subtitle="Create and manage marketing campaigns across channels"
        onAction={() => setIsCreateOpen(true)}
        actionLabel="New Campaign"
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Status:</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading campaigns...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground mb-4">Create your first campaign to get started.</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((campaign) => {
              const StatusIcon = STATUS_ICONS[campaign.status] ?? Clock;
              return (
                <Card key={campaign.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{campaign.name}</h3>
                          <Badge className={STATUS_COLORS[campaign.status] ?? ""}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {campaign.status}
                          </Badge>
                          <Badge variant="outline">{campaign.channel}</Badge>
                        </div>
                        {campaign.description && (
                          <p className="text-sm text-muted-foreground mb-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Created: {new Date(campaign.createdAt).toLocaleDateString()}</span>
                          {campaign.scheduledAt && (
                            <span>Scheduled: {new Date(campaign.scheduledAt).toLocaleString()}</span>
                          )}
                          {campaign.audienceSize != null && <span>Audience: {campaign.audienceSize}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {campaign.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actionMutation.mutate({ id: campaign.id, action: "execute" })}
                            disabled={actionMutation.isPending}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Execute
                          </Button>
                        )}
                        {(campaign.status === "draft" || campaign.status === "scheduled") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actionMutation.mutate({ id: campaign.id, action: "cancel" })}
                            disabled={actionMutation.isPending}
                          >
                            <Square className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        )}
                        {campaign.status === "sending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actionMutation.mutate({ id: campaign.id, action: "complete" })}
                            disabled={actionMutation.isPending}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Complete
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedCampaign(selectedCampaign === campaign.id ? null : campaign.id)}
                        >
                          <BarChart3 className="h-3 w-3 mr-1" />
                          Analytics
                        </Button>
                      </div>
                    </div>

                    {selectedCampaign === campaign.id && analyticsData && (
                      <div className="mt-4 pt-4 border-t grid grid-cols-4 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold">{analyticsData.sentCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Sent</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">{analyticsData.deliveredCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Delivered</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">{analyticsData.readCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Read</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">{analyticsData.failedCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter campaign name"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Campaign description"
              />
            </div>
            <div>
              <Label htmlFor="segmentDefinitionId">Segment ID (optional)</Label>
              <Input
                id="segmentDefinitionId"
                value={formData.segmentDefinitionId}
                onChange={(e) => setFormData({ ...formData, segmentDefinitionId: e.target.value })}
                placeholder="Segment Definition UUID for audience targeting"
              />
            </div>
            <div>
              <Label htmlFor="channel">Channel</Label>
              <Select value={formData.channel} onValueChange={(v) => setFormData({ ...formData, channel: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="push">Push Notification</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="templateId">Template ID (optional)</Label>
              <Input
                id="templateId"
                value={formData.templateId}
                onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                placeholder="Template identifier"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !formData.name.trim()}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
