import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, Sector } from "recharts";
import { useState } from "react";

interface BreakdownItem {
  name: string;
  value: number;
}

export type TimeWindow = "LTD" | "MTD" | "QTD" | "YTD";

interface RevenueDonutChartProps {
  data: BreakdownItem[];
  total: number;
  groupBy: "commodity" | "buyer" | "country" | "bl_order";
  onGroupByChange: (value: "commodity" | "buyer" | "country" | "bl_order") => void;
  onSliceClick?: (name: string) => void;
  timeWindow?: TimeWindow;
  onTimeWindowChange?: (value: TimeWindow) => void;
}

// Soft pastel colors for executive look
const PASTEL_COLORS = [
  "hsl(183, 41%, 35%)",  // Primary teal
  "hsl(169, 83%, 55%)",  // Secondary mint
  "hsl(217, 91%, 60%)",  // Blue
  "hsl(142, 71%, 45%)",  // Green
  "hsl(38, 94%, 60%)",   // Amber
  "hsl(280, 65%, 60%)",  // Purple
  "hsl(350, 80%, 60%)",  // Rose
  "hsl(190, 75%, 50%)",  // Cyan
];

const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  LTD: "Life-to-date",
  MTD: "Month-to-date",
  QTD: "Quarter-to-date",
  YTD: "Year-to-date",
};

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

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export function RevenueDonutChart({
  data,
  total,
  groupBy,
  onGroupByChange,
  onSliceClick,
  timeWindow = "LTD",
  onTimeWindowChange,
}: RevenueDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const chartData = useMemo(() => {
    return data.slice(0, 8).map((item, index) => ({
      ...item,
      percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : "0",
      color: PASTEL_COLORS[index % PASTEL_COLORS.length],
    }));
  }, [data, total]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatFullCurrency(item.value)} ({item.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex flex-col gap-2 ml-4">
        {payload?.map((entry: any, index: number) => (
          <div 
            key={index} 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onSliceClick?.(entry.payload.name)}
          >
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0" 
              style={{ backgroundColor: entry.color }} 
            />
            <span className="text-sm text-foreground truncate max-w-[100px]">
              {entry.payload.name}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {entry.payload.percentage}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="border-0 shadow-sm h-[340px]">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Revenue Breakdown</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={groupBy} onValueChange={(v: any) => onGroupByChange(v)}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="commodity">Commodity</SelectItem>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="country">Country</SelectItem>
                  <SelectItem value="bl_order">BL Order</SelectItem>
                </SelectContent>
              </Select>
              {onTimeWindowChange && (
                <Select value={timeWindow} onValueChange={(v: TimeWindow) => onTimeWindowChange(v)}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LTD">LTD</SelectItem>
                    <SelectItem value="MTD">MTD</SelectItem>
                    <SelectItem value="QTD">QTD</SelectItem>
                    <SelectItem value="YTD">YTD</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Time window: {TIME_WINDOW_LABELS[timeWindow]}
          </p>
        </div>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="35%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
              onClick={(data) => onSliceClick?.(data.name)}
              cursor="pointer"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              content={<CustomLegend />}
              layout="vertical"
              align="right"
              verticalAlign="middle"
            />
            {/* Center text */}
            <text
              x="35%"
              y="47%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground"
            >
              <tspan x="35%" dy="-0.2em" className="text-2xl font-semibold">
                {formatCurrency(total)}
              </tspan>
              <tspan x="35%" dy="1.5em" className="text-xs fill-muted-foreground">
                Total Revenue
              </tspan>
            </text>
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}