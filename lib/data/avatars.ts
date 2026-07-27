// Coach-side avatar upload. Goes through service-role API routes
// rather than a direct browser-to-storage call — authenticated-role
// uploads to Supabase Storage don't work reliably in this project
// (see the comment in app/api/documents/route.ts), so every upload
// path here follows that same established, working pattern instead.

export async function updateCoachAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/coach-avatar", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.avatar_url;
}

export async function updateAthleteAvatar(athleteId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("athlete_id", athleteId);
  formData.append("file", file);
  const res = await fetch("/api/athlete-avatar", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.avatar_url;
}
