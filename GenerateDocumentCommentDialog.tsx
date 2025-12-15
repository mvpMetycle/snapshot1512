import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";

interface GenerateDocumentCommentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  blOrderName: string;
  onConfirm: (comment: string) => Promise<void>;
  isGenerating: boolean;
  existingComment?: string;
}

export function GenerateDocumentCommentDialog({
  open,
  onOpenChange,
  templateName,
  blOrderName,
  onConfirm,
  isGenerating,
  existingComment = "",
}: GenerateDocumentCommentDialogProps) {
  const [comment, setComment] = useState(existingComment);

  // Reset comment when dialog opens with a new existing comment
  useEffect(() => {
    setComment(existingComment);
  }, [existingComment, open]);

  const handleConfirm = async () => {
    await onConfirm(comment);
    setComment("");
  };

  const handleCancel = () => {
    setComment("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Document</DialogTitle>
          <DialogDescription>
            Add an optional comment before generating the document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Document</Label>
            <p className="text-sm font-medium">{templateName}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">BL Order</Label>
            <p className="text-sm font-medium">{blOrderName}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Textarea
              id="comment"
              placeholder="Add a comment for this document..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
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
              "Generate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
