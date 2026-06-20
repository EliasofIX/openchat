"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canAddMore,
  detectAttachmentKind,
  fileToAttachment,
  filesFromClipboard,
} from "@/lib/attachments";
import {
  attachmentSupported,
  getModelCapabilities,
  unsupportedReason,
} from "@/lib/model-capabilities";
import type { MessageAttachment, PendingAttachment } from "@/lib/types";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toReady(
  att: MessageAttachment,
  supported: boolean,
  model: string,
): PendingAttachment {
  if (!supported) {
    return {
      ...att,
      status: "unsupported",
      errorMessage: unsupportedReason(att.kind, model),
      previewUrl: att.dataUrl,
    };
  }
  return { ...att, status: "ready", previewUrl: att.dataUrl };
}

export function useAttachments(model: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const modelRef = useRef(model);

  useEffect(() => {
    modelRef.current = model;
    const caps = getModelCapabilities(model);
    setAttachments((prev) =>
      prev.map((att) => {
        if (att.status === "compressing" || att.status === "processing" || att.status === "error") {
          return att;
        }
        const supported = attachmentSupported(att.kind, caps);
        if (supported && att.status === "unsupported") {
          return { ...att, status: "ready", errorMessage: undefined };
        }
        if (!supported && att.status === "ready") {
          return {
            ...att,
            status: "unsupported",
            errorMessage: unsupportedReason(att.kind, model),
          };
        }
        return att;
      }),
    );
  }, [model]);

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(att.previewUrl);
      }
      return [];
    });
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const kind = detectAttachmentKind(file);
      if (!kind) continue;

      const id = makeId();
      const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;

      let added = false;
      setAttachments((prev) => {
        const count = prev.filter((a) => a.status !== "error").length;
        if (!canAddMore(count)) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          return prev;
        }
        added = true;
        return [
          ...prev,
          {
            id,
            kind,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            status: kind === "image" ? "compressing" : "processing",
            previewUrl,
          },
        ];
      });

      if (!added) continue;

      try {
        const result = await fileToAttachment(file);
        const supported = attachmentSupported(
          result.kind,
          getModelCapabilities(modelRef.current),
        );

        setAttachments((prev) =>
          prev.map((a) => {
            if (a.id !== id) return a;
            if (a.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(a.previewUrl);
            return toReady({ ...result, id: a.id }, supported, modelRef.current);
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process file.";
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: "error", errorMessage: message } : a,
          ),
        );
      }
    }
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const pasted = filesFromClipboard(e.clipboardData);
      if (pasted.length === 0) return;
      e.preventDefault();
      void addFiles(pasted);
    },
    [addFiles],
  );

  const readyAttachments = attachments.filter((a) => a.status === "ready");
  const hasUnsupported = attachments.some((a) => a.status === "unsupported");
  const isProcessing = attachments.some(
    (a) => a.status === "compressing" || a.status === "processing",
  );

  return {
    attachments,
    addFiles,
    remove,
    clear,
    handlePaste,
    readyAttachments,
    hasUnsupported,
    isProcessing,
  };
}
