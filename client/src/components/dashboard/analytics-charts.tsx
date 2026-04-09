import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { useDashboardCharts } from "@/hooks/use-dashboard-charts";

interface AnalyticsChartsProps {
  segmentDistribution: Array<{ segment: string; count: number }>;
}

const COLORS = ['hsl(248, 83%, 67%)', 'hsl(258, 70%, 68%)', 'hsl(188, 94%, 43%)', 'hsl(158, 64%, 52%)', 'hsl(45, 93%, 47%)'];

const AnalyticsCharts = memo<AnalyticsChartsProps>(function AnalyticsCharts({ segmentDistribution }) {
  const { formatChartValue, getSegmentColor } = useDashboardCharts();
  return (
    <TooltipProvider>
      <div className="flex justify-center">
        <Card className="w-full max-w-2xl analytics-charts">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Customer Segments</CardTitle>
              <UITooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>Visual breakdown of how customers are categorized by profession, demographics, and engagement patterns. Each segment represents different audience groups to help understand customer composition and behavior.</p>
                </TooltipContent>
              </UITooltip>
            </div>
            <p className="text-sm text-muted-foreground">
              Distribution of authentic customer data from imported sources
            </p>
          </CardHeader>
          <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={segmentDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                paddingAngle={5}
                dataKey="count"
              >
                {segmentDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {segmentDistribution.map((entry, index) => (
              <div key={entry.segment} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm font-medium">{entry.segment}</span>
                </div>
                <span className="text-sm text-muted-foreground font-semibold">
                  {entry.count}
                </span>
              </div>
            ))}
          </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
});

export default AnalyticsCharts;
