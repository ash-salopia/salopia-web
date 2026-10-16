import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { callClaude, AI_MODEL } from "@/lib/ai/claude";
import { searchHelp } from "@/lib/help/search";
import { HELP_CATEGORIES, type HelpArticle } from "@/lib/help/content";
import { helpPageContext } from "@/lib/help/page-context";

export const dynamic = "force-dynamic";

// Help page "Speak to an agent". Retrieval first: lib/help/search.ts picks
// the few most relevant help articles and only those go to the model, so
// each question costs a fraction of a penny. Every question is logged to
// support_agent_messages (0115) - that's also the daily cap's counter.

const DAILY_LIMIT = 25;
const MAX_ARTICLES = 5;
const MAX_TURNS = 6;
const MAX_CHARS = 1500;

const SYSTEM = `You are the support assistant inside VIS BUILD, a coaching platform for sports coaches. You're talking to a coach in their dashboard.

Answer ONLY from the help articles provided in the coach's message. Never invent buttons, menus, settings or features that the articles don't mention. If the articles don't answer the question, say plainly that you're not sure and suggest they tap "Email support" below the chat - don't guess.

Style: friendly, short and direct, UK English. Give click-by-click steps as a numbered list when the article has them. Wrap on-screen labels and button names in **double asterisks**. No headings, no tables.

End every reply with one final line in exactly this form, listing the ids of the articles you actually used:
SOURCES: id-one, id-two
or, if none of the articles answered the question:
SOURCES: none`;

const CATEGORY_LABEL = new Map(HELP_CATEGORIES.map((c) => [c.id, c.label]));

function articleForPrompt(a: HelpArticle): string {
  const body = a.body
    .map((b) => {
      if (b.type === "steps") return b.items.map((it, i) => `${i + 1}. ${it}`).join("\n");
      if (b.type === "note") return `Note: ${b.text}`;
      if (b.type === "tip") return `Tip: ${b.text}`;
      return b.text;
    })
    .join("\n");
  return `<article id="${a.id}" title="${a.title}" section="${CATEGORY_LABEL.get(a.category) ?? a.category}">\n${a.summary}\n${body}\n</article>`;
}

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, organisation_id")
    .eq("id", user.id)
    .single();
  if (!coach) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const turns: Turn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m: unknown): m is Turn =>
        !!m &&
        typeof m === "object" &&
        ((m as Turn).role === "user" || (m as Turn).role === "assistant") &&
        typeof (m as Turn).content === "string" &&
        (m as Turn).content.trim().length > 0
    )
    .slice(-MAX_TURNS)
    .map((m: Turn) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  // The API needs the conversation to start with the coach and end on
  // their new question.
  while (turns.length && turns[0].role !== "user") turns.shift();
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from("support_agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coach.id)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "You've reached today's limit for the assistant. Tap Email support and we'll help directly." },
      { status: 429 }
    );
  }

  // Which page they asked from ("Need Help?" in the header) - favours
  // that section's articles and tells the AI where they are.
  const page = helpPageContext(typeof body.page === "string" ? body.page : null);
  const searchOpts = { boostCategories: page?.categories };

  // Search on the new question plus the previous one, so a follow-up like
  // "and on my phone?" still finds the right articles.
  const userTurns = turns.filter((t) => t.role === "user");
  let hits = searchHelp(userTurns.slice(-2).map((t) => t.content).join(" "), MAX_ARTICLES, searchOpts);
  if (!hits.length) hits = searchHelp(last.content, MAX_ARTICLES, searchOpts);
  const articles = hits.map((h) => h.article);

  const context = articles.length
    ? `Help articles that may be relevant:\n\n${articles.map(articleForPrompt).join("\n\n")}`
    : "No help articles matched this question.";

  const where = page ? `The coach is currently on ${page.label}.\n\n` : "";
  const messages = turns.map((t, i) =>
    i === turns.length - 1 ? { role: t.role, content: `${context}\n\n${where}Coach's question: ${t.content}` } : t
  );

  const result = await callClaude({
    model: AI_MODEL.support,
    system: SYSTEM,
    maxTokens: 900,
    messages,
  });
  if (!result.ok) {
    console.error("[support-agent]", result.error);
    return NextResponse.json(
      { error: "The assistant isn't available right now. Tap Email support and we'll help directly." },
      { status: 502 }
    );
  }

  // Split off the SOURCES line; only keep ids we actually sent.
  const sourcesMatch = result.text.match(/\n?\s*SOURCES:\s*(.*)\s*$/i);
  const answer = (sourcesMatch ? result.text.slice(0, sourcesMatch.index) : result.text).trim();
  const sentIds = new Set(articles.map((a) => a.id));
  const usedIds = (sourcesMatch?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((id) => sentIds.has(id));
  const sources = articles.filter((a) => usedIds.includes(a.id)).map((a) => ({ id: a.id, title: a.title }));
  const answered = usedIds.length > 0;

  const { data: logged, error: logError } = await service
    .from("support_agent_messages")
    .insert({
      organisation_id: coach.organisation_id,
      coach_id: coach.id,
      question: last.content,
      answer,
      article_ids: usedIds,
      answered,
    })
    .select("id")
    .single();
  if (logError) console.error("[support-agent] log failed", logError);

  // id lets the coach rate this answer (PATCH below); null if logging failed.
  return NextResponse.json({ id: logged?.id ?? null, answer, sources, answered });
}

// PATCH { id, helpful: boolean } - the coach's 👍/👎 on an answer.
// Only their own answers can be rated.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || typeof body.helpful !== "boolean") {
    return NextResponse.json({ error: "Missing id or helpful" }, { status: 400 });
  }

  const { error } = await createServiceRoleClient()
    .from("support_agent_messages")
    .update({ helpful: body.helpful })
    .eq("id", body.id)
    .eq("coach_id", user.id);
  if (error) {
    console.error("[support-agent] feedback failed", error);
    return NextResponse.json({ error: "Could not save feedback" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
