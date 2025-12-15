import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, eachDayOfInterval, startOfDay, isSameDay } from "date-fns";

interface Invoice {
  id: number;
  invoice_number: string | null;
  total_amount: number | null;
  company_name: string | null;
  bl_order_name: string | null;
  order_id: string | null;
  invoice_direction: string | null;
  invoice_type: string | null;
  actual_due_date: string | null;
  original_due_date: string | null;
  status: string | null;
  currency: string | null;
}

interface RollingCashFlowGraphProps {
  invoices: Invoice[];
  startDate: Date;
  endDate: Date;
  beginningCashBalance: number;
}

const RollingCashFlowGraph = ({ invoices, startDate, endDate, beginningCashBalance }: RollingCashFlowGraphProps) => {
  const [visibleSeries, setVisibleSeries] = useState({
    receivables: true,
    payables: true,
    cumulativeNet: true,
  });

  // Get effective due date for an invoice
  const getEffectiveDueDate = (invoice: Invoice): Date | null => {
    const dateStr = invoice.actual_due_date || invoice.original_due_date;
    if (!dateStr) return null;
    return new Date(dateStr);
  };

  // Helper to check if invoice is a credit or debit note
  const isCreditDebitNote = (inv: Invoice): boolean => {
    const type = (inv.invoice_type || "").toLowerCase();
    return type === "credit note" || type === "debit note";
  };

  // Calculate daily data for the graph
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    let cumulativeNet = beginningCashBalance;

    return days.map((day) => {
      // Filter invoices for this day (excluding credit/debit notes, excluding paid)
      const dayInvoices = invoices.filter((inv) => {
        if (inv.status?.toLowerCase() === "paid") return false;
        if (isCreditDebitNote(inv)) return false;
        const dueDate = getEffectiveDueDate(inv);
        if (!dueDate) return false;
        return isSameDay(dueDate, day);
      });

      let receivables = 0;
      let payables = 0;

      dayInvoices.forEach((inv) => {
        const amount = inv.total_amount || 0;
        if (inv.invoice_direction === "receivable") {
          receivables += amount;
        } else if (inv.invoice_direction === "payable") {
          payables += amount;
        }
      });

      const netImpact = receivables - payables;
      cumulativeNet += netImpact;

      return {
        date: format(day, "yyyy-MM-dd"),
        displayDate: format(day, "MMM d"),
        receivables: receivables,
        payables: -payables, // Negative for display below x-axis
        payablesRaw: payables, // Keep positive for tooltip
        netImpact: netImpact,
        cumulativeNet: cumulativeNet,
      };
    });
  }, [invoices, startDate, endDate, beginningCashBalance]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3 space-y-1">
          <p className="font-medium text-foreground">{data?.displayDate}</p>
          <div className="space-y-1 text-sm">
            <p className="text-green-600">
              Receivables: {formatCurrency(data?.receivables || 0)}
            </p>
            <p className="text-red-600">
              Payables: {formatCurrency(data?.payablesRaw || 0)}
            </p>
            <p className="text-blue-600 font-medium">
              Net Impact: {formatCurrency(data?.netImpact || 0)}
            </p>
            <p className="text-foreground font-medium border-t border-border pt-1 mt-1">
              Cumulative: {formatCurrency(data?.cumulativeNet || 0)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleLegendClick = (dataKey: string) => {
    setVisibleSeries((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey as keyof typeof prev],
    }));
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex justify-center gap-6 mt-2">
        <button
          className={`flex items-center gap-2 text-sm cursor-pointer transition-opacity ${
            !visibleSeries.receivables ? "opacity-40" : ""
          }`}
          onClick={() => handleLegendClick("receivables")}
        >
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-muted-foreground">Receivables</span>
        </button>
        <button
          className={`flex items-center gap-2 text-sm cursor-pointer transition-opacity ${
            !visibleSeries.payables ? "opacity-40" : ""
          }`}
          onClick={() => handleLegendClick("payables")}
        >
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-muted-foreground">Payables</span>
        </button>
        <button
          className={`flex items-center gap-2 text-sm cursor-pointer transition-opacity ${
            !visibleSeries.cumulativeNet ? "opacity-40" : ""
          }`}
          onClick={() => handleLegendClick("cumulativeNet")}
        >
          <div className="w-4 h-0.5 bg-blue-600" />
          <span className="text-muted-foreground">Net Cash Impact</span>
        </button>
      </div>
    );
  };

  // Determine tick interval based on date range
  const dayCount = chartData.length;
  const tickInterval = dayCount <= 14 ? 0 : dayCount <= 30 ? 2 : dayCount <= 60 ? 6 : 13;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Rolling Cash Flow</CardTitle>
        <p className="text-sm text-muted-foreground">
          Daily receivables and payables with cumulative net cash position
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                interval={tickInterval}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickFormatter={(value) => {
                  if (Math.abs(value) >= 1000000) {
                    return `$${(value / 1000000).toFixed(1)}M`;
                  } else if (Math.abs(value) >= 1000) {
                    return `$${(value / 1000).toFixed(0)}K`;
                  }
                  return `$${value}`;
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickFormatter={(value) => {
                  if (Math.abs(value) >= 1000000) {
                    return `$${(value / 1000000).toFixed(1)}M`;
                  } else if (Math.abs(value) >= 1000) {
                    return `$${(value / 1000).toFixed(0)}K`;
                  }
                  return `$${value}`;
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              
              {visibleSeries.receivables && (
                <Bar
                  dataKey="receivables"
                  fill="#22c55e"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={30}
                />
              )}
              {visibleSeries.payables && (
                <Bar
                  dataKey="payables"
                  fill="#ef4444"
                  radius={[0, 0, 2, 2]}
                  maxBarSize={30}
                />
              )}
              {visibleSeries.cumulativeNet && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativeNet"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#2563eb" }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default RollingCashFlowGraph;
