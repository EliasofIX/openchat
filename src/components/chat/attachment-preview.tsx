"use client";

import { AlertCircle, FileCode2, FileText, Loader2, X } from "@/components/icons";
import { cn, touchVisible } from "@/lib/utils";
import type { PendingAttachment } from "@/lib/types";

type Props = {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
};

export function AttachmentPreviewList({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((att) => (
        <AttachmentChip key={att.id} attachment={att} onRemove={() => onRemove(att.id)} />
      ))}
    </div>
  );
}

function AttachmentChip({
  attachment: att,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  const isLoading = att.status === "compressing" || att.status === "processing";
  const isUnsupported = att.status === "unsupported";
  const isError = att.status === "error";

  return (
    <div
      className={cn(
        "group relative flex max-w-[10rem] items-center gap-2 rounded-xl border px-2 py-1.5 text-xs",
        isUnsupported || isError
          ? "border-destructive bg-destructive/10"
          : "border-border bg-muted",
      )}
      title={att.errorMessage ?? att.name}
    >
      <div className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
        {att.kind === "image" && att.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={att.previewUrl}
            alt=""
            className={cn("size-full object-cover", isLoading && "opacity-50")}
          />
        ) : att.kind === "pdf" ? (
          <div className="grid size-full place-items-center text-muted-foreground">
            <FileText size={16} />
          </div>
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <FileCode2 size={16} />
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 grid place-items-center bg-muted">
            <Loader2 size={16} className="animate-spin text-foreground" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{att.name}</p>
        {isLoading && (
          <p className="text-[10px] text-muted-foreground">
            {att.status === "compressing" ? "Compressing…" : "Processing…"}
          </p>
        )}
        {isUnsupported && (
          <p className="flex items-start gap-0.5 text-[10px] leading-tight text-destructive">
            <AlertCircle size={10} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{att.errorMessage}</span>
          </p>
        )}
        {isError && (
          <p className="line-clamp-2 text-[10px] text-destructive">{att.errorMessage}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${att.name}`}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground coarse:size-8",
          "transition hover:bg-muted hover:text-foreground",
          touchVisible,
          (isUnsupported || isError) && "opacity-100",
        )}
      >
        <X size={12} />
      </button>
    </div>
  );
}
