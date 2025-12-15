import { useState } from "react";
import { FileText, Download, Trash2, ExternalLink, Loader2, MessageSquare, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface GeneratedDocument {
  id: string;
  document_name: string;
  document_url: string;
  generated_at: string;
  comment?: string | null;
  document_templates: {
    name: string;
    category: string;
  };
}

interface GeneratedDocumentsListProps {
  documents: GeneratedDocument[];
  onDelete: (documentId: string) => void;
  onCommentUpdate?: () => void;
}

// Helper to extract file path from Supabase storage URL
const extractFilePath = (url: string): string | null => {
  try {
    const match = url.match(/\/bl-documents\/(.+)$/);
    if (match) {
      return decodeURIComponent(match[1].split('?')[0]);
    }
    // Also handle full URLs
    const urlObj = new URL(url);
    const fullMatch = urlObj.pathname.match(/\/bl-documents\/(.+)$/);
    return fullMatch ? decodeURIComponent(fullMatch[1]) : null;
  } catch {
    return null;
  }
};

export const GeneratedDocumentsList = ({ documents, onDelete, onCommentUpdate }: GeneratedDocumentsListProps) => {
  const [viewingDoc, setViewingDoc] = useState<GeneratedDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const handleDownload = async (doc: GeneratedDocument) => {
    setDownloadingId(doc.id);
    try {
      const filePath = extractFilePath(doc.document_url);
      if (!filePath) {
        toast.error("Invalid document URL");
        return;
      }

      const { data, error } = await supabase.storage
        .from("bl-documents")
        .download(filePath);

      if (error) throw error;

      const downloadUrl = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = doc.document_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast.success("Document downloaded");
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error("Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleEditComment = (doc: GeneratedDocument) => {
    setEditingCommentId(doc.id);
    setEditingCommentText(doc.comment || "");
  };

  const handleSaveComment = async (docId: string) => {
    setSavingComment(true);
    try {
      const { error } = await supabase
        .from("generated_documents")
        .update({ comment: editingCommentText.trim() || null })
        .eq("id", docId);

      if (error) throw error;

      toast.success("Comment updated");
      setEditingCommentId(null);
      setEditingCommentText("");
      onCommentUpdate?.();
    } catch (error: any) {
      console.error("Error updating comment:", error);
      toast.error("Failed to update comment");
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async (docId: string) => {
    setSavingComment(true);
    try {
      const { error } = await supabase
        .from("generated_documents")
        .update({ comment: null })
        .eq("id", docId);

      if (error) throw error;

      toast.success("Comment deleted");
      onCommentUpdate?.();
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      toast.error("Failed to delete comment");
    } finally {
      setSavingComment(false);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No documents generated yet</p>
        <p className="text-sm text-muted-foreground mt-1">Generate your first document from a template</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[600px]">
        <div className="space-y-2 p-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-foreground truncate">{doc.document_name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {doc.document_templates.name}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {doc.document_templates.category}
                      </Badge>
                      {doc.comment && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <MessageSquare className="h-3 w-3" />
                              <span>Comment</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="bottom" className="w-72">
                            {editingCommentId === doc.id ? (
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
                                      setEditingCommentId(null);
                                      setEditingCommentText("");
                                    }}
                                    disabled={savingComment}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveComment(doc.id)}
                                    disabled={savingComment}
                                  >
                                    {savingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <p className="font-medium text-sm">Comment</p>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{doc.comment}</p>
                                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditComment(doc)}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteComment(doc.id)}
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
                      <p className="text-xs text-muted-foreground mt-2">
                        Generated {format(new Date(doc.generated_at), "MMM dd, yyyy 'at' HH:mm")}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewingDoc(doc)}
                      title="View Document"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      title="Download"
                    >
                      {downloadingId === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${doc.document_name}"?`)) {
                          onDelete(doc.id);
                        }
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

      {viewingDoc && (
        <PdfViewerModal
          isOpen={!!viewingDoc}
          onClose={() => setViewingDoc(null)}
          pdfUrl={viewingDoc.document_url}
          documentName={viewingDoc.document_name}
          onDownload={() => handleDownload(viewingDoc)}
        />
      )}
    </>
  );
};
