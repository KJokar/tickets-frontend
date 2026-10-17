"use client";
import { useState } from "react";
import { cdnUrl } from "@/lib/media";
export function UserAvatar({ url, name, className = "avatar-mark" }: { url?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState<string>(); const src = cdnUrl(url);
  return <span className={className}>{src && failed !== src ?
    // eslint-disable-next-line @next/next/no-img-element -- Avatars are served by the standalone CDN.
    <img src={src} alt={name} onError={() => setFailed(src)} /> : name.trim().slice(0, 1)}</span>;
}
