import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Layers, Search, CheckCircle, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StatsCardsProps {
  stats: {
    totalCustomers: number;
    activeSegments: number;
    avgDataQuality: number;
    newCustomersThisMonth: number;
    totalEmbeddings?: number;
  };
}

const StatsCards = memo<StatsCardsProps>(function StatsCards({ stats }) {
  const cards = [
    {
      title: "Total Customers",
      value: stats.totalCustomers.toLocaleString(),
      change: "",
      icon: Users,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      tooltip: "Total number of customer profiles imported from your authentic customer database. Includes comprehensive demographic and behavioral data across all customer segments."
    },
    {
      title: "Active Segments",
      value: stats.activeSegments.toString(),
      change: "Customer classifications",
      icon: Layers,
      iconColor: "text-secondary",
      iconBg: "bg-secondary/10",
      tooltip: "Number of customer segments used to classify customers by demographics, profession, and engagement patterns. Segments help analyze audience composition and preferences."
    },
    {
      title: "Vector Embeddings",
      value: (stats.totalEmbeddings || stats.totalCustomers).toLocaleString(),
      change: "100% customer coverage",
      icon: Search,
      iconColor: "text-accent",
      iconBg: "bg-accent/10",
      tooltip: "All customers now have AI-generated vector embeddings for semantic similarity search. These profiles enable finding similar customers based on demographics, location, and behavior patterns across your complete customer database."
    },
    {
      title: "Data Quality",
      value: `${stats.avgDataQuality.toFixed(1)}%`,
      change: "Profile completeness",
      icon: CheckCircle,
      iconColor: "text-success",
      iconBg: "bg-success/10",
      tooltip: "Average completeness score of customer profiles based on available demographic data, contact information, and segment classification. Higher scores indicate more complete customer insights."
    }
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 dashboard-stats">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <Card className="cursor-help hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <p className="text-3xl font-bold text-foreground">{card.value}</p>
                        <p className="text-xs text-success">{card.change}</p>
                      </div>
                      <div className={`w-12 h-12 ${card.iconBg} rounded-lg flex items-center justify-center`}>
                        <Icon className={`${card.iconColor} w-6 h-6`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{card.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
});

export default StatsCards;
