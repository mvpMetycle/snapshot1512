import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Contributor {
  name: string;
  revenue: number;
  percentOfTotal: number;
  growth?: number; // MoM or QoQ percentage
}

interface RevenueContributorsTableProps {
  data: Contributor[];
  total: number;
  onRowClick?: (name: string) => void;
  selectedName?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

type SortField = "name" | "revenue" | "percentOfTotal" | "growth";
type SortDirection = "asc" | "desc";

export function RevenueContributorsTable({
  data,
  total,
  onRowClick,
  selectedName,
}: RevenueContributorsTableProps) {
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }
    
    return sortDirection === "asc" 
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1 text-xs">
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  return (
    <Card className="border-0 shadow-sm h-[340px] flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-lg font-semibold">Top Contributors</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead 
                className="cursor-pointer hover:text-foreground transition-colors text-xs font-medium"
                onClick={() => handleSort("name")}
              >
                Name <SortIndicator field="name" />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground transition-colors text-xs font-medium text-right"
                onClick={() => handleSort("revenue")}
              >
                Revenue <SortIndicator field="revenue" />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground transition-colors text-xs font-medium text-right"
                onClick={() => handleSort("percentOfTotal")}
              >
                % Total <SortIndicator field="percentOfTotal" />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:text-foreground transition-colors text-xs font-medium text-right"
                onClick={() => handleSort("growth")}
              >
                Growth <SortIndicator field="growth" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.slice(0, 10).map((item, index) => {
              const isSelected = selectedName === item.name;
              const barWidth = (item.revenue / maxRevenue) * 100;
              
              return (
                <TableRow 
                  key={index}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                  )}
                  onClick={() => onRowClick?.(item.name)}
                >
                  <TableCell className="py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-sm text-foreground truncate max-w-[150px]">
                        {item.name}
                      </p>
                      {/* Mini bar chart */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden w-24">
                        <div 
                          className="h-full bg-primary/60 rounded-full transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right py-3">
                    <span className="font-medium text-sm">{formatCurrency(item.revenue)}</span>
                  </TableCell>
                  <TableCell className="text-right py-3">
                    <span className="text-sm text-muted-foreground">
                      {item.percentOfTotal.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right py-3">
                    {item.growth !== undefined ? (
                      <div className={cn(
                        "inline-flex items-center gap-1 text-sm font-medium",
                        item.growth > 0 ? "text-success" : item.growth < 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {item.growth > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : item.growth < 0 ? (
                          <TrendingDown className="h-3.5 w-3.5" />
                        ) : (
                          <Minus className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {item.growth > 0 ? "+" : ""}{item.growth.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
