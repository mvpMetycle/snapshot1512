import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, Loader2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { PriceFixRequestDialog } from "./PriceFixRequestDialog";
import type { Database } from "@/integrations/supabase/types";

type HedgeExecution = Database["public"]["Tables"]["hedge_execution"]["Row"];
type HedgeLink = Database["public"]["Tables"]["hedge_link"]["Row"];
type HedgeRequest = Database["public"]["Tables"]["hedge_request"]["Row"];

interface EnrichedHedge extends HedgeExecution {
  allocatedQty: number;
  linkCount: number;
  allocationType?: string;
  hedgeRequest?: HedgeRequest | null;
}

interface HedgingSummarySectionProps {
  orderId: string;
}

export function HedgingSummarySection({ orderId }: HedgingSummarySectionProps) {
  const [priceFixDialogOpen, setPriceFixDialogOpen] = useState(false);
  const [selectedHedge, setSelectedHedge] = useState<HedgeExecution | null>(null);

  // Fetch BL orders for this order
  const { data: blOrders } = useQuery({
    queryKey: ["bl-orders-for-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bl_order")
        .select("id")
        .eq("order_id", orderId)
        .is("deleted_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orderId,
  });

  // Fetch all hedge_link entries for order + all its BLs
  const { data: hedgeLinks, isLoading: linksLoading } = useQuery({
    queryKey: ["hedge-links-for-order", orderId, blOrders?.map(b => b.id)],
    queryFn: async () => {
      // Build link_id conditions: order_id OR any bl_order_id
      const linkIds = [orderId];
      const blIds = blOrders?.map(b => b.id.toString()) || [];
      linkIds.push(...blIds);

      const { data, error } = await supabase
        .from("hedge_link")
        .select("*")
        .in("link_id", linkIds);

      if (error) throw error;
      return data || [];
    },
    enabled: !!orderId && blOrders !== undefined,
  });

  // Fetch all linked hedge executions with their hedge_request data
  const { data: enrichedHedges, isLoading: hedgesLoading } = useQuery({
    queryKey: ["linked-hedges-enriched", orderId, hedgeLinks?.map(l => l.hedge_execution_id)],
    queryFn: async () => {
      if (!hedgeLinks || hedgeLinks.length === 0) return [];

      const executionIds = [...new Set(hedgeLinks.map(l => l.hedge_execution_id))];
      const { data: executions, error } = await supabase
        .from("hedge_execution")
        .select("*, hedge_request:hedge_request_id(*)")
        .in("id", executionIds)
        .is("deleted_at", null);

      if (error) throw error;
      
      // Aggregate: sum allocated_quantity_mt and count links per execution
      const enriched: EnrichedHedge[] = [];
      for (const exec of executions || []) {
        const linksForExec = hedgeLinks.filter(l => l.hedge_execution_id === exec.id);
        const totalAllocatedQty = linksForExec.reduce((sum, l) => sum + l.allocated_quantity_mt, 0);
        const allocationType = linksForExec[0]?.allocation_type || undefined;
        
        enriched.push({
          ...exec,
          allocatedQty: totalAllocatedQty,
          linkCount: linksForExec.length,
          allocationType,
          hedgeRequest: exec.hedge_request as HedgeRequest | null,
        });
      }
      
      return enriched;
    },
    enabled: !!hedgeLinks && hedgeLinks.length > 0,
  });

  const isLoading = linksLoading || hedgesLoading;

  // Calculate net exposure from hedge_link entries
  const netExposure = useMemo(() => {
    if (!hedgeLinks || hedgeLinks.length === 0) return { value: 0, label: "Flat" };
    
    const net = hedgeLinks.reduce((sum, link) => {
      const qty = link.allocated_quantity_mt;
      return sum + (link.direction === "Buy" ? qty : -qty);
    }, 0);

    if (Math.abs(net) < 0.01) return { value: 0, label: "Flat" };
    if (net > 0) return { value: net, label: `Long ${net.toFixed(2)} MT` };
    return { value: net, label: `Short ${Math.abs(net).toFixed(2)} MT` };
  }, [hedgeLinks]);

  const hasLinkedHedges = enrichedHedges && enrichedHedges.length > 0;

  const handlePriceFixClick = (hedge: HedgeExecution) => {
    setSelectedHedge(hedge);
    setPriceFixDialogOpen(true);
  };

  const getAllocationTypeLabel = (type?: string) => {
    if (!type) return null;
    switch (type) {
      case "INITIAL_HEDGE": return "Initial";
      case "PRICE_FIX": return "Price Fix";
      case "ROLL": return "Roll";
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-primary" />
            Hedging Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasLinkedHedges) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-primary" />
            Hedging Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No hedge executions linked to this order or its BLs. 
            Price fixing will be available once a hedge is executed and linked.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Hedging Summary
            </CardTitle>
            <Badge 
              variant={netExposure.value === 0 ? "secondary" : netExposure.value > 0 ? "default" : "outline"}
              className="text-sm"
            >
              Net: {netExposure.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direction</TableHead>
                  <TableHead>Metal</TableHead>
                  <TableHead>Qty (MT)</TableHead>
                  <TableHead>Trade Price</TableHead>
                  <TableHead>Trade Date</TableHead>
                  <TableHead>Maturity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedHedges.map((hedge) => {
                  const openQty = hedge.open_quantity_mt ?? hedge.quantity_mt;
                  const canPriceFix = hedge.allocationType !== "PRICE_FIX" && openQty > 0 && hedge.status !== "CLOSED";
                  const typeLabel = getAllocationTypeLabel(hedge.allocationType);
                  
                  return (
                    <TableRow key={hedge.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={hedge.direction === "Buy" ? "default" : "secondary"}>
                            {hedge.direction}
                          </Badge>
                          {typeLabel && (
                            <Badge variant="outline" className="text-xs">
                              {typeLabel}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{hedge.hedgeRequest?.hedge_metal || hedge.metal}</TableCell>
                      <TableCell>{hedge.allocatedQty.toFixed(2)}</TableCell>
                      <TableCell>
                        {hedge.executed_price.toLocaleString()} {hedge.executed_price_currency || "USD"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(hedge.execution_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {hedge.expiry_date ? format(new Date(hedge.expiry_date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {hedge.status || "OPEN"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{hedge.linkCount}</TableCell>
                      <TableCell>
                        {canPriceFix && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handlePriceFixClick(hedge)}>
                                Price Fix
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PriceFixRequestDialog
        open={priceFixDialogOpen}
        onOpenChange={setPriceFixDialogOpen}
        hedgeExecution={selectedHedge}
        orderId={orderId}
      />
    </>
  );
}
