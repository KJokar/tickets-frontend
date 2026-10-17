import type { CSSProperties } from "react";

export type ChatIconName = "back" | "send" | "attach" | "mic" | "stop" | "close" | "check" | "checks" | "refresh" | "file" | "clock" | "down" | "shield" | "image";
export function ChatIcon({ name, size = 20, style }: { name: ChatIconName; size?: number; style?: CSSProperties }) {
  const paths: Record<ChatIconName, React.ReactNode> = {
    back: <><path d="m10 5 7 7-7 7M17 12H4" /></>,
    send: <><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3" /></>,
    attach: <path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9a2 2 0 0 1 3 3L6 15" />,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    checks: <><path d="m2 12 4 4L16 6M11 15l1 1L22 6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    down: <path d="m6 9 6 6 6-6" />,
    shield: <><path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z" /><path d="m8 11 3 3 5-5" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
