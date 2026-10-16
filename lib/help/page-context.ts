import type { HelpCategoryId } from "@/lib/help/content";

// Which part of the app a coach is on, for the "Need Help?" assistant:
// a readable name for the AI, and the help sections to favour when
// picking articles. Most specific prefix first.
const PAGES: { prefix: RegExp; label: string; categories: HelpCategoryId[] }[] = [
  { prefix: /^\/athletes\/[^/]+\/sessions\//, label: "the session builder", categories: ["sessions"] },
  { prefix: /^\/athletes\/[^/]+\/profile/, label: "an athlete's profile", categories: ["athletes"] },
  { prefix: /^\/athletes\/[^/]+/, label: "an athlete's page", categories: ["athletes", "sessions"] },
  { prefix: /^\/athletes/, label: "the Athletes list", categories: ["athletes"] },
  { prefix: /^\/live/, label: "Live group", categories: ["live"] },
  { prefix: /^\/(community|forum)/, label: "Community", categories: ["community"] },
  { prefix: /^\/(challenges|documents)/, label: "Challenges & Documents", categories: ["documents-challenges"] },
  { prefix: /^\/testing/, label: "Testing", categories: ["testing"] },
  { prefix: /^\/(templates|programmes)/, label: "Programmes & templates", categories: ["programmes"] },
  { prefix: /^\/library/, label: "the Exercise library", categories: ["sessions"] },
  { prefix: /^\/reporting/, label: "Reporting", categories: ["reporting"] },
  { prefix: /^\/settings/, label: "Settings", categories: ["settings", "billing"] },
  { prefix: /^\/import/, label: "Import data", categories: ["athletes"] },
  { prefix: /^\/dashboard/, label: "the Dashboard", categories: ["getting-started"] },
];

export function helpPageContext(pathname: string | null | undefined) {
  if (!pathname) return null;
  return PAGES.find((p) => p.prefix.test(pathname)) ?? null;
}
