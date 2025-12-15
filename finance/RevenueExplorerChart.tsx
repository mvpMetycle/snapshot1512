import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ComposedChart, 
  Bar, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";
import { format, parseISO, subMonths, startOfMonth, startOfQuarter, startOfYear, isWithinInterval, endOfDay } from "date-fns";

interface Revenue {
  id: string;
  bl_order_name: string | null;
  recognition_date: string;
  total_revenue: number;
}

interface RevenueExplorerChartProps {
  revenues: Revenue[];
  onBarClick?: (month: string) => void;
  groupBy: "commodity" | "buyer" | "country" | "bl_order";
  onGroupByChange: (value: "commodity" | "buyer" | "country" | "bl_order") => void;
}

type TimeView = "mtd" | "qtd" | "ytd" | "trailing12";

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toFixed(0)}`;
};

const formatFullCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RevenueExplorerChart({ 
  revenues, 
  onBarClick,
  groupBy,
  onGroupByChange 
}: RevenueExplorerChartProps) {
  const [timeView, setTimeView] = useState<TimeView>("trailing12");

  const chartData = useMemo(() => {
    const today = new Date();
    let startDate: Date;
    let endDate = today;

    switch (timeView) {
      case "mtd":
        startDate = startOfMonth(today);
        break;
      case "qtd":
        startDate = startOfQuarter(today);
        break;
      case "ytd":
        startDate = startOfYear(today);
        break;
      case "trailing12":
      default:
        startDate = subMonths(today, 12);
        break;
    }

    const filteredRevenues = revenues.filter((r) => {
      if (!r.recognition_date) return false;
      const recDate = parseISO(r.recognition_date);
      return isWithinInterval(recDate, { start: startDate, end: endOfDay(endDate) });
    });

    // Group by month
    const monthMap: Record<string, number> = {};
    filteredRevenues.forEach((r) => {
      if (!r.recognition_date) return;
      const monthKey = format(parseISO(r.recognition_date), "MMM yyyy");
      monthMap[monthKey] = (monthMap[monthKey] || 0) + r.total_revenue;
    });

    // Sort and calculate cumulative
    const sortedEntries = Object.entries(monthMap).sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      return dateA.getTime() - dateB.getTime();
    });

    let cumulative = 0;
    return sortedEntries.map(([month, revenue]) => {
      cumulative += revenue;
      return {
        month,
        revenue,
        cumulative,
      };
    });
  }, [revenues, timeView]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-primary" />
              <span className="text-muted-foreground">Monthly:</span>
              <span className="font-medium">{formatFullCurrency(payload[0]?.value || 0)}</span>
            </p>
            <p className="text-sm flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(217, 91%, 60%)" }} />
              <span className="text-muted-foreground">Cumulative:</span>
              <span className="font-medium">{formatFullCurrency(payload[1]?.value || 0)}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-lg font-semibold">Revenue Explorer</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            {/* Time View Toggles */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["mtd", "qtd", "ytd", "trailing12"] as TimeView[]).map((view) => (
                <Button
                  key={view}
                  variant="ghost"
                  size="sm"
                  className={`rounded-none px-3 h-8 text-xs font-medium ${
                    timeView === view 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setTimeView(view)}
                >
                  {view === "trailing12" ? "12M" : view.toUpperCase()}
                </Button>
              ))}
            </div>

          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart 
            data={chartData} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onClick={(data) => {
              if (data?.activeLabel && onBarClick) {
                onBarClick(data.activeLabel);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              dy={10}
            />
            <YAxis 
              yAxisId="left"
              tickFormatter={formatCurrency}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              width={60}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tickFormatter={formatCurrency}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
            <Legend 
              wrapperStyle={{ paddingTop: 20 }}
              formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
            />
            <Bar 
              yAxisId="left"
              dataKey="revenue" 
              name="Monthly Revenue"
              fill="hsl(var(--primary))" 
              radius={[4, 4, 0, 0]}
              cursor="pointer"
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="cumulative" 
              name="Cumulative"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={{ fill: "hsl(217, 91%, 60%)", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
