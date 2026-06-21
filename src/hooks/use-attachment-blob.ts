"use client";

import { useEffect, useState } from "react";
import { getBlob } from "@/lib/attachment-store";
import type { MessageAttachment } from "@/lib/types";

export function useAttachmentBlob(attachment: MessageAttachment) {
  const [dataUrl, setDataUrl] = useState(attachment.dataUrl);
  const [textContent, setTextContent] = useState(attachment.textContent);
  const [loading, setLoading] = useState(
    attachment.kind === "image" && !attachment.dataUrl,
  );

  useEffect(() => {
    if (attachment.dataUrl || attachment.textContent) {
      setDataUrl(attachment.dataUrl);
      setTextContent(attachment.textContent);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(attachment.kind === "image");

    void getBlob(attachment.id).then((blob) => {
      if (cancelled) return;
      if (blob?.dataUrl) setDataUrl(blob.dataUrl);
      if (blob?.textContent) setTextContent(blob.textContent);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.kind, attachment.dataUrl, attachment.textContent]);

  return { dataUrl, textContent, loading };
}
