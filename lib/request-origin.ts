/**
 * Return the browser-facing origin when the app is behind a reverse proxy.
 *
 * AWS ECS Express terminates TLS before forwarding requests to the Next.js
 * container, so request.url can contain the container's private hostname.
 * Redirects and third-party return URLs must use the original forwarded host
 * and protocol instead.
 */
export function getRequestOrigin(request: Request): string {
  const firstHeaderValue = (value: string | null) =>
    value?.split(",", 1)[0]?.trim() || null;

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto === "http" ? "http" : "https";

  // Restrict the host to a normal hostname (plus an optional port) so an
  // untrusted forwarding header cannot inject an arbitrary redirect value.
  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}
