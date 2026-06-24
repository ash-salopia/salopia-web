import { notFound } from "next/navigation";
import { getAthleteByShareToken, getAthleteSessions } from "@/lib/data/athlete-share-link";
import AthleteLinkShell from "@/components/AthleteLinkShell";

export default async function AthleteLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const athlete = await getAthleteByShareToken(token);
  // Deliberately the same 404 page whether the token is malformed,
  // expired (regenerated), or never existed — never reveal which,
  // since that distinction could help someone probe for valid tokens.
  if (!athlete) notFound();

  const sessions = await getAthleteSessions(athlete.id);

  return <AthleteLinkShell athlete={athlete} sessions={sessions} token={token} />;
}
