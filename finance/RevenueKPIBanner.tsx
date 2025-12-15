import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPIData {
  label: string;
  value: number;
  previousValue?: number;
  onClick?: () => void;
}

interface RevenueKPIBannerProps {
  revenue: KPIData;
  mtd: KPIData;
  qtd: KPIData;
  ytd: KPIData;
}

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const calculateTrend = (current: number, previous?: number) => {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

const KPICard = ({ label, value, previousValue, onClick }: KPIData) => {
  const trend = calculateTrend(value, previousValue);
  const isPositive = trend !== null && trend >= 0;

  return (
    <Card 
      className={cn(
        "bg-card hover:shadow-md transition-all duration-200 cursor-pointer border-0 shadow-sm",
        "hover:scale-[1.02]"
      )}
      onClick={onClick}
    >
      <CardContent className="p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
        <p className="text-3xl font-semibold text-foreground tracking-tight">
          {formatCurrency(value)}
        </p>
        {trend !== null && (
          <div className={cn(
            "flex items-center justify-center gap-1 mt-2 text-sm font-medium",
            isPositive ? "text-success" : "text-destructive"
          )}>
            {isPositive ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>{isPositive ? "+" : ""}{trend.toFixed(1)}%</span>
            <span className="text-muted-foreground font-normal ml-1">vs prev</span>
          </div>
        )}
        {trend === null && (
          <p className="text-xs text-muted-foreground mt-2">Click for details</p>
        )}
      </CardContent>
    </Card>
  );
};

export function RevenueKPIBanner({ revenue, mtd, qtd, ytd }: RevenueKPIBannerProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <KPICard {...revenue} />
      <KPICard {...mtd} />
      <KPICard {...qtd} />
      <KPICard {...ytd} />
    </div>
  );
}
