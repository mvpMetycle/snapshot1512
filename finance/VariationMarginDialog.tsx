import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface VariationMargin {
  id: string;
  as_of_date: string;
  amount: number;
  currency: string;
  notes: string | null;
  created_at: string;
}

interface VariationMarginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asOfDate: string;
}

export function VariationMarginDialog({ open, onOpenChange, asOfDate }: VariationMarginDialogProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    as_of_date: new Date(),
    amount: "",
    currency: "USD",
    notes: "",
  });

  const { data: margins = [], isLoading } = useQuery({
    queryKey: ['variation-margins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variation_margin')
        .select('*')
        .order('as_of_date', { ascending: false });
      
      if (error) throw error;
      return data as VariationMargin[];
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { as_of_date: string; amount: number; currency: string; notes: string }) => {
      const { error } = await supabase
        .from('variation_margin')
        .insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variation-margin'] });
      queryClient.invalidateQueries({ queryKey: ['variation-margins'] });
      toast.success("Variation margin added");
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to add variation margin: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { as_of_date: string; amount: number; currency: string; notes: string } }) => {
      const { error } = await supabase
        .from('variation_margin')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variation-margin'] });
      queryClient.invalidateQueries({ queryKey: ['variation-margins'] });
      toast.success("Variation margin updated");
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to update variation margin: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('variation_margin')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variation-margin'] });
      queryClient.invalidateQueries({ queryKey: ['variation-margins'] });
      toast.success("Variation margin deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete variation margin: " + error.message);
    },
  });

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      as_of_date: new Date(),
      amount: "",
      currency: "USD",
      notes: "",
    });
  };

  const handleSubmit = () => {
    const data = {
      as_of_date: format(formData.as_of_date, "yyyy-MM-dd"),
      amount: parseFloat(formData.amount) || 0,
      currency: formData.currency,
      notes: formData.notes,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (margin: VariationMargin) => {
    setEditingId(margin.id);
    setIsAdding(true);
    setFormData({
      as_of_date: new Date(margin.as_of_date),
      amount: margin.amount.toString(),
      currency: margin.currency || "USD",
      notes: margin.notes || "",
    });
  };

  const formatCurrency = (amount: number, currency?: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Variation Margin</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add/Edit Form */}
          {isAdding ? (
            <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
              <h4 className="font-medium">{editingId ? "Edit Entry" : "Add New Entry"}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>As of Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(formData.as_of_date, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.as_of_date}
                        onSelect={(date) => date && setFormData(prev => ({ ...prev, as_of_date: date }))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    placeholder="USD"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional notes"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSubmit}>
                  {editingId ? "Update" : "Add"}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsAdding(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Variation Margin Entry
            </Button>
          )}

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>As of Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : margins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No variation margin entries yet
                    </TableCell>
                  </TableRow>
                ) : (
                  margins.map((margin) => (
                    <TableRow key={margin.id}>
                      <TableCell>{format(new Date(margin.as_of_date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(margin.amount, margin.currency)}
                      </TableCell>
                      <TableCell>{margin.currency || "USD"}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{margin.notes || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(margin)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => deleteMutation.mutate(margin.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
