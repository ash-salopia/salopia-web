import { notFound } from "next/navigation";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import AthleteSessionView from "@/components/AthleteSessionView";

// Do NOT fetch sessions server-side here. The server cache may not include
// sessions recently added by the coach, causing notFound() to fire for valid
// sessions. Instead, pass sessionId down to AthleteSessionView which fetches
// client-side from /api/athlete-link/sessions (always fresh).
export const dynamic = "force-dynamic";

export default async function AthleteLinkSessionPage({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;

  // Still validate the token server-side — never let an invalid token
  // reach the client component where it could be probed.
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) notFound();

  return (
    <AthleteSessionView
      sessionId={sessionId}
      athleteName={athlete.name}
      token={token}
    />
  );
}
