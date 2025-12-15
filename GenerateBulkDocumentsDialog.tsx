import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SelectedTemplate {
  id: string;
  name: string;
}

interface GenerateBulkDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTemplates: SelectedTemplate[];
  blOrderName: string;
  onConfirm: (commentsByTemplateId: Record<string, string>) => Promise<void>;
  isGenerating: boolean;
}

export function GenerateBulkDocumentsDialog({
  open,
  onOpenChange,
  selectedTemplates,
  blOrderName,
  onConfirm,
  isGenerating,
}: GenerateBulkDocumentsDialogProps) {
  // Per-document comments keyed by template id
  const [commentsByTemplateId, setCommentsByTemplateId] = useState<Record<string, string>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

  const updateComment = (templateId: string, comment: string) => {
    setCommentsByTemplateId((prev) => ({
      ...prev,
      [templateId]: comment,
    }));
  };

  const toggleExpanded = (templateId: string) => {
    setExpandedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    await onConfirm(commentsByTemplateId);
    setCommentsByTemplateId({});
    setExpandedTemplates(new Set());
  };

  const handleCancel = () => {
    setCommentsByTemplateId({});
    setExpandedTemplates(new Set());
    onOpenChange(false);
  };

  const commentsCount = Object.values(commentsByTemplateId).filter((c) => c.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Selected Documents</DialogTitle>
          <DialogDescription>
            Generate {selectedTemplates.length} document{selectedTemplates.length > 1 ? "s" : ""} for {blOrderName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2">
              Documents
              {commentsCount > 0 && (
                <span className="text-xs text-primary">({commentsCount} with comments)</span>
              )}
            </Label>
            <ScrollArea className="max-h-64">
              <div className="space-y-2 pr-2">
                {selectedTemplates.map((template) => {
                  const isExpanded = expandedTemplates.has(template.id);
                  const hasComment = !!commentsByTemplateId[template.id]?.trim();

                  return (
                    <Collapsible
                      key={template.id}
                      open={isExpanded}
                      onOpenChange={() => toggleExpanded(template.id)}
                    >
                      <div className="border rounded-lg overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors text-left">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{template.name}</span>
                              {hasComment && (
                                <MessageSquare className="h-3 w-3 text-primary" />
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 pt-1">
                            <Textarea
                              placeholder="Add comment for this document (optional)..."
                              value={commentsByTemplateId[template.id] || ""}
                              onChange={(e) => updateComment(template.id, e.target.value)}
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              Click on a document to add a comment. Comments are embedded in generated documents.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              `Generate ${selectedTemplates.length} Document${selectedTemplates.length > 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}