import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ExternalLink, RefreshCw, FileText, Link2, Activity } from "lucide-react";
import { Link } from "react-router-dom";

type TimeLens = "pricing_month" | "delivery_month" | "hedge_prompt_month";

export function ExposureDrilldownTables() {
  const [timeLens, setTimeLens] = useState<TimeLens>("pricing_month");

  // Fetch unpriced hedge_requests (those without linked executed hedges or with open executions)
  const { data: unpricedRequests, isLoading: loadingRequests, refetch: refetchRequests } = useQuery({
    queryKey: ["exposure-unpriced-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hedge_request")
        .select(`
          id,
          quantity_mt,
          direction,
          metal,
          hedge_metal,
          status,
          estimated_qp_month,
          pricing_type,
          reason,
          notes,
          created_at,
          ticket:ticket_id (
            id,
            client_name,
            pricing_type
          )
        `)
        .is("deleted_at", null)
        .in("status", ["Draft", "Pending Approval", "Approved"]);

      if (error) throw error;

      // Filter to hedgeable tickets
      return (data || []).filter((hr: any) => {
        const pricingType = hr.ticket?.pricing_type?.toLowerCase();
        return pricingType === "index" || pricingType === "formula";
      });
    },
  });

  // Fetch hedge_executions
  const { data: executions, isLoading: loadingExecs, refetch: refetchExecs } = useQuery({
    queryKey: ["exposure-executions-detail"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hedge_execution")
        .select("*")
        .is("deleted_at", null)
        .order("execution_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch hedge_links with execution data
  const { data: hedgeLinks, isLoading: loadingLinks, refetch: refetchLinks } = useQuery({
    queryKey: ["exposure-links-detail"],
    queryFn: async () => {
      const { data: links, error: linksError } = await supabase
        .from("hedge_link")
        .select("*")
        .order("created_at", { ascending: false });

      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      // Get executions
      const execIds = [...new Set(links.map(l => l.hedge_execution_id))];
      const { data: execs, error: execsError } = await supabase
        .from("hedge_execution")
        .select("id, metal, direction, status, quantity_mt, open_quantity_mt, expiry_date, executed_price")
        .in("id", execIds);

      if (execsError) throw execsError;

      const execMap = new Map((execs || []).map(e => [e.id, e]));

      return links.map(link => ({
        ...link,
        execution: execMap.get(link.hedge_execution_id),
      }));
    },
  });

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM yyyy");
    } catch {
      return "—";
    }
  };

  const formatFullDate = (date: string | null | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "dd MMM yyyy");
    } catch {
      return "—";
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Draft": "outline",
      "Pending Approval": "secondary",
      "Approved": "default",
      "Rejected": "destructive",
      "Executed": "default",
      "OPEN": "secondary",
      "PARTIALLY_CLOSED": "outline",
      "CLOSED": "default",
    };
    return (
      <Badge variant={variants[status] || "outline"} className={status === "OPEN" ? "bg-blue-100 text-blue-800" : ""}>
        {status}
      </Badge>
    );
  };

  const getDirectionBadge = (direction: string | null) => {
    if (!direction) return null;
    const isBuy = direction.toLowerCase() === "buy" || direction === "Long";
    return (
      <Badge variant={isBuy ? "default" : "secondary"}>
        {direction}
      </Badge>
    );
  };

  const isLoading = loadingRequests || loadingExecs || loadingLinks;

  const handleRefreshAll = () => {
    refetchRequests();
    refetchExecs();
    refetchLinks();
  };

  return (
    <div className="space-y-6">
      {/* Time Lens Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Time Lens</CardTitle>
            <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={timeLens === "pricing_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeLens("pricing_month")}
            >
              Pricing Month
            </Button>
            <Button
              variant={timeLens === "delivery_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeLens("delivery_month")}
            >
              Delivery Month
            </Button>
            <Button
              variant={timeLens === "hedge_prompt_month" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeLens("hedge_prompt_month")}
            >
              Hedge Prompt Month
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {timeLens === "pricing_month" && "Group by hedge_request.estimated_qp_month"}
            {timeLens === "delivery_month" && "Group by bl_order.eta"}
            {timeLens === "hedge_prompt_month" && "Group by hedge_execution.expiry_date"}
          </p>
        </CardContent>
      </Card>

      {/* Drill-down Tabs */}
      <Tabs defaultValue="unpriced" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="unpriced" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Unpriced Requests ({unpricedRequests?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="executions" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Executions ({executions?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="links" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Links ({hedgeLinks?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Unpriced Requests Table */}
        <TabsContent value="unpriced" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Unpriced Hedge Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Metal</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Qty (MT)</TableHead>
                      <TableHead>Est. QP Month</TableHead>
                      <TableHead>Pricing Type</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unpricedRequests?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No unpriced hedge requests found
                        </TableCell>
                      </TableRow>
                    ) : (
                      unpricedRequests?.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono text-sm">
                            {req.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell>{req.ticket?.client_name || "—"}</TableCell>
                          <TableCell>{req.hedge_metal || req.metal || "—"}</TableCell>
                          <TableCell>{getDirectionBadge(req.direction)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {req.quantity_mt?.toFixed(2) || "—"}
                          </TableCell>
                          <TableCell>{formatDate(req.estimated_qp_month)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{req.pricing_type || "—"}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {req.reason || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Executions Table */}
        <TabsContent value="executions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Hedge Executions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Execution ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Metal</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Open Qty</TableHead>
                      <TableHead className="text-right">Closed %</TableHead>
                      <TableHead>Exec Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Broker</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No hedge executions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      executions?.map((exec: any) => {
                        const qtyMt = exec.quantity_mt || 0;
                        const openQty = exec.open_quantity_mt ?? qtyMt;
                        const closedPct = qtyMt > 0 ? ((qtyMt - openQty) / qtyMt) * 100 : 0;

                        return (
                          <TableRow key={exec.id}>
                            <TableCell className="font-mono text-sm">
                              {exec.id.slice(0, 8)}
                            </TableCell>
                            <TableCell>{getStatusBadge(exec.status)}</TableCell>
                            <TableCell>{exec.metal || "—"}</TableCell>
                            <TableCell>{getDirectionBadge(exec.direction)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {qtyMt.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {openQty.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge 
                                variant={closedPct >= 100 ? "default" : closedPct > 0 ? "secondary" : "outline"}
                                className={closedPct >= 100 ? "bg-green-600" : ""}
                              >
                                {closedPct.toFixed(0)}%
                              </Badge>
                            </TableCell>
                            <TableCell>{formatFullDate(exec.execution_date)}</TableCell>
                            <TableCell>{formatFullDate(exec.expiry_date)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {exec.broker_name || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Links Table */}
        <TabsContent value="links" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Hedge Links</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Link ID</TableHead>
                      <TableHead>Link Level</TableHead>
                      <TableHead>Physical Link</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Metal</TableHead>
                      <TableHead className="text-right">Allocated Qty</TableHead>
                      <TableHead>Exec Status</TableHead>
                      <TableHead className="text-right">Exec Price</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hedgeLinks?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No hedge links found
                        </TableCell>
                      </TableRow>
                    ) : (
                      hedgeLinks?.map((link: any) => (
                        <TableRow key={link.id}>
                          <TableCell className="font-mono text-sm">
                            {link.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{link.link_level}</Badge>
                          </TableCell>
                          <TableCell>
                            {link.link_level === "Order" ? (
                              <Link 
                                to={`/inventory/${link.link_id}`}
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                {link.link_id.slice(0, 8)}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : link.link_level === "Bl_order" ? (
                              <Link 
                                to={`/bl-orders/${link.link_id}`}
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                BL {link.link_id}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span>{link.link_id}</span>
                            )}
                          </TableCell>
                          <TableCell>{getDirectionBadge(link.side)}</TableCell>
                          <TableCell>{link.metal || link.execution?.metal || "—"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {link.allocated_quantity_mt?.toFixed(2) || "—"}
                          </TableCell>
                          <TableCell>{getStatusBadge(link.execution?.status)}</TableCell>
                          <TableCell className="text-right">
                            {link.execution?.executed_price 
                              ? `$${link.execution.executed_price.toLocaleString()}`
                              : "—"
                            }
                          </TableCell>
                          <TableCell>{formatFullDate(link.execution?.expiry_date)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
