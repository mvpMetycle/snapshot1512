import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Shield, AlertTriangle, CheckCircle, Activity } from "lucide-react";

type KPIData = {
  totalHedgeableMt: number;
  pricedMt: number;
  unpricedMt: number;
  coveragePct: number;
  openHedgeMt: number;
};

export function ExposureKPISection() {
  // Fetch hedgeable quantity from hedge_requests joined with tickets
  const { data: hedgeableData, isLoading: loadingHedgeable } = useQuery({
    queryKey: ["exposure-hedgeable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hedge_request")
        .select(`
          id,
          quantity_mt,
          ticket_id,
          ticket:ticket_id (
            id,
            pricing_type
          )
        `)
        .is("deleted_at", null);

      if (error) throw error;

      // Filter to hedgeable tickets (index/formula pricing)
      const hedgeable = (data || []).filter((hr: any) => {
        const pricingType = hr.ticket?.pricing_type?.toLowerCase();
        return pricingType === "index" || pricingType === "formula";
      });

      return {
        requests: hedgeable,
        totalMt: hedgeable.reduce((sum: number, hr: any) => sum + (hr.quantity_mt || 0), 0),
      };
    },
  });

  // Fetch hedge_executions with open_quantity_mt
  const { data: executionsData, isLoading: loadingExecs } = useQuery({
    queryKey: ["exposure-executions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hedge_execution")
        .select("id, quantity_mt, open_quantity_mt, status")
        .is("deleted_at", null);

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch hedge_links with related data for resolving to tickets
  const { data: linksData, isLoading: loadingLinks } = useQuery({
    queryKey: ["exposure-links"],
    queryFn: async () => {
      // Get all hedge_links
      const { data: links, error: linksError } = await supabase
        .from("hedge_link")
        .select("id, hedge_execution_id, link_level, link_id, side, allocated_quantity_mt");

      if (linksError) throw linksError;
      if (!links || links.length === 0) return { links: [], orders: [], blOrders: [], tickets: [] };

      // Get unique order IDs from Order-level links
      const orderIds = links
        .filter(l => l.link_level === "Order")
        .map(l => l.link_id);

      // Get unique bl_order IDs from Bl_order-level links
      const blOrderIds = links
        .filter(l => l.link_level === "Bl_order")
        .map(l => l.link_id);

      // Fetch orders
      let orders: any[] = [];
      if (orderIds.length > 0) {
        const { data, error } = await supabase
          .from("order")
          .select("id, buyer, seller")
          .in("id", orderIds);
        if (!error && data) orders = data;
      }

      // Fetch bl_orders
      let blOrders: any[] = [];
      if (blOrderIds.length > 0) {
        const { data, error } = await supabase
          .from("bl_order")
          .select("id, order_id")
          .in("id", blOrderIds.map(id => parseInt(id)));
        if (!error && data) blOrders = data;
      }

      // Get order IDs from bl_orders for secondary lookup
      const blOrderOrderIds = blOrders.map(bo => bo.order_id).filter(Boolean);
      let ordersFromBl: any[] = [];
      if (blOrderOrderIds.length > 0) {
        const { data, error } = await supabase
          .from("order")
          .select("id, buyer, seller")
          .in("id", blOrderOrderIds);
        if (!error && data) ordersFromBl = data;
      }

      // Get all potential ticket IDs to fetch
      const ticketIds = new Set<string>();
      
      // From direct Ticket links
      links
        .filter(l => l.link_level === "Ticket")
        .forEach(l => ticketIds.add(l.link_id));

      // From Order links (buyer/seller are ticket IDs stored as text)
      orders.forEach(o => {
        if (o.buyer) ticketIds.add(o.buyer);
        if (o.seller) ticketIds.add(o.seller);
      });

      // From Bl_order -> Order links
      ordersFromBl.forEach(o => {
        if (o.buyer) ticketIds.add(o.buyer);
        if (o.seller) ticketIds.add(o.seller);
      });

      // Fetch tickets
      let tickets: any[] = [];
      if (ticketIds.size > 0) {
        const { data, error } = await supabase
          .from("ticket")
          .select("id, pricing_type")
          .in("id", Array.from(ticketIds).map(id => parseInt(id)));
        if (!error && data) tickets = data;
      }

      return {
        links,
        orders: [...orders, ...ordersFromBl],
        blOrders,
        tickets,
      };
    },
  });

  // Compute KPIs
  const kpis = useMemo<KPIData>(() => {
    const totalHedgeableMt = hedgeableData?.totalMt || 0;

    if (!linksData || !executionsData) {
      return {
        totalHedgeableMt,
        pricedMt: 0,
        unpricedMt: totalHedgeableMt,
        coveragePct: 0,
        openHedgeMt: 0,
      };
    }

    const { links, orders, blOrders, tickets } = linksData;
    const ticketMap = new Map(tickets.map((t: any) => [t.id, t]));
    const orderMap = new Map(orders.map((o: any) => [o.id, o]));
    const blOrderMap = new Map(blOrders.map((bo: any) => [bo.id, bo]));
    const execMap = new Map(executionsData.map((e: any) => [e.id, e]));

    let pricedMt = 0;
    let openHedgeMt = 0;

    for (const link of links) {
      const exec = execMap.get(link.hedge_execution_id);
      if (!exec) continue;

      // Calculate closed_ratio
      const qtyMt = exec.quantity_mt || 0;
      const openQtyMt = exec.open_quantity_mt ?? qtyMt;
      const closedRatio = qtyMt > 0 ? (qtyMt - openQtyMt) / qtyMt : 0;

      // Resolve link to ticket
      let ticketId: number | null = null;

      if (link.link_level === "Ticket") {
        ticketId = parseInt(link.link_id);
      } else if (link.link_level === "Order") {
        const order = orderMap.get(link.link_id);
        if (order) {
          ticketId = link.side === "BUY" 
            ? (order.buyer ? parseInt(order.buyer) : null)
            : (order.seller ? parseInt(order.seller) : null);
        }
      } else if (link.link_level === "Bl_order") {
        const blOrder = blOrderMap.get(parseInt(link.link_id));
        if (blOrder?.order_id) {
          const order = orderMap.get(blOrder.order_id);
          if (order) {
            ticketId = link.side === "BUY"
              ? (order.buyer ? parseInt(order.buyer) : null)
              : (order.seller ? parseInt(order.seller) : null);
          }
        }
      }

      // Only include if ticket has index/formula pricing
      if (ticketId) {
        const ticket = ticketMap.get(ticketId);
        const pricingType = ticket?.pricing_type?.toLowerCase();
        if (pricingType === "index" || pricingType === "formula") {
          const allocatedQty = link.allocated_quantity_mt || 0;
          pricedMt += allocatedQty * closedRatio;
          openHedgeMt += allocatedQty * (1 - closedRatio);
        }
      }
    }

    const unpricedMt = Math.max(0, totalHedgeableMt - pricedMt);
    const coveragePct = totalHedgeableMt > 0 ? (pricedMt / totalHedgeableMt) * 100 : 0;

    return {
      totalHedgeableMt,
      pricedMt,
      unpricedMt,
      coveragePct,
      openHedgeMt,
    };
  }, [hedgeableData, linksData, executionsData]);

  const isLoading = loadingHedgeable || loadingExecs || loadingLinks;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getCoverageColor = (pct: number) => {
    if (pct >= 80) return "text-green-600";
    if (pct >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getCoverageVariant = (pct: number): "default" | "secondary" | "destructive" => {
    if (pct >= 80) return "default";
    if (pct >= 50) return "secondary";
    return "destructive";
  };

  return (
    <div className="space-y-6">
      {/* Coverage Progress Bar */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-semibold">Hedge Coverage</span>
              </div>
              <Badge variant={getCoverageVariant(kpis.coveragePct)} className="text-sm px-3 py-1">
                {kpis.coveragePct.toFixed(1)}% Covered
              </Badge>
            </div>
            <Progress 
              value={kpis.coveragePct} 
              className="h-4"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0 MT</span>
              <span>{kpis.totalHedgeableMt.toFixed(2)} MT Hedgeable</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Hedgeable */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Hedgeable</p>
                <p className="text-2xl font-bold mt-1">{kpis.totalHedgeableMt.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">MT</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Priced MT */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Priced (Fixed)</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{kpis.pricedMt.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">MT</p>
              </div>
              <div className="rounded-full bg-green-100 p-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unpriced MT */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Unpriced</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">{kpis.unpricedMt.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">MT</p>
              </div>
              <div className="rounded-full bg-amber-100 p-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Coverage % */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Coverage</p>
                <p className={`text-2xl font-bold mt-1 ${getCoverageColor(kpis.coveragePct)}`}>
                  {kpis.coveragePct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">of hedgeable</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2">
                <Shield className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Open Hedge MT */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Open Hedge</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">{kpis.openHedgeMt.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">MT</p>
              </div>
              <div className="rounded-full bg-blue-100 p-2">
                <Activity className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
