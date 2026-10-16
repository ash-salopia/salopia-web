"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpBlock,
  type HelpCategoryId,
} from "@/lib/help/content";
import { searchHelp, queryWords, stem } from "@/lib/help/search";
import SupportAgentChat from "@/components/SupportAgentChat";

// ── inline **bold** → <strong> ────────────────────────────────────────
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ color: "var(--text)", fontWeight: 700 }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

// wrap matched search tokens in <mark>
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(
    `(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        tokens.some((t) => t.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} style={{ background: "var(--accent-dim)", color: "var(--text)", borderRadius: 3 }}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function BlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "p":
      return <p style={styles.para}><RichText text={block.text} /></p>;
    case "subhead":
      return <h4 style={styles.subhead}><RichText text={block.text} /></h4>;
    case "steps":
      return (
        <ol style={styles.steps}>
          {block.items.map((it, i) => (
            <li key={i} style={styles.step}><RichText text={it} /></li>
          ))}
        </ol>
      );
    case "tip":
      return (
        <div style={styles.tip}>
          <span style={styles.calloutIcon}>💡</span>
          <div><RichText text={block.text} /></div>
        </div>
      );
    case "note":
      return (
        <div style={styles.note}>
          <span style={styles.calloutIcon}>⚠️</span>
          <div><RichText text={block.text} /></div>
        </div>
      );
  }
}

function ArticleBody({ article }: { article: HelpArticle }) {
  return (
    <div style={styles.articleBody}>
      {article.body.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

// first sentence-ish snippet of the first block that mentions a token
function snippetFor(article: HelpArticle, tokens: string[]): string {
  const texts: string[] = [];
  for (const b of article.body) {
    if (b.type === "steps") texts.push(...b.items);
    else texts.push(b.text);
  }
  const hit =
    texts.find((t) => tokens.some((tok) => t.toLowerCase().includes(tok))) ??
    texts[0] ??
    "";
  const clean = hit.replace(/\*\*/g, "");
  return clean.length > 160 ? clean.slice(0, 157) + "…" : clean;
}

const CATEGORY_LABEL: Record<HelpCategoryId, string> = HELP_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c.label }),
  {} as Record<HelpCategoryId, string>
);

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<HelpCategoryId>(HELP_CATEGORIES[0].id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resultOpenId, setResultOpenId] = useState<string | null>(null);
  const articleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // "Speak to an agent" - opens pre-filled with whatever was searched.
  const [agentSeed, setAgentSeed] = useState<string | null>(null);
  const openAgent = () => setAgentSeed(query.trim());

  // deep link: /help#article-id
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const art = HELP_ARTICLES.find((a) => a.id === hash);
    if (!art) return;
    setActiveCat(art.category);
    setOpenId(art.id);
    // let the browse view render first
    setTimeout(() => {
      articleRefs.current[art.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  // Highlight on word stems, so "deleting" lights up "delete" too.
  const tokens = useMemo(
    () => Array.from(new Set(queryWords(query).map(stem).filter((t) => t.length >= 2))),
    [query]
  );

  // Ranked, typo-tolerant search - see lib/help/search.ts.
  const results = useMemo(
    () => (query.trim() ? searchHelp(query).map((r) => r.article) : null),
    [query]
  );

  const openArticle = (art: HelpArticle) => {
    setActiveCat(art.category);
    setOpenId(art.id);
    setQuery("");
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${art.id}`);
    }
    setTimeout(() => {
      articleRefs.current[art.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const toggleArticle = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    if (typeof window !== "undefined" && openId !== id) {
      history.replaceState(null, "", `#${id}`);
    }
  };

  const catArticles = HELP_ARTICLES.filter((a) => a.category === activeCat);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Help &amp; FAQ</h1>
      <p style={styles.subtitle}>
        Step-by-step guides for every part of VIS BUILD. Search, or browse the sections below.
      </p>

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setResultOpenId(null);
        }}
        placeholder='Search help — e.g. "build a session", "share link", "squad report"'
        style={styles.search}
        autoFocus
      />

      {results ? (
        // ── search results ──────────────────────────────────────────────
        results.length ? (
          <div style={styles.resultsList}>
            <div style={styles.resultsCount}>
              {results.length} {results.length === 1 ? "result" : "results"}
            </div>
            {results.map((art) => {
              // Results open in place (like the browse cards), so the search
              // and the rest of the results stay put.
              const open = resultOpenId === art.id;
              return (
                <div key={art.id} style={styles.card}>
                  <button
                    style={styles.cardHead}
                    onClick={() => setResultOpenId(open ? null : art.id)}
                    aria-expanded={open}
                  >
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={styles.resultCat}>{CATEGORY_LABEL[art.category]}</span>
                      <span style={styles.resultTitle}>
                        <Highlight text={art.title} tokens={tokens} />
                      </span>
                      {!open && (
                        <span style={styles.resultSnippet}>
                          <Highlight text={snippetFor(art, tokens)} tokens={tokens} />
                        </span>
                      )}
                    </span>
                    <span style={styles.chevron}>{open ? "▲" : "▼"}</span>
                  </button>
                  {open && <ArticleBody article={art} />}
                </div>
              );
            })}
            <AgentPrompt text="Not what you're looking for?" onClick={openAgent} />
          </div>
        ) : (
          <div style={styles.noResults}>
            No help articles match “{query.trim()}”. Try different words, or ask our assistant.
            <AgentPrompt text="" onClick={openAgent} />
          </div>
        )
      ) : null}

      {!results && (
        // ── browse ────────────────────────────────────────────────────────
        <div style={styles.browse}>
          <nav style={styles.rail}>
            {HELP_CATEGORIES.map((c) => (
              <button
                key={c.id}
                style={{
                  ...styles.railItem,
                  ...(c.id === activeCat ? styles.railItemActive : {}),
                }}
                onClick={() => {
                  setActiveCat(c.id);
                  setOpenId(null);
                }}
              >
                <span style={{ marginRight: 8 }}>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </nav>

          <div style={styles.articleCol}>
            <h2 style={styles.catHeading}>
              {HELP_CATEGORIES.find((c) => c.id === activeCat)?.icon}{" "}
              {CATEGORY_LABEL[activeCat]}
            </h2>
            {catArticles.map((art) => {
              const open = openId === art.id;
              return (
                <div
                  key={art.id}
                  ref={(el) => {
                    articleRefs.current[art.id] = el;
                  }}
                  style={styles.card}
                >
                  <button style={styles.cardHead} onClick={() => toggleArticle(art.id)}>
                    <span style={{ flex: 1 }}>
                      <span style={styles.cardTitle}>{art.title}</span>
                      <span style={styles.cardSummary}>{art.summary}</span>
                    </span>
                    <span style={styles.chevron}>{open ? "▲" : "▼"}</span>
                  </button>
                  {open && <ArticleBody article={art} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={styles.footer}>
        Can&apos;t find what you need?{" "}
        <button style={styles.footerBtn} onClick={openAgent}>
          Speak to an agent
        </button>
        , email{" "}
        <a href="mailto:support@visbuild.co.uk" style={styles.footerLink}>
          support@visbuild.co.uk
        </a>
        , or ask in the{" "}
        <Link href="/forum" style={styles.footerLink}>
          Coach Forum
        </Link>
        .
      </div>

      {agentSeed !== null && (
        <SupportAgentChat
          initialQuestion={agentSeed}
          onClose={() => setAgentSeed(null)}
          onOpenArticle={(id) => {
            const art = HELP_ARTICLES.find((a) => a.id === id);
            if (!art) return;
            setAgentSeed(null);
            openArticle(art);
          }}
        />
      )}
    </div>
  );
}

function AgentPrompt({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div style={styles.agentPrompt}>
      {text && <span>{text}</span>}
      <button style={styles.agentBtn} onClick={onClick}>
        💬 Speak to an agent
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", margin: "4px 0 18px", maxWidth: 560 },
  search: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 14,
    marginBottom: 20,
  },

  // search results
  resultsList: { display: "flex", flexDirection: "column", gap: 8 },
  resultsCount: { fontSize: 12, color: "var(--mute)", marginBottom: 2 },
  resultCat: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--accent)",
  },
  resultTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  resultSnippet: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5 },
  noResults: {
    color: "var(--mute)",
    fontSize: 14,
    padding: "20px 0 8px",
  },

  // browse
  browse: { display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" },
  rail: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    width: 210,
    flexShrink: 0,
    position: "sticky",
    top: 0,
  },
  railItem: {
    display: "flex",
    alignItems: "center",
    textAlign: "left",
    padding: "9px 11px",
    borderRadius: 9,
    background: "transparent",
    border: "1px solid transparent",
    color: "var(--mute)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  railItemActive: {
    background: "var(--accent-dim)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
  },
  articleCol: { flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 10 },
  catHeading: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    margin: "2px 0 4px",
  },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" },
  cardHead: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: 14,
    cursor: "pointer",
  },
  cardTitle: { display: "block", fontSize: 14, fontWeight: 700, color: "var(--text)" },
  cardSummary: { display: "block", fontSize: 12, color: "var(--mute)", marginTop: 3, lineHeight: 1.5 },
  chevron: { fontSize: 10, color: "var(--mute)", marginTop: 3, flexShrink: 0 },

  // article body
  articleBody: {
    padding: "2px 16px 16px",
    borderTop: "1px solid var(--line)",
  },
  para: { fontSize: 13, color: "var(--mute)", lineHeight: 1.6, margin: "12px 0 0" },
  subhead: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    margin: "16px 0 0",
  },
  steps: {
    margin: "10px 0 0",
    paddingLeft: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  step: { fontSize: 13, color: "var(--mute)", lineHeight: 1.6 },
  tip: {
    display: "flex",
    gap: 10,
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 12.5,
    color: "var(--text)",
    lineHeight: 1.55,
    margin: "12px 0 0",
  },
  note: {
    display: "flex",
    gap: 10,
    background: "#2a1e00",
    border: "1px solid #F59E0B44",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 12.5,
    color: "#F5C15E",
    lineHeight: 1.55,
    margin: "12px 0 0",
  },
  calloutIcon: { flexShrink: 0 },

  footer: {
    marginTop: 28,
    paddingTop: 14,
    borderTop: "1px solid var(--line)",
    fontSize: 12.5,
    color: "var(--mute)",
  },
  footerLink: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 },
  footerBtn: { background: "transparent", border: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: "inherit", cursor: "pointer", fontFamily: "inherit" },
  agentPrompt: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 13, color: "var(--mute)" },
  agentBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
