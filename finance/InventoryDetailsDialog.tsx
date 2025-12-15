import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface OrderInfo {
  id: string;
  commodity_type: string | null;
  seller_company_name: string | null;
  buyer_company_name: string | null;
}

interface InventoryOrder {
  orderId: string;
  transactionVolume: number;
  order: OrderInfo | null;
}

interface InventoryDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventoryOrders: InventoryOrder[];
  orders?: OrderInfo[];
}

export function InventoryDetailsDialog({ open, onOpenChange, inventoryOrders, orders = [] }: InventoryDetailsDialogProps) {
  const navigate = useNavigate();

  const formatCurrency = (amount: number | null, currency?: string | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  const handleOrderClick = (orderId: string) => {
    onOpenChange(false);
    navigate(`/inventory/${orderId}`, { state: { from: 'cash-availability' } });
  };

  const totalAmount = inventoryOrders.reduce((sum, item) => sum + (item.transactionVolume || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inventory Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Orders with paid payable invoices but no paid receivable invoices. Amount shown is the Sell Side Transaction Volume.
          </p>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Supplier (Seller)</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead className="text-right">Transaction Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No inventory orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  inventoryOrders.map((item) => {
                    const orderInfo = item.order;
                    return (
                      <TableRow key={item.orderId}>
                        <TableCell>
                          <button
                            onClick={() => handleOrderClick(item.orderId)}
                            className="text-primary hover:underline font-medium"
                          >
                            {item.orderId}
                          </button>
                        </TableCell>
                        <TableCell>{orderInfo?.seller_company_name || "-"}</TableCell>
                        <TableCell>{orderInfo?.buyer_company_name || "-"}</TableCell>
                        <TableCell>{orderInfo?.commodity_type || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.transactionVolume)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="bg-muted/50 px-4 py-2 rounded-lg">
              <span className="text-sm text-muted-foreground mr-2">Total Inventory:</span>
              <span className="text-lg font-bold">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}