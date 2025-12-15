import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DocumentGenerationService } from "@/services/documentGenerationService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { GenerateDocumentCommentDialog } from "@/components/GenerateDocumentCommentDialog";
import { GenerateBulkDocumentsDialog } from "@/components/GenerateBulkDocumentsDialog";
import { UploadBLDocumentDialog } from "@/components/UploadBLDocumentDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FileText,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  CheckCircle2,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Check,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

// Helper to extract file path from full Supabase storage URL
const extractFilePath = (url: string): string | null => {
  try {
    // Handle full URLs with potential query params
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\/bl-documents\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    // Fallback for relative paths or malformed URLs
    const match = url.match(/\/bl-documents\/([^?]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
};

// Template names we want to show for BL-level generation
const BL_TEMPLATES = [
  "Certificate of Origin",
  "Freight Certificate",
  "Freight Insurance",
  "Non-Radioactive and No War Certificate",
  "Packing List",
];

interface BLDocumentGenerationProps {
  blOrderId: number;
  blOrder?: {
    bl_url: string | null;
    bl_number: string | null;
    bl_order_name: string | null;
  };
  onViewBL?: () => void;
  onDownloadBL?: () => void;
}

interface GeneratedDoc {
  id: string;
  template_id: string | null;
  bl_order_id: number;
  document_name: string;
  document_url: string | null;
  generated_at: string | null;
  comment: string | null;
  document_type: string | null;
  document_templates: {
    name: string;
    category: string;
  } | null;
}

export function BLDocumentGeneration({ blOrderId, blOrder, onViewBL, onDownloadBL }: BLDocumentGenerationProps) {
  const queryClient = useQueryClient();
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [generatingTemplates, setGeneratingTemplates] = useState<Set<string>>(new Set());
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);

  // Single document generation dialog state
  const [singleGenDialog, setSingleGenDialog] = useState<{
    open: boolean;
    templateId: string;
    templateName: string;
    existingComment: string;
  } | null>(null);

  // Bulk generation dialog state
  const [bulkGenDialogOpen, setBulkGenDialogOpen] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);

  // Comment editing state
  const [editingCommentDocId, setEditingCommentDocId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Edit comment
  const handleEditComment = (doc: GeneratedDoc) => {
    setEditingCommentDocId(doc.id);
    setEditingCommentText(doc.comment || "");
  };

  // Save comment
  const handleSaveComment = async (docId: string) => {
    setSavingComment(true);
    try {
      const { error } = await supabase
        .from("generated_documents")
        .update({ comment: editingCommentText.trim() || null })
        .eq("id", docId);

      if (error) throw error;

      toast.success("Comment updated");
      setEditingCommentDocId(null);
      setEditingCommentText("");
      queryClient.invalidateQueries({ queryKey: ["generated-documents-bl", blOrderId] });
    } catch (error: any) {
      console.error("Error updating comment:", error);
      toast.error("Failed to update comment");
    } finally {
      setSavingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (docId: string) => {
    setSavingComment(true);
    try {
      const { error } = await supabase
        .from("generated_documents")
        .update({ comment: null })
        .eq("id", docId);

      if (error) throw error;

      toast.success("Comment deleted");
      queryClient.invalidateQueries({ queryKey: ["generated-documents-bl", blOrderId] });
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      toast.error("Failed to delete comment");
    } finally {
      setSavingComment(false);
    }
  };

  // View generated document using PdfViewerModal (uses Google Docs proxy to bypass Chrome blocking)
  const handleViewGeneratedDoc = (documentUrl: string, documentName: string) => {
    // Construct full Supabase URL if needed
    const fullUrl = documentUrl.startsWith('http') 
      ? documentUrl 
      : `https://tbwkhqvrqhagoswehrkx.supabase.co/storage/v1/object/public/bl-documents/${documentUrl}`;
    
    setViewingDocument({ url: fullUrl, name: documentName });
    setPdfViewerOpen(true);
  };

  // Download generated document using Supabase SDK
  const handleDownloadGeneratedDoc = async (documentUrl: string, documentName: string) => {
    try {
      const filePath = extractFilePath(documentUrl);
      if (!filePath) {
        toast.error("Invalid document URL");
        return;
      }
      
      const { data, error } = await supabase.storage
        .from('bl-documents')
        .download(filePath);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Document downloaded");
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error("Failed to download document");
    }
  };

  // Fetch available templates
  const { data: templates } = useQuery({
    queryKey: ["bl-document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("id, name, category")
        .eq("is_active", true)
        .in("name", BL_TEMPLATES);

      if (error) throw error;
      return data;
    },
  });

  // Fetch already generated documents for this BL Order
  const { data: generatedDocs, refetch: refetchDocs } = useQuery({
    queryKey: ["generated-documents-bl", blOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_documents")
        .select("*, document_templates(name, category)")
        .eq("bl_order_id", blOrderId);

      if (error) throw error;
      return data as GeneratedDoc[];
    },
    enabled: !!blOrderId,
  });

  // Map template name to generated doc
  const generatedByTemplate = (generatedDocs || []).reduce((acc, doc) => {
    if (doc.document_templates?.name) {
      acc[doc.document_templates.name] = doc;
    }
    return acc;
  }, {} as Record<string, GeneratedDoc>);

  // Open single generation dialog
  const openSingleGenDialog = (templateId: string, templateName: string, existingComment?: string) => {
    setSingleGenDialog({ open: true, templateId, templateName, existingComment: existingComment || "" });
  };

  // Generate a single document with comment
  const handleGenerateWithComment = async (comment: string) => {
    if (!singleGenDialog) return;

    const { templateId, templateName } = singleGenDialog;
    setGeneratingTemplates((prev) => new Set(prev).add(templateName));

    try {
      const result = await DocumentGenerationService.generateDocument({
        templateId,
        blOrderId,
        comment: comment || undefined,
      });

      toast.success(`${templateName} generated successfully`);
      queryClient.invalidateQueries({ queryKey: ["generated-documents-bl", blOrderId] });

      // Close dialog
      setSingleGenDialog(null);

      // Open the document in viewer modal instead of new tab (avoids browser blocking)
      if (result.url) {
        const fullUrl = result.url.startsWith('http') 
          ? result.url 
          : `https://tbwkhqvrqhagoswehrkx.supabase.co/storage/v1/object/public/bl-documents/${result.url}`;
        setViewingDocument({ url: fullUrl, name: templateName });
        setPdfViewerOpen(true);
      }
    } catch (error: any) {
      console.error("Error generating document:", error);
      toast.error(`Failed to generate ${templateName}: ${error.message}`);
    } finally {
      setGeneratingTemplates((prev) => {
        const next = new Set(prev);
        next.delete(templateName);
        return next;
      });
    }
  };

  // Open bulk generation dialog
  const handleOpenBulkDialog = () => {
    if (selectedTemplates.size === 0) {
      toast.error("Please select at least one template");
      return;
    }
    setBulkGenDialogOpen(true);
  };

  // Generate all selected documents with per-document comments
  const handleBulkGenerateWithComments = async (commentsByTemplateId: Record<string, string>) => {
    const templatesToGenerate = templates?.filter((t) => selectedTemplates.has(t.name)) || [];
    
    setIsBulkGenerating(true);

    try {
      for (const template of templatesToGenerate) {
        setGeneratingTemplates((prev) => new Set(prev).add(template.name));
        
        try {
          const templateComment = commentsByTemplateId[template.id]?.trim();
          await DocumentGenerationService.generateDocument({
            templateId: template.id,
            blOrderId,
            comment: templateComment || undefined,
          });
          toast.success(`${template.name} generated successfully`);
        } catch (error: any) {
          console.error(`Error generating ${template.name}:`, error);
          toast.error(`Failed to generate ${template.name}: ${error.message}`);
        } finally {
          setGeneratingTemplates((prev) => {
            const next = new Set(prev);
            next.delete(template.name);
            return next;
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["generated-documents-bl", blOrderId] });
      setSelectedTemplates(new Set());
      setBulkGenDialogOpen(false);
    } finally {
      setIsBulkGenerating(false);
    }
  };

  // Toggle template selection
  const toggleTemplate = (templateName: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(templateName)) {
        next.delete(templateName);
      } else {
        next.add(templateName);
      }
      return next;
    });
  };

  // Sort templates to show BL_TEMPLATES order
  const sortedTemplates = templates?.sort((a, b) => {
    return BL_TEMPLATES.indexOf(a.name) - BL_TEMPLATES.indexOf(b.name);
  }) || [];

  // Get selected templates for bulk dialog
  const selectedTemplatesList = sortedTemplates
    .filter((t) => selectedTemplates.has(t.name))
    .map((t) => ({ id: t.id, name: t.name }));

  // Get uploaded documents (template_id is null)
  const uploadedDocs = (generatedDocs || []).filter(doc => doc.template_id === null && doc.document_type);

  return (
    <div className="space-y-4">
      {/* Header with Upload and Generate Selected buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload documents
        </Button>
        {selectedTemplates.size > 0 && (
          <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {selectedTemplates.size} template{selectedTemplates.size > 1 ? "s" : ""} selected
            </span>
            <Button size="sm" onClick={handleOpenBulkDialog}>
              Generate Selected
            </Button>
          </div>
        )}
      </div>

      {/* Unified Document List */}
      <div className="space-y-2">
          {/* Bill of Lading - First in the list */}
          {blOrder && (
            <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <Checkbox disabled checked={false} className="opacity-50" />
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Bill of Lading</p>
                  {blOrder.bl_url && (
                    <p className="text-xs text-muted-foreground">Uploaded</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {blOrder.bl_url ? (
                  <>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Uploaded
                    </Badge>
                    <button
                      onClick={onViewBL}
                      className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={onDownloadBL}
                      className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not Uploaded
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Generated Document Templates */}
          {sortedTemplates.map((template) => {
            const generatedDoc = generatedByTemplate[template.name];
            const isGenerating = generatingTemplates.has(template.name);
            const isSelected = selectedTemplates.has(template.name);

            return (
              <div
                key={template.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                {/* Left: Checkbox + Name */}
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleTemplate(template.name)}
                    disabled={isGenerating}
                  />
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{template.name}</p>
                      {generatedDoc?.comment && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                              <MessageSquare className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="right" className="w-72">
                            {editingCommentDocId === generatedDoc.id ? (
                              <div className="space-y-3">
                                <p className="font-medium text-sm">Edit Comment</p>
                                <Textarea
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  rows={3}
                                  className="text-sm"
                                  placeholder="Enter comment..."
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingCommentDocId(null);
                                      setEditingCommentText("");
                                    }}
                                    disabled={savingComment}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveComment(generatedDoc.id)}
                                    disabled={savingComment}
                                  >
                                    {savingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <p className="font-medium text-sm">Comment</p>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{generatedDoc.comment}</p>
                                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditComment(generatedDoc)}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteComment(generatedDoc.id)}
                                    disabled={savingComment}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    {generatedDoc && (
                      <p className="text-xs text-muted-foreground">
                        Generated{" "}
                        {generatedDoc.generated_at
                          ? new Date(generatedDoc.generated_at).toLocaleDateString()
                          : ""}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Status + Actions */}
                <div className="flex items-center gap-2">
                  {generatedDoc ? (
                    <>
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Generated
                      </Badge>
                      {generatedDoc.document_url && (
                        <button
                          onClick={() => handleViewGeneratedDoc(generatedDoc.document_url!, generatedDoc.document_name)}
                          className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      {generatedDoc.document_url && (
                        <button
                          onClick={() => handleDownloadGeneratedDoc(generatedDoc.document_url!, generatedDoc.document_name)}
                          className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openSingleGenDialog(template.id, template.name, generatedDoc?.comment || "")}
                        disabled={isGenerating}
                        title="Regenerate"
                      >
                        {isGenerating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => openSingleGenDialog(template.id, template.name)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {sortedTemplates.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No document templates found. Please create templates in the Documentation section.
            </div>
          )}

          {/* Uploaded Documents Section */}
          {uploadedDocs.length > 0 && (
            <>
              <div className="pt-4 border-t mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Uploaded Documents
                </p>
              </div>
              {uploadedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{doc.document_type}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded{" "}
                        {doc.generated_at
                          ? new Date(doc.generated_at).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Uploaded
                    </Badge>
                    {doc.document_url && (
                      <button
                        onClick={() => handleViewGeneratedDoc(doc.document_url!, doc.document_name)}
                        className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {doc.document_url && (
                      <button
                        onClick={() => handleDownloadGeneratedDoc(doc.document_url!, doc.document_name)}
                        className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
      </div>

      {/* Single Document Generation Dialog */}
      {singleGenDialog && (
        <GenerateDocumentCommentDialog
          open={singleGenDialog.open}
          onOpenChange={(open) => {
            if (!open) setSingleGenDialog(null);
          }}
          templateName={singleGenDialog.templateName}
          blOrderName={blOrder?.bl_order_name || `BL #${blOrderId}`}
          onConfirm={handleGenerateWithComment}
          isGenerating={generatingTemplates.has(singleGenDialog.templateName)}
          existingComment={singleGenDialog.existingComment}
        />
      )}

      {/* Bulk Generation Dialog */}
      <GenerateBulkDocumentsDialog
        open={bulkGenDialogOpen}
        onOpenChange={setBulkGenDialogOpen}
        selectedTemplates={selectedTemplatesList}
        blOrderName={blOrder?.bl_order_name || `BL #${blOrderId}`}
        onConfirm={handleBulkGenerateWithComments}
        isGenerating={isBulkGenerating}
      />

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfViewerOpen}
        onClose={() => {
          setPdfViewerOpen(false);
          setViewingDocument(null);
        }}
        pdfUrl={viewingDocument?.url || ""}
        documentName={viewingDocument?.name || "Document"}
        onDownload={viewingDocument ? () => handleDownloadGeneratedDoc(viewingDocument.url, viewingDocument.name) : undefined}
      />

      {/* Upload Document Dialog */}
      <UploadBLDocumentDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        blOrderId={blOrderId}
        blOrderName={blOrder?.bl_order_name || `BL-${blOrderId}`}
        onUploadSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["generated-documents-bl", blOrderId] });
        }}
      />
    </div>
  );
}
