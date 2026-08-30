import { createClient } from "@/lib/supabase-browser";
import { resolveCoachProfiles, type CoachProfile } from "@/lib/data/feature-requests";

// The Coach Forum (0085_coach_forum.sql). Global across every
// organisation, same as the feature-requests board — author names are
// resolved via the get_coach_public_profiles RPC (0069), reused here
// through resolveCoachProfiles().

export type ForumRoomKind = "discussion" | "journal_club" | "feature_requests";
export type ForumSort = "active" | "top" | "new";

export type JcSourceType =
  | "article" | "chapter" | "conference" | "seminar" | "podcast" | "other";

export const JC_SOURCE_LABEL: Record<JcSourceType, string> = {
  article: "Journal article",
  chapter: "Book chapter",
  conference: "Conference",
  seminar: "Seminar / workshop",
  podcast: "Podcast",
  other: "Other",
};

export interface ForumRoom {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  kind: ForumRoomKind;
  sort_order: number;
  archived: boolean;
}

export interface ForumReply {
  id: string;
  thread_id: string;
  coach_id: string;
  body: string;
  edited_at: string | null;
  created_at: string;
  coach?: CoachProfile | null;
}

export interface ForumThread {
  id: string;
  room_id: string;
  coach_id: string;
  title: string;
  body: string;
  pinned: boolean;
  edited_at: string | null;
  jc_source_type: JcSourceType | null;
  jc_reference: string | null;
  jc_takeaways: string | null;
  created_at: string;
  last_activity_at: string;
  coach?: CoachProfile | null;
  votes: { coach_id: string }[];
  replyCount: number;
  replies?: ForumReply[];
}

// ── Rooms ────────────────────────────────────────────────────────────

export async function listRooms(): Promise<ForumRoom[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forum_rooms")
    .select("*")
    .eq("archived", false)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ForumRoom[];
}

export async function createRoom(patch: {
  slug: string; name: string; description?: string; icon?: string; kind?: ForumRoomKind; sort_order?: number;
}): Promise<ForumRoom> {
  const supabase = createClient();
  const { data, error } = await supabase.from("forum_rooms").insert({
    slug: patch.slug.trim(),
    name: patch.name.trim(),
    description: patch.description?.trim() ?? "",
    icon: patch.icon?.trim() || "💬",
    kind: patch.kind ?? "discussion",
    sort_order: patch.sort_order ?? 100,
  }).select("*").single();
  if (error) throw error;
  return data as ForumRoom;
}

export async function updateRoom(
  id: string,
  patch: Partial<Pick<ForumRoom, "name" | "description" | "icon" | "sort_order" | "archived">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("forum_rooms").update(patch).eq("id", id);
  if (error) throw error;
}

export async function reorderRooms(orderedIds: string[]): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    orderedIds.map((id, i) => supabase.from("forum_rooms").update({ sort_order: i }).eq("id", id))
  );
}

// ── Threads ──────────────────────────────────────────────────────────

const THREAD_SHAPE =
  "*, votes:forum_thread_votes(coach_id), replies:forum_replies(count)";

function normaliseThread(row: any): ForumThread {
  const replyAgg = Array.isArray(row.replies) ? row.replies[0] : row.replies;
  return {
    ...row,
    votes: row.votes ?? [],
    replyCount: replyAgg?.count ?? 0,
    replies: undefined,
  };
}

export async function listThreads(roomId: string, sort: ForumSort = "active"): Promise<ForumThread[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forum_threads")
    .select(THREAD_SHAPE)
    .eq("room_id", roomId)
    .order("last_activity_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []).map(normaliseThread);
  const profiles = await resolveCoachProfiles(supabase, rows.map((r) => r.coach_id));
  for (const r of rows) r.coach = profiles.get(r.coach_id) ?? null;

  rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "top") return (b.votes.length - a.votes.length) || (b.last_activity_at < a.last_activity_at ? -1 : 1);
    if (sort === "new") return a.created_at < b.created_at ? 1 : -1;
    return a.last_activity_at < b.last_activity_at ? 1 : -1; // active
  });
  return rows;
}

export async function getThread(threadId: string): Promise<ForumThread> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forum_threads")
    .select("*, votes:forum_thread_votes(coach_id), replies:forum_replies(*)")
    .eq("id", threadId)
    .single();
  if (error) throw error;

  const thread = { ...(data as any), votes: (data as any).votes ?? [], replyCount: ((data as any).replies ?? []).length } as ForumThread;
  const replies = ((data as any).replies ?? []).slice().sort(
    (a: ForumReply, b: ForumReply) => a.created_at.localeCompare(b.created_at)
  ) as ForumReply[];

  const ids = [thread.coach_id, ...replies.map((r) => r.coach_id)];
  const profiles = await resolveCoachProfiles(supabase, ids);
  thread.coach = profiles.get(thread.coach_id) ?? null;
  for (const r of replies) r.coach = profiles.get(r.coach_id) ?? null;
  thread.replies = replies;
  return thread;
}

export async function createThread(
  roomId: string,
  patch: { title: string; body: string; jcSourceType?: JcSourceType | null; jcReference?: string; jcTakeaways?: string }
): Promise<ForumThread> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const coachId = auth.user?.id;
  if (!coachId) throw new Error("Not signed in");

  const { data, error } = await supabase.from("forum_threads").insert({
    room_id: roomId,
    coach_id: coachId,
    title: patch.title.trim(),
    body: patch.body.trim(),
    jc_source_type: patch.jcSourceType ?? null,
    jc_reference: patch.jcReference?.trim() || null,
    jc_takeaways: patch.jcTakeaways?.trim() || null,
  }).select("*, votes:forum_thread_votes(coach_id)").single();
  if (error) throw error;

  const thread = { ...(data as any), votes: [], replyCount: 0, replies: [] } as ForumThread;
  const profiles = await resolveCoachProfiles(supabase, [coachId]);
  thread.coach = profiles.get(coachId) ?? null;
  return thread;
}

export async function updateThread(
  id: string,
  patch: { title?: string; body?: string; jcSourceType?: JcSourceType | null; jcReference?: string | null; jcTakeaways?: string | null; pinned?: boolean }
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = { edited_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.body !== undefined) row.body = patch.body.trim();
  if (patch.jcSourceType !== undefined) row.jc_source_type = patch.jcSourceType;
  if (patch.jcReference !== undefined) row.jc_reference = patch.jcReference?.trim() || null;
  if (patch.jcTakeaways !== undefined) row.jc_takeaways = patch.jcTakeaways?.trim() || null;
  if (patch.pinned !== undefined) row.pinned = patch.pinned;
  const { error } = await supabase.from("forum_threads").update(row).eq("id", id);
  if (error) throw error;
}

export async function setThreadPinned(id: string, pinned: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("forum_threads").update({ pinned }).eq("id", id);
  if (error) throw error;
}

export async function deleteThread(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("forum_threads").delete().eq("id", id);
  if (error) throw error;
}

// ── Replies ──────────────────────────────────────────────────────────

export async function addReply(threadId: string, body: string): Promise<ForumReply> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const coachId = auth.user?.id;
  if (!coachId) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("forum_replies")
    .insert({ thread_id: threadId, coach_id: coachId, body: body.trim() })
    .select("*")
    .single();
  if (error) throw error;
  const reply = data as ForumReply;
  const profiles = await resolveCoachProfiles(supabase, [coachId]);
  reply.coach = profiles.get(coachId) ?? null;
  return reply;
}

export async function updateReply(id: string, body: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("forum_replies")
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteReply(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("forum_replies").delete().eq("id", id);
  if (error) throw error;
}

// ── Votes ────────────────────────────────────────────────────────────

export async function toggleThreadVote(threadId: string, coachId: string, currentlyVoted: boolean): Promise<void> {
  const supabase = createClient();
  if (currentlyVoted) {
    const { error } = await supabase
      .from("forum_thread_votes")
      .delete()
      .eq("thread_id", threadId)
      .eq("coach_id", coachId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("forum_thread_votes")
      .insert({ thread_id: threadId, coach_id: coachId });
    if (error) throw error;
  }
}
