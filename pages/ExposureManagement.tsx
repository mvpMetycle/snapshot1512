import { ExposureKPISection } from "@/components/hedging/ExposureKPISection";
import { ExposureDrilldownTables } from "@/components/hedging/ExposureDrilldownTables";
import { HedgeMatchingTab } from "@/components/hedging/HedgeMatchingTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Link2 } from "lucide-react";

export default function ExposureManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Exposure Management</h2>
        <p className="text-sm text-muted-foreground">
          Risk management dashboard for metals hedging — track hedgeable exposure vs priced positions
        </p>
      </div>

      {/* Top KPIs */}
      <ExposureKPISection />

      {/* Tabs for Drilldown vs Matching */}
      <Tabs defaultValue="drilldown" className="w-full">
        <TabsList>
          <TabsTrigger value="drilldown" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Risk Analysis
          </TabsTrigger>
          <TabsTrigger value="matching" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            QP Matching
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drilldown" className="mt-6">
          <ExposureDrilldownTables />
        </TabsContent>

        <TabsContent value="matching" className="mt-6">
          <HedgeMatchingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
