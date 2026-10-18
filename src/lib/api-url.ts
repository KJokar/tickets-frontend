/** The public API origin is inlined into browser bundles by Next.js at build time. */
export function apiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("API paths must be relative to the configured API origin.");
  }
  return (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "") + path;
}
