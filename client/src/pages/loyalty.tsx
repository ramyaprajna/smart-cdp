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
import { Star, TrendingUp, TrendingDown, Gift, Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BalanceData {
  balance: {
    profileId: string;
    currentBalance: number;
    totalEarned: number;
    totalBurned: number;
    pendingRedemption: number;
    loyaltyTier: string;
    lastTransactionAt: string | null;
  };
}

interface LedgerEntry {
  id: string;
  transactionType: string;
  points: number;
  activityType: string;
  createdAt: string;
  referenceId?: string;
}

export default memo(function Loyalty() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [profileId, setProfileId] = useState("");
  const [searchedProfileId, setSearchedProfileId] = useState("");
  const [earnForm, setEarnForm] = useState({
    profileId: "",
    activityType: "task_complete" as string,
    idempotencyKey: "",
  });
  const [burnForm, setBurnForm] = useState({
    profileId: "",
    activityType: "redemption" as string,
    points: 0,
    idempotencyKey: "",
  });
  const [redeemForm, setRedeemForm] = useState({
    profileId: "",
    points: 0,
    rewardType: "voucher" as string,
    idempotencyKey: "",
  });

  const { data: balanceData, isLoading: balanceLoading } = useQuery<BalanceData>({
    queryKey: ["/api/loyalty/balance", searchedProfileId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/loyalty/balance/${searchedProfileId}`);
      return res.json();
    },
    enabled: !!searchedProfileId,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ entries: LedgerEntry[]; total: number }>({
    queryKey: ["/api/loyalty/history", searchedProfileId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/loyalty/history/${searchedProfileId}`);
      return res.json();
    },
    enabled: !!searchedProfileId,
  });

  const { data: rulesData } = useQuery({
    queryKey: ["/api/loyalty/rules"],
  });

  const earnMutation = useMutation({
    mutationFn: async (data: typeof earnForm) => {
      const res = await apiRequest("POST", "/api/loyalty/earn", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty"] });
      toast({ title: "Points earned successfully" });
      setEarnForm({ profileId: "", activityType: "task_complete", idempotencyKey: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to earn points", description: err.message, variant: "destructive" });
    },
  });

  const burnMutation = useMutation({
    mutationFn: async (data: typeof burnForm) => {
      const res = await apiRequest("POST", "/api/loyalty/burn", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty"] });
      toast({ title: "Points burned successfully" });
      setBurnForm({ profileId: "", activityType: "redemption", points: 0, idempotencyKey: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to burn points", description: err.message, variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (data: typeof redeemForm) => {
      const res = await apiRequest("POST", "/api/loyalty/redeem", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty"] });
      toast({ title: "Redemption submitted successfully" });
      setRedeemForm({ profileId: "", points: 0, rewardType: "voucher", idempotencyKey: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit redemption", description: err.message, variant: "destructive" });
    },
  });

  const handleSearch = useCallback(() => {
    if (profileId.trim()) setSearchedProfileId(profileId.trim());
  }, [profileId]);

  const balance = balanceData?.balance;

  return (
    <div className="flex-1 overflow-auto">
      <Header title="Loyalty Program" subtitle="Manage customer loyalty points, tiers, and redemptions" />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Look Up Customer Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Enter Profile ID (UUID)"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="max-w-md"
              />
              <Button onClick={handleSearch} disabled={!profileId.trim()}>
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {balanceLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading balance...</span>
          </div>
        )}

        {balance && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm text-muted-foreground">Current Balance</span>
                </div>
                <p className="text-3xl font-bold">{balance.currentBalance?.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">Total Earned</span>
                </div>
                <p className="text-3xl font-bold">{balance.totalEarned?.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  <span className="text-sm text-muted-foreground">Total Burned</span>
                </div>
                <p className="text-3xl font-bold">{balance.totalBurned?.toLocaleString() ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-5 w-5 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Tier</span>
                </div>
                <Badge className="text-lg px-3 py-1">{balance.loyaltyTier ?? "bronze"}</Badge>
              </CardContent>
            </Card>
          </div>
        )}

        {searchedProfileId && historyData && (
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : historyData.entries.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No transactions found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Type</th>
                        <th className="text-left py-2 px-3">Activity</th>
                        <th className="text-right py-2 px-3">Points</th>
                        <th className="text-left py-2 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.entries.map((entry) => (
                        <tr key={entry.id} className="border-b last:border-0">
                          <td className="py-2 px-3">
                            <Badge variant={entry.transactionType === "earn" ? "default" : "destructive"}>
                              {entry.transactionType}
                            </Badge>
                          </td>
                          <td className="py-2 px-3">{entry.activityType}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {entry.transactionType === "earn" ? "+" : "-"}{entry.points}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
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

        <Tabs defaultValue="earn">
          <TabsList>
            <TabsTrigger value="earn">Earn Points</TabsTrigger>
            <TabsTrigger value="burn">Burn Points</TabsTrigger>
            <TabsTrigger value="redeem">Redeem</TabsTrigger>
          </TabsList>

          <TabsContent value="earn">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label>Profile ID</Label>
                  <Input
                    value={earnForm.profileId}
                    onChange={(e) => setEarnForm({ ...earnForm, profileId: e.target.value })}
                    placeholder="Customer Profile UUID"
                  />
                </div>
                <div>
                  <Label>Activity Type</Label>
                  <Select value={earnForm.activityType} onValueChange={(v) => setEarnForm({ ...earnForm, activityType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quiz_complete">Quiz Complete</SelectItem>
                      <SelectItem value="survey_submit">Survey Submit</SelectItem>
                      <SelectItem value="referral_success">Referral Success</SelectItem>
                      <SelectItem value="task_complete">Task Complete</SelectItem>
                      <SelectItem value="admin_adjustment">Admin Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Idempotency Key</Label>
                  <Input
                    value={earnForm.idempotencyKey}
                    onChange={(e) => setEarnForm({ ...earnForm, idempotencyKey: e.target.value })}
                    placeholder="Unique key for deduplication"
                  />
                </div>
                <Button
                  onClick={() => earnMutation.mutate(earnForm)}
                  disabled={earnMutation.isPending || !earnForm.profileId || !earnForm.idempotencyKey}
                >
                  {earnMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Earn Points
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="burn">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label>Profile ID</Label>
                  <Input
                    value={burnForm.profileId}
                    onChange={(e) => setBurnForm({ ...burnForm, profileId: e.target.value })}
                    placeholder="Customer Profile UUID"
                  />
                </div>
                <div>
                  <Label>Activity Type</Label>
                  <Select value={burnForm.activityType} onValueChange={(v) => setBurnForm({ ...burnForm, activityType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="redemption">Redemption</SelectItem>
                      <SelectItem value="expiry">Expiry</SelectItem>
                      <SelectItem value="admin_adjustment">Admin Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Points</Label>
                  <Input
                    type="number"
                    value={burnForm.points || ""}
                    onChange={(e) => setBurnForm({ ...burnForm, points: parseInt(e.target.value) || 0 })}
                    placeholder="Points to burn"
                  />
                </div>
                <div>
                  <Label>Idempotency Key</Label>
                  <Input
                    value={burnForm.idempotencyKey}
                    onChange={(e) => setBurnForm({ ...burnForm, idempotencyKey: e.target.value })}
                    placeholder="Unique key for deduplication"
                  />
                </div>
                <Button
                  onClick={() => burnMutation.mutate(burnForm)}
                  disabled={burnMutation.isPending || !burnForm.profileId || !burnForm.idempotencyKey || burnForm.points <= 0}
                >
                  {burnMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Burn Points
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="redeem">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <Label>Profile ID</Label>
                  <Input
                    value={redeemForm.profileId}
                    onChange={(e) => setRedeemForm({ ...redeemForm, profileId: e.target.value })}
                    placeholder="Customer Profile UUID"
                  />
                </div>
                <div>
                  <Label>Points to Redeem</Label>
                  <Input
                    type="number"
                    value={redeemForm.points || ""}
                    onChange={(e) => setRedeemForm({ ...redeemForm, points: parseInt(e.target.value) || 0 })}
                    placeholder="Points"
                  />
                </div>
                <div>
                  <Label>Reward Type</Label>
                  <Select value={redeemForm.rewardType} onValueChange={(v) => setRedeemForm({ ...redeemForm, rewardType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voucher">Voucher</SelectItem>
                      <SelectItem value="cashback">Cashback</SelectItem>
                      <SelectItem value="merchandise">Merchandise</SelectItem>
                      <SelectItem value="donation">Donation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Idempotency Key</Label>
                  <Input
                    value={redeemForm.idempotencyKey}
                    onChange={(e) => setRedeemForm({ ...redeemForm, idempotencyKey: e.target.value })}
                    placeholder="Unique key for deduplication"
                  />
                </div>
                <Button
                  onClick={() => redeemMutation.mutate(redeemForm)}
                  disabled={redeemMutation.isPending || !redeemForm.profileId || !redeemForm.idempotencyKey || redeemForm.points <= 0}
                >
                  {redeemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit Redemption
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
});
