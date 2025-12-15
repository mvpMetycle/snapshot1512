/**
 * Derives the planned BL count when matching buy and sell tickets into an order.
 * Uses the minimum of both sides if both have values, otherwise uses the available value.
 */
export function derivePlannedBlCountFromTickets(
  buyPlannedShipments?: number | null,
  sellPlannedShipments?: number | null
): number {
  const buy = buyPlannedShipments ?? 0;
  const sell = sellPlannedShipments ?? 0;

  if (buy > 0 && sell > 0) {
    return Math.min(buy, sell);
  }
  if (buy > 0) {
    return buy;
  }
  if (sell > 0) {
    return sell;
  }
  return 0;
}

/**
 * Creates planned shipment row data for an order.
 * Each shipment gets an equal share of the total quantity.
 */
export function createPlannedShipmentRows(
  ticketId: number,
  plannedBlCount: number,
  allocatedQuantityMt: number
): Array<{
  order_id: number;
  shipment_number: number;
  quantity_at_shipment_level: number | null;
}> {
  if (plannedBlCount <= 0) {
    return [];
  }

  const perShipmentQty = allocatedQuantityMt / plannedBlCount;
  
  return Array.from({ length: plannedBlCount }, (_, i) => ({
    order_id: ticketId,
    shipment_number: i + 1,
    quantity_at_shipment_level: Math.round(perShipmentQty * 100) / 100, // Round to 2 decimals
  }));
}
