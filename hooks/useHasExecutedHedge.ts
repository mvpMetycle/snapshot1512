import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Check if there's an executed hedge linked to an order via hedge_link + hedge_execution
 * where hedge_execution.status = 'EXECUTED'
 * 
 * Checks both:
 * - Direct ORDER level links
 * - BL_ORDER level links for BLs belonging to this order
 */
export function useHasExecutedHedgeForOrder(orderId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["has-executed-hedge-order", orderId],
    queryFn: async () => {
      if (!orderId) return false;
      
      // First check direct ORDER level links
      const { data: orderLinks, error: orderLinkError } = await supabase
        .from("hedge_link")
        .select("id, hedge_execution_id")
        .eq("link_id", orderId)
        .eq("link_level", "Order");
      
      if (orderLinkError) throw orderLinkError;
      
      // Check if any direct order link has EXECUTED status
      if (orderLinks && orderLinks.length > 0) {
        const executionIds = orderLinks.map(l => l.hedge_execution_id);
        const { data: executions, error: execError } = await supabase
          .from("hedge_execution")
          .select("id")
          .in("id", executionIds)
          .eq("status", "EXECUTED")
          .is("deleted_at", null)
          .limit(1);
        
        if (execError) throw execError;
        if (executions && executions.length > 0) return true;
      }
      
      // Also check BL_ORDER level links for BLs belonging to this order
      const { data: blOrders, error: blError } = await supabase
        .from("bl_order")
        .select("id")
        .eq("order_id", orderId)
        .is("deleted_at", null);
      
      if (blError) throw blError;
      if (!blOrders || blOrders.length === 0) return false;
      
      const blOrderIds = blOrders.map(bl => bl.id.toString());
      
      const { data: blLinks, error: blLinkError } = await supabase
        .from("hedge_link")
        .select("id, hedge_execution_id")
        .in("link_id", blOrderIds)
        .eq("link_level", "Bl_order");
      
      if (blLinkError) throw blLinkError;
      if (!blLinks || blLinks.length === 0) return false;
      
      const blExecutionIds = blLinks.map(l => l.hedge_execution_id);
      const { data: blExecutions, error: blExecError } = await supabase
        .from("hedge_execution")
        .select("id")
        .in("id", blExecutionIds)
        .eq("status", "EXECUTED")
        .is("deleted_at", null)
        .limit(1);
      
      if (blExecError) throw blExecError;
      return !!blExecutions && blExecutions.length > 0;
    },
    enabled: !!orderId,
  });

  return {
    hasExecutedHedge: data ?? false,
    isLoading,
  };
}

/**
 * Check if there's an executed hedge linked to a BL order
 * via hedge_link + hedge_execution where status = 'EXECUTED'
 */
export function useHasExecutedHedgeForBL(blOrderId: number | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["has-executed-hedge-bl", blOrderId],
    queryFn: async () => {
      if (!blOrderId) return false;
      
      const blOrderIdStr = blOrderId.toString();
      
      // Get hedge_link entries for this BL
      const { data: links, error: linkError } = await supabase
        .from("hedge_link")
        .select("id, hedge_execution_id")
        .eq("link_id", blOrderIdStr)
        .eq("link_level", "Bl_order");
      
      if (linkError) throw linkError;
      if (!links || links.length === 0) return false;
      
      // Check if any linked execution has EXECUTED status
      const executionIds = links.map(l => l.hedge_execution_id);
      const { data: executions, error: execError } = await supabase
        .from("hedge_execution")
        .select("id")
        .in("id", executionIds)
        .eq("status", "EXECUTED")
        .is("deleted_at", null)
        .limit(1);
      
      if (execError) throw execError;
      return !!executions && executions.length > 0;
    },
    enabled: !!blOrderId,
  });

  return {
    hasExecutedHedge: data ?? false,
    isLoading,
  };
}
