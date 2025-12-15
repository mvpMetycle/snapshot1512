import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DOCUMENT_TYPES = [
  "Completed BL Instructions",
  "Booking Confirmation",
  "Other",
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];

interface UploadBLDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blOrderId: number;
  blOrderName: string;
  onUploadSuccess: () => void;
}

export function UploadBLDocumentDialog({
  open,
  onOpenChange,
  blOrderId,
  blOrderName,
  onUploadSuccess,
}: UploadBLDocumentDialogProps) {
  const [selectedType, setSelectedType] = useState<DocumentType | "">("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedType || !selectedFile) {
      toast.error("Please select both a document type and file");
      return;
    }

    setIsUploading(true);
    try {
      // Create file name following pattern: <document_type>_<bl_order_name>.<ext>
      const fileExtension = selectedFile.name.split(".").pop() || "pdf";
      const sanitizedBlOrderName = blOrderName.replace(/[^a-zA-Z0-9-_]/g, "_");
      const storedFileName = `${selectedType}_${sanitizedBlOrderName}.${fileExtension}`;
      const filePath = `uploads/${storedFileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("bl-documents")
        .upload(filePath, selectedFile, {
          upsert: true,
          contentType: selectedFile.type,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("bl-documents")
        .getPublicUrl(filePath);

      // Insert record into generated_documents with template_id = NULL
      const { error: insertError } = await supabase
        .from("generated_documents")
        .insert({
          bl_order_id: blOrderId,
          document_name: storedFileName,
          document_url: urlData.publicUrl,
          document_type: selectedType,
          template_id: null,
        });

      if (insertError) throw insertError;

      toast.success(`${selectedType} uploaded successfully`);
      onUploadSuccess();
      handleClose();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(`Failed to upload document: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedType("");
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onOpenChange(false);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Document Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="document-type">Document Type</Label>
            <Select
              value={selectedType}
              onValueChange={(value) => setSelectedType(value as DocumentType)}
            >
              <SelectTrigger id="document-type">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File Selection */}
          <div className="space-y-2">
            <Label>File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />

            {selectedFile ? (
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  Click to select a file
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  PDF, DOC, DOCX, XLS, XLSX, PNG, JPG
                </span>
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedType || !selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
