import { createClient } from "@/lib/supabase-browser";

export type FeatureRequestCategory =
  | "general" | "programming" | "testing" | "reporting" | "athlete_app" | "other";
export type FeatureRequestStatus =
  | "open" | "planned" | "in_progress" | "done" | "closed";

export interface FeatureRequestComment {
  id: string;
  request_id: string;
  coach_id: string;
  body: string;
  created_at: string;
  coach?: { name: string } | null;
}

export interface FeatureRequest {
  id: string;
  coach_id: string;
  title: string;
  description: string;
  category: FeatureRequestCategory;
  status: FeatureRequestStatus;
  created_at: string;
  coach?: { name: string } | null;
  votes: { coach_id: string }[];
  comments: FeatureRequestComment[];
}

// Explicit FK names below are required, not stylistic - feature_request_votes
// has both request_id and coach_id as its primary key, which PostgREST reads
// as a many-to-many bridge between feature_requests and coaches, making a
// plain "coaches(name)" embed ambiguous with the direct coach_id FK.
const SELECT_SHAPE =
  "*, coach:coaches!feature_requests_coach_id_fkey(name), votes:feature_request_votes(coach_id), comments:feature_request_comments(*, coach:coaches!feature_request_comments_coach_id_fkey(name))";

export type RequestSort = "top" | "new";

// Global board — every coach across every organisation reads the
// same list (see 0068_feature_requests.sql for why this is the one
// table in the schema that isn't org-scoped). Sorting by vote count
// happens client-side since it depends on the embedded votes array
// length, not a real column Postgres can order by directly.
export async function listFeatureRequests(sort: RequestSort = "top"): Promise<FeatureRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .select(SELECT_SHAPE)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as FeatureRequest[];
  for (const r of rows) {
    r.comments = (r.comments ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
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
  return data as unknown as FeatureRequest;
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
    .select("*, coach:coaches!feature_request_comments_coach_id_fkey(name)")
    .single();
  if (error) throw error;
  return data as unknown as FeatureRequestComment;
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
