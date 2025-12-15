import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { derivePlannedBlCountFromTickets, createPlannedShipmentRows } from "@/utils/derivePlannedBlCount";

interface OptimizeMatchingProps {
  onBack: () => void;
  onClose: () => void;
}

export const OptimizeMatching = ({ onBack, onClose }: OptimizeMatchingProps) => {
  const [commodityType, setCommodityType] = useState("");
  const [quantity, setQuantity] = useState("");
  const queryClient = useQueryClient();

  const calculateTicketPrice = (ticket: any): number => {
    if (ticket.pricing_type === "Fixed") {
      return ticket.signed_price || 0;
    } else if (ticket.pricing_type === "Formula") {
      if (ticket.lme_price && ticket.payable_percent) {
        return ticket.lme_price * ticket.payable_percent;
      }
      return 0;
    } else if (ticket.pricing_type === "Index") {
      if (ticket.lme_price && ticket.premium_discount) {
        return ticket.lme_price + ticket.premium_discount;
      }
      return 0;
    }
    return 0;
  };

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any & { _buyTickets?: any[]; _sellTickets?: any[] }) => {
      const { _buyTickets, _sellTickets, ...insertData } = orderData;
      
      const { data, error } = await supabase.from("order").insert(insertData).select();
      if (error) throw error;
      
      // Create planned_shipment rows based on derived planned BL count
      if (_buyTickets && _buyTickets.length > 0 && data?.[0]) {
        // Sum planned shipments from all buy/sell tickets
        const totalPlannedBuy = _buyTickets.reduce((sum, t) => sum + (t.planned_shipments || 0), 0);
        const totalPlannedSell = (_sellTickets || []).reduce((sum, t) => sum + (t.planned_shipments || 0), 0);
        
        const plannedBlCount = derivePlannedBlCountFromTickets(totalPlannedBuy, totalPlannedSell);
        const allocatedQty = insertData.allocated_quantity_mt || 0;
        const primaryBuyTicketId = _buyTickets[0].id;
        
        const shipmentRows = createPlannedShipmentRows(primaryBuyTicketId, plannedBlCount, allocatedQty);
        
        if (shipmentRows.length > 0) {
          const { error: shipmentError } = await supabase
            .from("planned_shipment")
            .insert(shipmentRows);
          if (shipmentError) {
            console.error("Failed to create planned shipments:", shipmentError);
          }
        }
        
        // Insert into inventory_match to track matched tickets
        if (_sellTickets && _sellTickets.length > 0 && data[0]?.id) {
          const matchRecords = [];
          for (const buyTicket of _buyTickets) {
            for (const sellTicket of _sellTickets) {
              matchRecords.push({
                buy_ticket_id: buyTicket.id,
                sell_ticket_id: sellTicket.id,
                order_id: data[0].id,
                allocated_quantity_mt: Math.min(buyTicket.allocQty || 0, sellTicket.allocQty || 0),
                match_date: new Date().toISOString(),
              });
            }
          }
          if (matchRecords.length > 0) {
            const { error: matchError } = await supabase
              .from("inventory_match")
              .insert(matchRecords);
            if (matchError) {
              console.error("Failed to create inventory match records:", matchError);
            }
          }
        }
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["matched-ticket-ids"] });
      toast.success("Optimized orders created successfully");
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to create orders: ${error.message}`);
    },
  });

  const handleOptimize = async () => {
    if (!commodityType || !quantity) {
      toast.error("Please fill in commodity type and quantity");
      return;
    }

    const targetQty = parseFloat(quantity);

    // Fetch already matched ticket IDs to exclude them
    const { data: matchedData, error: matchedError } = await supabase
      .from("inventory_match")
      .select("buy_ticket_id, sell_ticket_id");

    if (matchedError) {
      toast.error("Failed to fetch matched tickets");
      return;
    }

    const matchedBuyIds = new Set<number>();
    const matchedSellIds = new Set<number>();
    matchedData?.forEach(match => {
      if (match.buy_ticket_id) matchedBuyIds.add(match.buy_ticket_id);
      if (match.sell_ticket_id) matchedSellIds.add(match.sell_ticket_id);
    });

    // Fetch approved tickets matching criteria
    const [buyResult, sellResult] = await Promise.all([
      supabase
        .from("ticket")
        .select("*")
        .eq("type", "Buy")
        .eq("status", "Approved")
        .eq("commodity_type", commodityType as any),
      supabase
        .from("ticket")
        .select("*")
        .eq("type", "Sell")
        .eq("status", "Approved")
        .eq("commodity_type", commodityType as any),
    ]);

    if (buyResult.error || sellResult.error) {
      toast.error("Failed to fetch tickets");
      return;
    }

    // Filter out already matched tickets
    const buyTickets = (buyResult.data || []).filter(t => !matchedBuyIds.has(t.id));
    const sellTickets = (sellResult.data || []).filter(t => !matchedSellIds.has(t.id));

    if (buyTickets.length === 0 || sellTickets.length === 0) {
      toast.error("No available unmatched tickets found with the specified criteria");
      return;
    }

    // Sort tickets by calculated price
    const sortedBuyTickets = buyTickets
      .map(t => ({ ...t, calculatedPrice: calculateTicketPrice(t) }))
      .sort((a, b) => a.calculatedPrice - b.calculatedPrice); // Lowest price first
    
    const sortedSellTickets = sellTickets
      .map(t => ({ ...t, calculatedPrice: calculateTicketPrice(t) }))
      .sort((a, b) => b.calculatedPrice - a.calculatedPrice); // Highest price first

    // Optimize: maximize margin
    let remainingQty = targetQty;
    const selectedBuys: any[] = [];
    const selectedSells: any[] = [];

    // Select best sell tickets (highest price first)
    for (const sellTicket of sortedSellTickets) {
      if (remainingQty <= 0) break;
      const allocQty = Math.min(remainingQty, sellTicket.quantity || 0);
      selectedSells.push({ ...sellTicket, allocQty });
      remainingQty -= allocQty;
    }

    if (remainingQty > 0) {
      toast.error(`Not enough sell tickets to match ${targetQty} MT`);
      return;
    }

    // Select best buy tickets (lowest price first)
    remainingQty = targetQty;
    for (const buyTicket of sortedBuyTickets) {
      if (remainingQty <= 0) break;
      const allocQty = Math.min(remainingQty, buyTicket.quantity || 0);
      selectedBuys.push({ ...buyTicket, allocQty });
      remainingQty -= allocQty;
    }

    if (remainingQty > 0) {
      toast.error(`Not enough buy tickets to match ${targetQty} MT`);
      return;
    }

    // Calculate average prices using proper pricing logic
    const avgBuyPrice =
      selectedBuys.reduce((sum, t) => sum + calculateTicketPrice(t) * t.allocQty, 0) / targetQty;
    const avgSellPrice =
      selectedSells.reduce((sum, t) => sum + calculateTicketPrice(t) * t.allocQty, 0) / targetQty;

    if (avgBuyPrice >= avgSellPrice) {
      toast.error("Cannot create order: Buy price exceeds sell price");
      return;
    }

    // Generate order ID
    const orderId = String(Math.floor(10000 + Math.random() * 90000));

    const buyIncoterms = selectedBuys[0]?.incoterms || "—";
    const sellIncoterms = selectedSells[0]?.incoterms || "—";

    const orderData = {
      id: orderId,
      buyer: selectedBuys.map((t) => t.id).join(","),
      seller: selectedSells.map((t) => t.id).join(","),
      commodity_type: commodityType,
      metal_form: selectedBuys[0]?.metal_form,
      isri_grade: selectedBuys[0]?.isri_grade,
      allocated_quantity_mt: targetQty,
      buy_price: avgBuyPrice,
      sell_price: avgSellPrice,
      margin: (avgSellPrice - avgBuyPrice) / avgBuyPrice,
      status: "Allocated",
      transaction_type: "B2B",
      ship_to: selectedSells[0]?.ship_to,
      ship_from: selectedBuys[0]?.ship_from,
      product_details: `${buyIncoterms} / ${sellIncoterms}`,
      created_at: new Date().toISOString(),
      // Pass ticket data for planned shipment creation
      _buyTickets: selectedBuys,
      _sellTickets: selectedSells,
    };

    createOrderMutation.mutate(orderData);
  };

  const commodityOptions = [
    { value: "Aluminium", label: "Aluminium" },
    { value: "Mixed metals", label: "Mixed metals" },
    { value: "Zinc", label: "Zinc" },
    { value: "Magnesium", label: "Magnesium" },
    { value: "Lead", label: "Lead" },
    { value: "Nickel/stainless/hi-temp", label: "Nickel/stainless/hi-temp" },
    { value: "Copper", label: "Copper" },
    { value: "Brass", label: "Brass" },
    { value: "Steel", label: "Steel" },
    { value: "Iron", label: "Iron" },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <div className="space-y-4">
        <p className="text-muted-foreground">
          Enter your requirements and the system will automatically find and match the best
          tickets to maximize margin.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Commodity Type *</Label>
            <SearchableSelect
              value={commodityType}
              onValueChange={setCommodityType}
              options={commodityOptions}
              placeholder="Select commodity"
              searchPlaceholder="Search commodities..."
            />
          </div>

          <div className="space-y-2">
            <Label>Quantity (MT) *</Label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button onClick={handleOptimize}>
            Optimize & Create Orders
          </Button>
        </div>
      </div>
    </div>
  );
};
