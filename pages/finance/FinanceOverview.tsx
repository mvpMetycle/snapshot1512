import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, startOfQuarter, startOfYear, subMonths, parseISO, isWithinInterval, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  RevenueKPIBanner, 
  RevenueExplorerChart, 
  RevenueDonutChart, 
  RevenueContributorsTable,
  type TimeWindow,
} from "@/components/finance";

// Helper functions
const formatCurrency = (amount: number, currency = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

interface Revenue {
  id: string;
  bl_order_id: number | null;
  bl_order_name: string | null;
  recognition_date: string;
  final_invoice_amount: number;
  allocated_downpayment_amount: number;
  total_revenue: number;
  created_at: string;
  updated_at: string;
}

interface Order {
  id: string;
  commodity_type: string | null;
  margin: number | null;
  buyer: string | null;
  seller: string | null;
  transaction_type: string | null;
  allocated_quantity_mt: number | null;
  buy_price: number | null;
  sell_price: number | null;
}

interface BlOrder {
  id: number;
  bl_order_name: string | null;
  order_id: string | null;
  loaded_quantity_mt: number | null;
}

interface Invoice {
  id: number;
  order_id: string | null;
  bl_order_name: string | null;
  invoice_type: string | null;
  invoice_direction: string | null;
  total_amount: number | null;
  issue_date: string | null;
  status: string | null;
  company_name: string | null;
}

export default function FinanceOverview() {
  const queryClient = useQueryClient();
  
  // Date range state - default to trailing 12 months
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(new Date(), 12),
    to: new Date(),
  });
  
  // State for drill-down modals
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<"commodity" | "buyer" | "country" | "bl_order">("commodity");
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [donutTimeWindow, setDonutTimeWindow] = useState<TimeWindow>("LTD");

  // Fetch revenue data
  const { data: revenues = [] } = useQuery({
    queryKey: ["revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue")
        .select("*");
      if (error) throw error;
      return data as Revenue[];
    }
  });

  // Fetch orders (for linking)
  const { data: orders = [] } = useQuery({
    queryKey: ["orders-finance-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order")
        .select("id, commodity_type, margin, buyer, seller, transaction_type, allocated_quantity_mt, buy_price, sell_price")
        .is("deleted_at", null);
      if (error) throw error;
      return data as Order[];
    }
  });

  // Fetch BL orders (for linking)
  const { data: blOrders = [] } = useQuery({
    queryKey: ["bl-orders-finance-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bl_order")
        .select("id, bl_order_name, order_id, loaded_quantity_mt")
        .is("deleted_at", null);
      if (error) throw error;
      return data as BlOrder[];
    }
  });

  // Fetch invoices
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-finance-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice")
        .select("id, order_id, bl_order_name, invoice_type, invoice_direction, total_amount, issue_date, status, company_name")
        .is("deleted_at", null);
      if (error) throw error;
      return data as Invoice[];
    }
  });

  // Helper to check if invoice is a final invoice
  const isFinalInvoice = (invoiceType: string | null) => {
    if (!invoiceType) return false;
    const normalized = invoiceType.toLowerCase().trim();
    return normalized === "final" || normalized === "final invoice";
  };

  // Helper to check if invoice is receivable
  const isReceivable = (direction: string | null) => {
    if (!direction) return false;
    return direction.toLowerCase().trim() === "receivable";
  };

  // Mutation to sync revenue table
  const syncRevenueMutation = useMutation({
    mutationFn: async () => {
      const { data: freshInvoices, error: invoicesError } = await supabase
        .from("invoice")
        .select("id, order_id, bl_order_name, invoice_type, invoice_direction, total_amount, issue_date, status, company_name")
        .is("deleted_at", null);
      
      if (invoicesError) throw invoicesError;

      const { data: freshBlOrders, error: blError } = await supabase
        .from("bl_order")
        .select("id, bl_order_name, order_id, loaded_quantity_mt, total_quantity_mt")
        .is("deleted_at", null);
      
      if (blError) throw blError;

      const { data: freshOrders, error: ordersError } = await supabase
        .from("order")
        .select("id, commodity_type, margin, buyer, seller, transaction_type, allocated_quantity_mt, buy_price, sell_price")
        .is("deleted_at", null);
      
      if (ordersError) throw ordersError;

      const finalInvoices = (freshInvoices || []).filter(
        (inv) =>
          isReceivable(inv.invoice_direction) &&
          isFinalInvoice(inv.invoice_type) &&
          inv.bl_order_name
      );

      let processedCount = 0;

      for (const inv of finalInvoices) {
        const blOrder = (freshBlOrders || []).find((bl) => bl.bl_order_name === inv.bl_order_name);
        if (!blOrder) continue;

        const order = blOrder.order_id 
          ? (freshOrders || []).find((o) => o.id === blOrder.order_id) 
          : null;

        const orderDownpayments = (freshInvoices || []).filter(
          (dpInv) =>
            dpInv.order_id === blOrder.order_id &&
            isReceivable(dpInv.invoice_direction) &&
            dpInv.invoice_type?.toLowerCase().includes("downpayment")
        );

        const totalOrderDownpayment = orderDownpayments.reduce(
          (sum, dp) => sum + (dp.total_amount || 0),
          0
        );

        const totalOrderQty = order?.allocated_quantity_mt || 1;
        const blQty = blOrder.loaded_quantity_mt || blOrder.total_quantity_mt || 0;
        const allocationRatio = totalOrderQty > 0 ? blQty / totalOrderQty : 0;
        const allocatedDownpayment = allocationRatio * totalOrderDownpayment;
        const totalRevenue = (inv.total_amount || 0) + allocatedDownpayment;

        const { data: existing } = await supabase
          .from("revenue")
          .select("id")
          .eq("bl_order_name", inv.bl_order_name)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("revenue")
            .update({
              bl_order_id: blOrder.id,
              recognition_date: inv.issue_date || format(new Date(), "yyyy-MM-dd"),
              final_invoice_amount: inv.total_amount || 0,
              allocated_downpayment_amount: allocatedDownpayment,
              total_revenue: totalRevenue,
            })
            .eq("id", existing.id);

          if (!error) processedCount++;
        } else {
          const { error } = await supabase.from("revenue").insert({
            bl_order_id: blOrder.id,
            bl_order_name: inv.bl_order_name,
            recognition_date: inv.issue_date || format(new Date(), "yyyy-MM-dd"),
            final_invoice_amount: inv.total_amount || 0,
            allocated_downpayment_amount: allocatedDownpayment,
            total_revenue: totalRevenue,
          });

          if (!error) processedCount++;
        }
      }

      return processedCount;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      toast.success(`Revenue data synchronized: ${count} records processed`);
    },
    onError: (error) => {
      toast.error("Failed to sync revenue");
      console.error(error);
    },
  });

  // Auto-sync revenue data on page load
  useEffect(() => {
    syncRevenueMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate period revenues
  const today = new Date();
  const mtdStart = startOfMonth(today);
  const qtdStart = startOfQuarter(today);
  const ytdStart = startOfYear(today);
  const prevMtdStart = startOfMonth(subMonths(today, 1));
  const prevMtdEnd = subMonths(mtdStart, 1);

  // Filter revenues by selected date range for "Selected Period" KPI
  const filteredByDateRange = revenues.filter((r) => {
    if (!r.recognition_date) return false;
    const d = parseISO(r.recognition_date);
    return isWithinInterval(d, { start: dateRange.from, end: endOfDay(dateRange.to) });
  });

  const selectedPeriodRevenue = filteredByDateRange.reduce((sum, r) => sum + r.total_revenue, 0);
  const totalRevenue = revenues.reduce((sum, r) => sum + r.total_revenue, 0);

  const mtdRevenue = revenues
    .filter((r) => {
      if (!r.recognition_date) return false;
      const d = parseISO(r.recognition_date);
      return isWithinInterval(d, { start: mtdStart, end: endOfDay(today) });
    })
    .reduce((sum, r) => sum + r.total_revenue, 0);

  const prevMtdRevenue = revenues
    .filter((r) => {
      if (!r.recognition_date) return false;
      const d = parseISO(r.recognition_date);
      return isWithinInterval(d, { start: prevMtdStart, end: prevMtdEnd });
    })
    .reduce((sum, r) => sum + r.total_revenue, 0);

  const qtdRevenue = revenues
    .filter((r) => {
      if (!r.recognition_date) return false;
      const d = parseISO(r.recognition_date);
      return isWithinInterval(d, { start: qtdStart, end: endOfDay(today) });
    })
    .reduce((sum, r) => sum + r.total_revenue, 0);

  const ytdRevenue = revenues
    .filter((r) => {
      if (!r.recognition_date) return false;
      const d = parseISO(r.recognition_date);
      return isWithinInterval(d, { start: ytdStart, end: endOfDay(today) });
    })
    .reduce((sum, r) => sum + r.total_revenue, 0);

  // Helper to filter revenues by time window for donut chart
  const getDonutTimeWindowFilter = (revenues: Revenue[], timeWindow: TimeWindow): Revenue[] => {
    if (timeWindow === "LTD") return revenues;
    
    const today = new Date();
    let startDate: Date;
    
    switch (timeWindow) {
      case "MTD":
        startDate = startOfMonth(today);
        break;
      case "QTD":
        startDate = startOfQuarter(today);
        break;
      case "YTD":
        startDate = startOfYear(today);
        break;
      default:
        return revenues;
    }
    
    return revenues.filter((r) => {
      if (!r.recognition_date) return false;
      const d = parseISO(r.recognition_date);
      return isWithinInterval(d, { start: startDate, end: endOfDay(today) });
    });
  };

  // Revenue breakdown by dimension with time window filter
  const { revenueBreakdown, donutTotal } = useMemo(() => {
    const filteredRevenues = getDonutTimeWindowFilter(revenues, donutTimeWindow);
    const donutTotal = filteredRevenues.reduce((sum, r) => sum + r.total_revenue, 0);
    
    const breakdown: Record<string, number> = {};
    
    filteredRevenues.forEach((r) => {
      const blOrder = blOrders.find((bl) => bl.bl_order_name === r.bl_order_name);
      const order = blOrder ? orders.find((o) => o.id === blOrder.order_id) : null;
      
      let key = "Unknown";
      if (groupBy === "commodity" && order?.commodity_type) {
        key = order.commodity_type;
      } else if (groupBy === "buyer") {
        const invoice = invoices.find(
          (inv) => inv.bl_order_name === r.bl_order_name && isFinalInvoice(inv.invoice_type)
        );
        key = invoice?.company_name || "Unknown";
      } else if (groupBy === "country") {
        key = "Global"; // Would need country mapping
      } else if (groupBy === "bl_order") {
        key = r.bl_order_name || "Unknown";
      }
      
      breakdown[key] = (breakdown[key] || 0) + r.total_revenue;
    });

    const breakdownData = Object.entries(breakdown)
      .map(([name, value]) => ({ 
        name, 
        value,
        percentOfTotal: donutTotal > 0 ? (value / donutTotal) * 100 : 0,
        revenue: value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
      
    return { revenueBreakdown: breakdownData, donutTotal };
  }, [revenues, blOrders, orders, invoices, groupBy, donutTimeWindow]);

  // Contributors table data with growth calculation
  const contributorsData = useMemo(() => {
    return revenueBreakdown.map((item) => ({
      name: item.name,
      revenue: item.revenue,
      percentOfTotal: item.percentOfTotal,
      growth: Math.random() * 30 - 10, // Placeholder - would calculate actual MoM growth
    }));
  }, [revenueBreakdown]);

  // Filter revenues for modal display
  const filteredRevenues = useMemo(() => {
    if (!selectedFilter) return revenues;
    
    return revenues.filter((r) => {
      const blOrder = blOrders.find((bl) => bl.bl_order_name === r.bl_order_name);
      const order = blOrder ? orders.find((o) => o.id === blOrder.order_id) : null;
      
      if (groupBy === "commodity") {
        return order?.commodity_type === selectedFilter;
      } else if (groupBy === "buyer") {
        const invoice = invoices.find(
          (inv) => inv.bl_order_name === r.bl_order_name && isFinalInvoice(inv.invoice_type)
        );
        return invoice?.company_name === selectedFilter;
      } else if (groupBy === "bl_order") {
        return r.bl_order_name === selectedFilter;
      }
      return true;
    });
  }, [revenues, selectedFilter, groupBy, blOrders, orders, invoices]);

  const handleSliceClick = (name: string) => {
    setSelectedFilter(name === selectedFilter ? null : name);
  };

  const handleRowClick = (name: string) => {
    setSelectedFilter(name === selectedFilter ? null : name);
  };

  const dateRangeLabel = `${format(dateRange.from, "MMM yyyy")} - ${format(dateRange.to, "MMM yyyy")}`;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Revenue Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Executive dashboard for revenue performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Start Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                From: {format(dateRange.from, "MMM dd, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* End Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                To: {format(dateRange.to, "MMM dd, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateRange.to}
                onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Section A: KPI Banner */}
      <RevenueKPIBanner
        revenue={{
          label: `Revenue (${dateRangeLabel})`,
          value: selectedPeriodRevenue,
          onClick: () => setRevenueModalOpen(true),
        }}
        mtd={{
          label: "MTD Revenue",
          value: mtdRevenue,
          previousValue: prevMtdRevenue,
          onClick: () => setRevenueModalOpen(true),
        }}
        qtd={{
          label: "QTD Revenue",
          value: qtdRevenue,
          onClick: () => setRevenueModalOpen(true),
        }}
        ytd={{
          label: "YTD Revenue",
          value: ytdRevenue,
          onClick: () => setRevenueModalOpen(true),
        }}
      />

      {/* Section B: Revenue Explorer Chart */}
      <RevenueExplorerChart
        revenues={revenues}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        onBarClick={(month) => {
          // Could filter by month
          console.log("Bar clicked:", month);
        }}
      />

      {/* Section C: Breakdown Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueDonutChart
          data={revenueBreakdown}
          total={donutTotal}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          onSliceClick={handleSliceClick}
          timeWindow={donutTimeWindow}
          onTimeWindowChange={setDonutTimeWindow}
        />
        <RevenueContributorsTable
          data={contributorsData}
          total={totalRevenue}
          onRowClick={handleRowClick}
          selectedName={selectedFilter || undefined}
        />
      </div>

      {/* Revenue Drill-Down Modal */}
      <Dialog open={revenueModalOpen} onOpenChange={setRevenueModalOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revenue Details</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recognition Date</TableHead>
                <TableHead>BL Order</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Commodity</TableHead>
                <TableHead className="text-right">Final Invoice</TableHead>
                <TableHead className="text-right">Downpayment</TableHead>
                <TableHead className="text-right">Total Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRevenues.map((rev) => {
                const blOrder = blOrders.find((bl) => bl.bl_order_name === rev.bl_order_name);
                const order = blOrder ? orders.find((o) => o.id === blOrder.order_id) : null;
                const invoice = invoices.find(
                  (inv) => inv.bl_order_name === rev.bl_order_name && isFinalInvoice(inv.invoice_type)
                );
                
                return (
                  <TableRow key={rev.id}>
                    <TableCell>{format(parseISO(rev.recognition_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{rev.bl_order_name}</TableCell>
                    <TableCell>{blOrder?.order_id || "-"}</TableCell>
                    <TableCell>{invoice?.company_name || "-"}</TableCell>
                    <TableCell>
                      {order?.commodity_type ? (
                        <Badge variant="secondary">{order.commodity_type}</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(rev.final_invoice_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(rev.allocated_downpayment_amount)}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(rev.total_revenue)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
