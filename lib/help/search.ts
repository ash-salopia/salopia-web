// Ranked search over the Help & FAQ articles. Pure, no backend - used by
// the /help page as you type, and by the support agent route
// (app/api/support-agent) to pick which articles to hand the AI.
//
// Plain-English questions work ("how do i delete an athlete"):
//  - filler words are dropped, words are trimmed to a rough stem
//    ("deleting" → "delet"), so word forms don't matter
//  - any matching word scores (not all-or-nothing), weighted by where
//    it hits (title > keywords > summary > body) and how rare it is
//  - common synonyms map across ("client" → athlete, "workout" → session)
//  - small typos still match ("sesion", "atheletes")

import { HELP_ARTICLES, type HelpArticle } from "@/lib/help/content";

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can cant can't could did do does doing dont don't for from get " +
    "got has have how i i'm im if in into is it its it's me my no not of on or our please should so " +
    "some that the their them then there these they this to too up us want was we what when where " +
    "which who why will with won't would you your yours keep keeps still just way able need needs " +
    "trying try anyone help"
  ).split(" ")
);

// Words in each group count as each other (at a discount). Keep these to
// real-world phrasings coaches use that differ from the app's wording.
const SYNONYM_GROUPS: string[][] = [
  ["delete", "remove", "erase"],
  ["athlete", "client", "player", "member", "trainee", "student"],
  ["session", "workout", "training"],
  ["programme", "program", "block"],
  ["template", "copy", "duplicate", "reuse"],
  ["login", "signin", "logon", "signon", "password"],
  ["show", "appear", "see", "visible", "missing", "list", "find"],
  ["billing", "payment", "pay", "invoice", "subscription", "price", "card"],
  ["share", "link", "invite", "app"],
  ["pb", "best", "record"],
  ["test", "testing", "assessment", "screening"],
  ["report", "pdf", "summary"],
  ["coach", "staff", "colleague", "team"],
  ["notification", "push", "alert", "reminder"],
  ["exercise", "movement", "lift", "drill"],
  ["reorder", "order", "move", "drag", "rearrange"],
  ["error", "broken", "bug", "crash", "working", "wrong"],
];

export function stem(word: string): string {
  let w = word.toLowerCase().replace(/'s$/, "");
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  // "deleting"/"deleted"/"delete" all land on "delet"
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  const t = text
    .toLowerCase()
    .replace(/\*\*/g, "")
    // "log in" (account) must not read as "log" (logging sets)
    .replace(/\b(log|sign)(?:ging|ed)?[\s-]+(in|out|on)\b/g, "$1$2");
  return t.match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];
}

/** The meaningful words of a query (no filler), as typed - for highlighting. */
export function queryWords(query: string): string[] {
  return tokenize(query).filter((w) => !STOPWORDS.has(w));
}

const SYNONYMS = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const stems = group.map((g) => stem(g.split(" ")[0]));
  for (const s of stems) {
    if (!SYNONYMS.has(s)) SYNONYMS.set(s, new Set());
    for (const other of stems) if (other !== s) SYNONYMS.get(s)!.add(other);
  }
}

// ── index ───────────────────────────────────────────────────────────────
const FIELD_WEIGHTS = { title: 4, keywords: 3, summary: 2, body: 1 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

interface IndexedArticle {
  article: HelpArticle;
  fields: Record<Field, Map<string, number>>;
  titleLower: string;
}

function termCounts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of tokenize(text)) {
    if (STOPWORDS.has(w)) continue;
    const s = stem(w);
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  return m;
}

function bodyText(a: HelpArticle): string {
  return a.body.map((b) => (b.type === "steps" ? b.items.join(" ") : b.text)).join(" ");
}

let INDEX: IndexedArticle[] | null = null;
let DOC_FREQ: Map<string, number> | null = null;

function getIndex() {
  if (INDEX && DOC_FREQ) return { index: INDEX, docFreq: DOC_FREQ };
  INDEX = HELP_ARTICLES.map((article) => ({
    article,
    titleLower: article.title.toLowerCase(),
    fields: {
      title: termCounts(article.title),
      keywords: termCounts(article.keywords.join(" ")),
      summary: termCounts(article.summary),
      body: termCounts(bodyText(article)),
    },
  }));
  DOC_FREQ = new Map();
  for (const doc of INDEX) {
    const seen = new Set<string>();
    for (const f of Object.values(doc.fields)) for (const t of f.keys()) seen.add(t);
    for (const t of seen) DOC_FREQ.set(t, (DOC_FREQ.get(t) ?? 0) + 1);
  }
  return { index: INDEX, docFreq: DOC_FREQ };
}

// Edit distance capped at `max` (returns max+1 if it's further).
function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// Each query word expands to [term, weight] pairs: itself (1), its
// synonyms (0.6), and - only if it's not a known word - close typos (0.7).
function expand(word: string, docFreq: Map<string, number>): Map<string, number> {
  const s = stem(word);
  const out = new Map<string, number>([[s, 1]]);
  for (const syn of SYNONYMS.get(s) ?? []) if (!out.has(syn)) out.set(syn, 0.6);
  if (!docFreq.has(s) && s.length >= 4) {
    const max = s.length >= 8 ? 2 : 1;
    let found = 0;
    for (const term of docFreq.keys()) {
      if (found >= 3) break;
      if (term !== s && withinDistance(s, term, max)) {
        out.set(term, 0.7);
        found++;
      }
    }
  }
  return out;
}

export interface HelpSearchResult {
  article: HelpArticle;
  score: number;
}

export function searchHelp(query: string, limit = 20): HelpSearchResult[] {
  const words = Array.from(new Set(queryWords(query)));
  if (!words.length) return [];
  const { index, docFreq } = getIndex();
  const n = index.length;
  const expansions = words.map((w) => expand(w, docFreq));
  const phrase = words.join(" ");

  const results: HelpSearchResult[] = [];
  for (const doc of index) {
    let score = 0;
    let matchedWords = 0;
    for (const terms of expansions) {
      let best = 0;
      for (const [term, weight] of terms) {
        const df = docFreq.get(term);
        if (!df) continue;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        let termScore = 0;
        for (const f of Object.keys(FIELD_WEIGHTS) as Field[]) {
          const tf = doc.fields[f].get(term) ?? 0;
          if (tf) termScore += FIELD_WEIGHTS[f] * (tf / (tf + 1.2));
        }
        best = Math.max(best, termScore * idf * weight);
      }
      if (best > 0) matchedWords++;
      score += best;
    }
    if (!matchedWords) continue;
    // Reward articles that cover more of the question, and exact title phrases.
    score *= 0.4 + 0.6 * (matchedWords / words.length);
    if (words.length > 1 && doc.titleLower.includes(phrase)) score *= 1.5;
    results.push({ article: doc.article, score });
  }

  results.sort((a, b) => b.score - a.score);
  if (!results.length) return [];
  // Drop the long tail of weak, one-word incidental matches.
  const cutoff = results[0].score * 0.2;
  return results.filter((r) => r.score >= cutoff).slice(0, limit);
}
