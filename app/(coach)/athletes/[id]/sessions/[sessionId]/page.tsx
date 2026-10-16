"use client";

import { useRouter, useParams } from "next/navigation";
import SessionEditor from "@/components/SessionEditor";

// Full-page session editor. The editor itself lives in
// components/SessionEditor.tsx so the athlete calendar can also open it
// as a pop-up (SessionEditorModal).
export default function SessionDetailPage() {
  const router = useRouter();
  const { id: athleteId, sessionId } = useParams<{ id: string; sessionId: string }>();
  return (
    <SessionEditor
      key={sessionId}
      athleteId={athleteId}
      sessionId={sessionId}
      onBack={() => router.push(`/athletes/${athleteId}`)}
      onOpenSession={(sid) => router.push(`/athletes/${athleteId}/sessions/${sid}`)}
    />
  );
}
