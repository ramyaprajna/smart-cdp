import { useState, memo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Ban, Search, Plus, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ConsentRecord {
  id: string;
  profileId: string;
  channel: string;
  status: string;
  method?: string;
  source?: string;
  updatedAt: string;
}

interface SuppressionEntry {
  id: string;
  identifierType: string;
  identifierValue: string;
  channel?: string;
  reason: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export default memo(function Consent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [consentProfileId, setConsentProfileId] = useState("");
  const [searchedProfileId, setSearchedProfileId] = useState("");
  const [isAddSuppressionOpen, setIsAddSuppressionOpen] = useState(false);
  const [suppressionForm, setSuppressionForm] = useState({
    identifierType: "email" as string,
    identifierValue: "",
    channel: "",
    reason: "manual" as string,
    notes: "",
  });

  const [consentForm, setConsentForm] = useState({
    profileId: "",
    channel: "email" as string,
    status: "opt_in" as string,
    method: "explicit" as string,
    source: "api" as string,
  });

  const { data: consentData, isLoading: consentLoading } = useQuery<{ success: boolean; data: ConsentRecord[] }>({
    queryKey: ["/api/consent", searchedProfileId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/consent/${searchedProfileId}`);
      return res.json();
    },
    enabled: !!searchedProfileId,
  });

  const { data: suppressionData, isLoading: suppressionLoading } = useQuery<{ success: boolean; data: SuppressionEntry[] }>({
    queryKey: ["/api/suppression"],
  });

  const recordConsentMutation = useMutation({
    mutationFn: async (data: typeof consentForm) => {
      const res = await apiRequest("POST", "/api/consent", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consent"] });
      toast({ title: "Consent recorded successfully" });
      setConsentForm({ profileId: "", channel: "email", status: "opt_in", method: "explicit", source: "api" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record consent", description: err.message, variant: "destructive" });
    },
  });

  const addSuppressionMutation = useMutation({
    mutationFn: async (data: typeof suppressionForm) => {
      const res = await apiRequest("POST", "/api/suppression", {
        ...data,
        channel: data.channel || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppression"] });
      setIsAddSuppressionOpen(false);
      setSuppressionForm({ identifierType: "email", identifierValue: "", channel: "", reason: "manual", notes: "" });
      toast({ title: "Added to suppression list" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add suppression", description: err.message, variant: "destructive" });
    },
  });

  const removeSuppressionMutation = useMutation({
    mutationFn: async (entry: SuppressionEntry) => {
      const res = await apiRequest("DELETE", "/api/suppression", {
        identifierType: entry.identifierType,
        identifierValue: entry.identifierValue,
        channel: entry.channel ?? null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppression"] });
      toast({ title: "Suppression entry removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove suppression", description: err.message, variant: "destructive" });
    },
  });

  const handleConsentSearch = useCallback(() => {
    if (consentProfileId.trim()) setSearchedProfileId(consentProfileId.trim());
  }, [consentProfileId]);

  const consentRecords = consentData?.data ?? [];
  const suppressionEntries = suppressionData?.data ?? [];

  return (
    <div className="flex-1 overflow-auto">
      <Header title="Consent & Suppression" subtitle="Manage customer consent preferences and suppression lists" />

      <div className="p-6">
        <Tabs defaultValue="consent">
          <TabsList className="mb-6">
            <TabsTrigger value="consent">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Consent Records
            </TabsTrigger>
            <TabsTrigger value="suppression">
              <Ban className="h-4 w-4 mr-2" />
              Suppression List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="consent" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Look Up Customer Consent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="Enter Profile ID (UUID)"
                    value={consentProfileId}
                    onChange={(e) => setConsentProfileId(e.target.value)}
                    className="max-w-md"
                  />
                  <Button onClick={handleConsentSearch} disabled={!consentProfileId.trim()}>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {consentLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading consent records...</span>
              </div>
            )}

            {searchedProfileId && !consentLoading && (
              <Card>
                <CardHeader>
                  <CardTitle>Consent Status for {searchedProfileId.slice(0, 8)}...</CardTitle>
                </CardHeader>
                <CardContent>
                  {consentRecords.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No consent records found for this profile.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3">Channel</th>
                            <th className="text-left py-2 px-3">Status</th>
                            <th className="text-left py-2 px-3">Method</th>
                            <th className="text-left py-2 px-3">Source</th>
                            <th className="text-left py-2 px-3">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {consentRecords.map((record) => (
                            <tr key={record.id} className="border-b last:border-0">
                              <td className="py-2 px-3">{record.channel}</td>
                              <td className="py-2 px-3">
                                <Badge variant={record.status === "opt_in" ? "default" : "destructive"}>
                                  {record.status}
                                </Badge>
                              </td>
                              <td className="py-2 px-3">{record.method ?? "-"}</td>
                              <td className="py-2 px-3">{record.source ?? "-"}</td>
                              <td className="py-2 px-3 text-muted-foreground">
                                {new Date(record.updatedAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Record Consent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Profile ID</Label>
                    <Input
                      value={consentForm.profileId}
                      onChange={(e) => setConsentForm({ ...consentForm, profileId: e.target.value })}
                      placeholder="Customer Profile UUID"
                    />
                  </div>
                  <div>
                    <Label>Channel</Label>
                    <Select value={consentForm.channel} onValueChange={(v) => setConsentForm({ ...consentForm, channel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="push">Push</SelectItem>
                        <SelectItem value="all">All Channels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={consentForm.status} onValueChange={(v) => setConsentForm({ ...consentForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opt_in">Opt In</SelectItem>
                        <SelectItem value="opt_out">Opt Out</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="revoked">Revoked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Method</Label>
                    <Select value={consentForm.method} onValueChange={(v) => setConsentForm({ ...consentForm, method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="explicit">Explicit</SelectItem>
                        <SelectItem value="implicit">Implicit</SelectItem>
                        <SelectItem value="double_opt_in">Double Opt-In</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={() => recordConsentMutation.mutate(consentForm)}
                  disabled={recordConsentMutation.isPending || !consentForm.profileId}
                >
                  {recordConsentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Record Consent
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppression" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Global Suppression List</h3>
              <Button onClick={() => setIsAddSuppressionOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Suppression
              </Button>
            </div>

            {suppressionLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading suppression list...</span>
              </div>
            ) : suppressionEntries.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Ban className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No suppression entries found.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Value</th>
                          <th className="text-left py-2 px-3">Channel</th>
                          <th className="text-left py-2 px-3">Reason</th>
                          <th className="text-left py-2 px-3">Status</th>
                          <th className="text-left py-2 px-3">Added</th>
                          <th className="text-right py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppressionEntries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0">
                            <td className="py-2 px-3">{entry.identifierType}</td>
                            <td className="py-2 px-3 font-mono text-xs">{entry.identifierValue}</td>
                            <td className="py-2 px-3">{entry.channel ?? "All"}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline">{entry.reason}</Badge>
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant={entry.isActive ? "destructive" : "secondary"}>
                                {entry.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {entry.isActive && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeSuppressionMutation.mutate(entry)}
                                  disabled={removeSuppressionMutation.isPending}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isAddSuppressionOpen} onOpenChange={setIsAddSuppressionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Suppression List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Identifier Type</Label>
              <Select
                value={suppressionForm.identifierType}
                onValueChange={(v) => setSuppressionForm({ ...suppressionForm, identifierType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="profile_id">Profile ID</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Identifier Value</Label>
              <Input
                value={suppressionForm.identifierValue}
                onChange={(e) => setSuppressionForm({ ...suppressionForm, identifierValue: e.target.value })}
                placeholder="e.g. user@example.com"
              />
            </div>
            <div>
              <Label>Channel (optional)</Label>
              <Input
                value={suppressionForm.channel}
                onChange={(e) => setSuppressionForm({ ...suppressionForm, channel: e.target.value })}
                placeholder="Leave empty for all channels"
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Select
                value={suppressionForm.reason}
                onValueChange={(v) => setSuppressionForm({ ...suppressionForm, reason: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                  <SelectItem value="bounce">Bounce</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="legal">Legal</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="fraud">Fraud</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={suppressionForm.notes}
                onChange={(e) => setSuppressionForm({ ...suppressionForm, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSuppressionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addSuppressionMutation.mutate(suppressionForm)}
              disabled={addSuppressionMutation.isPending || !suppressionForm.identifierValue}
            >
              {addSuppressionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Suppression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
