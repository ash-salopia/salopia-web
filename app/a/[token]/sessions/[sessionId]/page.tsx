import { notFound } from "next/navigation";
import { getAthleteByShareToken, getAthleteSessions } from "@/lib/data/athlete-share-link";
import AthleteSessionView from "@/components/AthleteSessionView";

export const dynamic = "force-dynamic";

export default async function AthleteLinkSessionPage({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) notFound();

  // Try to find the session server-side. For sessions recently added by
  // the coach the server cache may miss them — in that case pass undefined
  // and let AthleteSessionView client-fetch via /api/athlete-link/sessions.
  let session;
  try {
    const sessions = await getAthleteSessions(athlete.id);
    session = sessions.find((s) => s.id === sessionId);
  } catch {
    session = undefined;
  }

  return (
    <AthleteSessionView
      session={session}
      sessionId={sessionId}
      athleteName={athlete.name}
      token={token}
    />
  );
}
