import { createClient } from "@/lib/supabase-browser";

export type FeatureRequestCategory =
  | "general" | "programming" | "testing" | "reporting" | "athlete_app" | "other";
export type FeatureRequestStatus =
  | "open" | "planned" | "in_progress" | "done" | "closed";

export interface CoachProfile {
  name: string;
  is_app_admin: boolean;
}

export interface FeatureRequestComment {
  id: string;
  request_id: string;
  coach_id: string;
  body: string;
  created_at: string;
  coach?: CoachProfile | null;
}

export interface FeatureRequest {
  id: string;
  coach_id: string;
  title: string;
  description: string;
  category: FeatureRequestCategory;
  status: FeatureRequestStatus;
  created_at: string;
  coach?: CoachProfile | null;
  votes: { coach_id: string }[];
  comments: FeatureRequestComment[];
}

// This board is global across every organisation (see
// 0068_feature_requests.sql), but coaches.RLS only lets a coach see
// colleagues in their OWN org - a plain embedded "coaches(name)"
// select would silently resolve to nothing for a request/comment
// posted by a coach in a different org. get_coach_public_profiles
// (0069) is a narrow SECURITY DEFINER function exposing just
// name/is_app_admin for any coach id, so author names resolve
// correctly regardless of which org posted them.
async function resolveCoachProfiles(
  supabase: ReturnType<typeof createClient>,
  coachIds: string[]
): Promise<Map<string, CoachProfile>> {
  const unique = [...new Set(coachIds)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("get_coach_public_profiles", { coach_ids: unique });
  if (error) throw error;
  return new Map((data ?? []).map((c: any) => [c.id, { name: c.name, is_app_admin: c.is_app_admin }]));
}

const SELECT_SHAPE = "*, votes:feature_request_votes(coach_id), comments:feature_request_comments(*)";

function attachProfiles(rows: FeatureRequest[], profiles: Map<string, CoachProfile>) {
  for (const r of rows) {
    r.coach = profiles.get(r.coach_id) ?? null;
    r.comments = (r.comments ?? [])
      .map((c) => ({ ...c, coach: profiles.get(c.coach_id) ?? null }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}

export type RequestSort = "top" | "new";

// Sorting by vote count happens client-side since it depends on the
// embedded votes array length, not a real column Postgres can order
// by directly.
export async function listFeatureRequests(sort: RequestSort = "top"): Promise<FeatureRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .select(SELECT_SHAPE)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as FeatureRequest[];

  const ids = rows.flatMap((r) => [r.coach_id, ...(r.comments ?? []).map((c) => c.coach_id)]);
  attachProfiles(rows, await resolveCoachProfiles(supabase, ids));

  if (sort === "top") {
    rows.sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0));
  }
  return rows;
}

export async function createFeatureRequest(
  title: string,
  description: string,
  category: FeatureRequestCategory
): Promise<FeatureRequest> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const coachId = auth.user?.id;
  if (!coachId) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("feature_requests")
    .insert({ coach_id: coachId, title: title.trim(), description: description.trim(), category })
    .select(SELECT_SHAPE)
    .single();
  if (error) throw error;
  const row = data as unknown as FeatureRequest;
  attachProfiles([row], await resolveCoachProfiles(supabase, [coachId]));
  return row;
}

export async function toggleVote(requestId: string, coachId: string, currentlyVoted: boolean): Promise<void> {
  const supabase = createClient();
  if (currentlyVoted) {
    const { error } = await supabase
      .from("feature_request_votes")
      .delete()
      .eq("request_id", requestId)
      .eq("coach_id", coachId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("feature_request_votes")
      .insert({ request_id: requestId, coach_id: coachId });
    if (error) throw error;
  }
}

export async function addComment(requestId: string, coachId: string, body: string): Promise<FeatureRequestComment> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("feature_request_comments")
    .insert({ request_id: requestId, coach_id: coachId, body: body.trim() })
    .select("*")
    .single();
  if (error) throw error;
  const comment = data as unknown as FeatureRequestComment;
  const profiles = await resolveCoachProfiles(supabase, [coachId]);
  comment.coach = profiles.get(coachId) ?? null;
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("feature_request_comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function deleteFeatureRequest(requestId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("feature_requests").delete().eq("id", requestId);
  if (error) throw error;
}

// Only succeeds server-side (RLS) if the current coach has
// is_app_admin set — see 0068_feature_requests.sql. The UI only shows
// the control at all when it already knows that, but RLS is the real
// enforcement either way.
export async function updateRequestStatus(requestId: string, status: FeatureRequestStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("feature_requests").update({ status }).eq("id", requestId);
  if (error) throw error;
}
