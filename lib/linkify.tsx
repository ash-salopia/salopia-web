import type { ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;
const TRAILING_PUNCT = /[.,!?;:)\]}]+$/;

// Turns bare URLs in plain text into clickable links, leaving everything
// else untouched. Used for read-only rendering of free-text fields
// (session notes, etc.) where coaches/athletes often paste video links.
export function linkify(text: string): ReactNode[] {
  // split() with a capturing group interleaves the parts: even indices are
  // plain text, odd indices are the captured URL matches.
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;

    const trailingMatch = part.match(TRAILING_PUNCT);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    const href = url.startsWith("www.") ? `https://${url}` : url;

    return (
      <span key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}
