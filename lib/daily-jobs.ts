import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { sendEmail, simpleEmailHtml, escapeHtml } from "@/lib/email";
import { sendPushToCoaches } from "@/lib/push/send";

// Once-a-day coach jobs, run from the existing morning cron (Vercel's
// Hobby plan allows only two cron entries, both already used). Each job
// remembers what it has already done, so running more often is safe.

/** Report schedules (0123) that have come due: email + push the coach. */
export async function runReportReminders(origin: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: due, error } = await supabase
    .from("report_schedules")
    .select("id, athlete_id, organisation_id, created_by, every_weeks, next_due, last_reminded_at, athletes(name, archived)")
    .eq("active", true)
    .lte("next_due", today);
  if (error || !due?.length) return 0;

  let sent = 0;
  for (const s of due) {
    // Once per due date.
    if (s.last_reminded_at && String(s.last_reminded_at).slice(0, 10) >= s.next_due) continue;
    const ath = (Array.isArray(s.athletes) ? s.athletes[0] : s.athletes) as { name: string; archived?: boolean } | null;
    if (!ath || ath.archived) continue;

    // The coach who set it up; failing that, every coach in the org.
    let coachIds: string[] = s.created_by ? [s.created_by] : [];
    if (!coachIds.length) {
      const { data: cs } = await supabase.from("coaches").select("id").eq("organisation_id", s.organisation_id);
      coachIds = (cs ?? []).map((c) => c.id);
    }
    const { data: coaches } = await supabase.from("coaches").select("id, name, email").in("id", coachIds);
    const url = `${origin}/athletes/${s.athlete_id}?scheduledReport=1`;

    await sendPushToCoaches(coachIds, {
      title: `${ath.name}'s report is due`,
      body: "It's ready to check and send.",
      url: `/athletes/${s.athlete_id}?scheduledReport=1`,
    }).catch(() => {});

    for (const c of coaches ?? []) {
      if (!c.email) continue;
      await sendEmail({
        to: [c.email],
        subject: `${ath.name}'s training report is due`,
        html: simpleEmailHtml({
          brand: "VIS BUILD",
          heading: `${ath.name}'s ${s.every_weeks}-weekly report is due`,
          paragraphs: [
            `Hi ${escapeHtml(String(c.name || "coach").split(" ")[0])},`,
            `${escapeHtml(ath.name)}'s training report is ready to build. Open it to check the Coach's Verdict, then send it in one click.`,
          ],
          button: { label: "Open the report", url },
          footer: "You set this schedule in the athlete's Reports options. You can change or turn it off there.",
        }),
        text: `${ath.name}'s training report is due. Open it here: ${url}`,
      });
    }

    await supabase.from("report_schedules").update({ last_reminded_at: new Date().toISOString() }).eq("id", s.id);
    sent++;
  }
  return sent;
}

export async function runDailyCoachJobs(origin: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    out.reportReminders = await runReportReminders(origin);
  } catch (e) {
    console.error("[daily-jobs] report reminders failed", e);
  }
  return out;
}
