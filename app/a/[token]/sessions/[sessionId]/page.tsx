import { notFound } from "next/navigation";
import { getAthleteByShareToken, getAthleteSessions } from "@/lib/data/athlete-share-link";
import AthleteSessionView from "@/components/AthleteSessionView";

export default async function AthleteLinkSessionPage({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) notFound();

  const sessions = await getAthleteSessions(athlete.id);
  const session = sessions.find((s) => s.id === sessionId);
  // Same reasoning as the athlete lookup: if this session doesn't
  // belong to this athlete (wrong ID, or someone else's session
  // entirely), treat it identically to "doesn't exist" — never
  // confirm or deny that a given session ID is real but just
  // inaccessible, since that's information leakage too.
  if (!session) notFound();

  return <AthleteSessionView session={session} athleteName={athlete.name} token={token} />;
}
