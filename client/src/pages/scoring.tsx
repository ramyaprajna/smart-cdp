import { useState, memo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Activity, Search, TrendingUp, TrendingDown, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

const BAND_COLORS: Record<string, string> = {
  champion: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  engaged: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  at_risk: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  dormant: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface ScoreResult {
  score: {
    profileId: string;
    engagementScore: number;
    scoreBand: string;
    churnRiskLevel: string;
    lastActiveDays: number;
    activityStreak: number;
    dormancyFlag: boolean;
    totalEvents?: number;
    loyaltyPointsBalance?: number;
  };
  fresh: boolean;
}

interface DistributionBand {
  count: number;
  avgScore?: number;
}

interface DistributionData {
  bands?: Record<string, DistributionBand>;
  [key: string]: unknown;
}

interface ScoringProfile {
  profileId: string;
  engagementScore: number;
  scoreBand: string;
  churnRiskLevel: string;
  lastActiveDays: number;
  activityStreak?: number;
  dormancyFlag?: boolean;
  scoreCalculatedAt?: string;
}

interface SummaryData {
  campaigns: unknown;
  scoreDistribution: DistributionData;
  generatedAt: string;
}

export default memo(function Scoring() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [profileId, setProfileId] = useState("");
  const [searchedProfileId, setSearchedProfileId] = useState("");

  const { data: scoreData, isLoading: scoreLoading } = useQuery<ScoreResult>({
    queryKey: ["/api/scoring/profiles", searchedProfileId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/scoring/profiles/${searchedProfileId}?recalculate=true`);
      return res.json();
    },
    enabled: !!searchedProfileId,
  });

  const { data: distributionData, isLoading: distLoading } = useQuery<{ distribution: DistributionData }>({
    queryKey: ["/api/scoring/distribution"],
  });

  const { data: summaryData } = useQuery<SummaryData>({
    queryKey: ["/api/scoring/summary"],
  });

  const { data: highValueData } = useQuery<{ profiles: ScoringProfile[]; total: number }>({
    queryKey: ["/api/scoring/high-value"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/scoring/high-value?limit=10");
      return res.json();
    },
  });

  const { data: churnRiskData } = useQuery<{ profiles: ScoringProfile[]; total: number }>({
    queryKey: ["/api/scoring/churn-risk"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/scoring/churn-risk?limit=10");
      return res.json();
    },
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scoring/batch", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Batch scoring started", description: `Job ID: ${data.jobId}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start batch scoring", description: err.message, variant: "destructive" });
    },
  });

  const handleSearch = () => {
    if (profileId.trim()) setSearchedProfileId(profileId.trim());
  };

  const score = scoreData?.score;
  const distribution = distributionData?.distribution;
  const highValueProfiles: ScoringProfile[] = highValueData?.profiles ?? [];
  const churnRiskProfiles: ScoringProfile[] = churnRiskData?.profiles ?? [];

  return (
    <div className="flex-1 overflow-auto">
      <Header title="Scoring Dashboard" subtitle="Customer engagement scoring and analytics" />

      <div className="p-6 space-y-6">
        {distribution && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {["champion", "active", "engaged", "at_risk", "dormant"].map((band) => {
              const bandObj = distribution.bands?.[band];
              const bandRaw = distribution[band];
              const count = typeof bandObj === "object" && bandObj !== null ? bandObj.count ?? 0 : typeof bandRaw === "number" ? bandRaw : 0;
              return (
                <Card key={band}>
                  <CardContent className="pt-6 text-center">
                    <Badge className={BAND_COLORS[band] ?? ""}>{band.replace("_", " ")}</Badge>
                    <p className="text-3xl font-bold mt-2">{count}</p>
                    <p className="text-xs text-muted-foreground">profiles</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={() => batchMutation.mutate()} disabled={batchMutation.isPending || !isAdmin} variant="outline" title={!isAdmin ? "Admin only" : undefined}>
            {batchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run Batch Scoring
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Calculate Customer Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <Input
                placeholder="Enter Profile ID (UUID)"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="max-w-md"
              />
              <Button onClick={handleSearch} disabled={!profileId.trim()}>
                Calculate
              </Button>
            </div>

            {scoreLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span>Calculating score...</span>
              </div>
            )}

            {score && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Activity className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-3xl font-bold">{score.engagementScore}</p>
                  <p className="text-xs text-muted-foreground">Engagement Score</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Score Band</p>
                  <Badge className={BAND_COLORS[score.scoreBand] ?? ""}>
                    {score.scoreBand?.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Churn Risk</p>
                  <Badge variant={score.churnRiskLevel === "HIGH" ? "destructive" : score.churnRiskLevel === "MEDIUM" ? "outline" : "default"}>
                    {score.churnRiskLevel}
                  </Badge>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-1">Activity Streak</p>
                  <p className="text-2xl font-bold">{score.activityStreak ?? 0}</p>
                  <p className="text-xs text-muted-foreground">days</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Scoring Rules & Methodology
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Engagement Score Bands</h4>
                <div className="space-y-2 text-sm">
                  {[
                    { band: "champion", range: "80–100", desc: "Highly active, frequent engagement" },
                    { band: "active", range: "60–79", desc: "Regular activity and participation" },
                    { band: "engaged", range: "40–59", desc: "Moderate engagement levels" },
                    { band: "at_risk", range: "20–39", desc: "Declining activity, needs re-engagement" },
                    { band: "dormant", range: "0–19", desc: "Inactive, potential churn candidate" },
                  ].map((rule) => (
                    <div key={rule.band} className="flex items-center gap-2">
                      <Badge className={BAND_COLORS[rule.band] ?? ""}>{rule.band.replace("_", " ")}</Badge>
                      <span className="text-muted-foreground">{rule.range} pts — {rule.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Score Factors</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Event frequency and recency</li>
                  <li>Activity streak (consecutive active days)</li>
                  <li>Last active days (dormancy detection)</li>
                  <li>Loyalty points balance</li>
                  <li>Total event count across channels</li>
                  <li>Campaign interaction history</li>
                </ul>
                <h4 className="font-medium mt-4 mb-2">Churn Risk Levels</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">HIGH</Badge>
                    <span className="text-muted-foreground">Dormant or at-risk with no recent activity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">MEDIUM</Badge>
                    <span className="text-muted-foreground">Declining engagement trend</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>LOW</Badge>
                    <span className="text-muted-foreground">Healthy engagement pattern</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                High-Value Profiles ({highValueData?.total ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {highValueProfiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No high-value profiles scored yet.</p>
              ) : (
                <div className="space-y-2">
                  {highValueProfiles.map((p: ScoringProfile) => (
                    <div key={p.profileId} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm font-mono">{p.profileId.slice(0, 8)}...</span>
                      <div className="flex items-center gap-2">
                        <Badge className={BAND_COLORS[p.scoreBand] ?? ""}>{p.scoreBand}</Badge>
                        <span className="text-sm font-bold">{p.engagementScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Churn Risk Profiles ({churnRiskData?.total ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {churnRiskProfiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No churn-risk profiles scored yet.</p>
              ) : (
                <div className="space-y-2">
                  {churnRiskProfiles.map((p: ScoringProfile) => (
                    <div key={p.profileId} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm font-mono">{p.profileId.slice(0, 8)}...</span>
                      <div className="flex items-center gap-2">
                        <Badge className={BAND_COLORS[p.scoreBand] ?? ""}>{p.scoreBand}</Badge>
                        <span className="text-sm font-bold">{p.engagementScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});
