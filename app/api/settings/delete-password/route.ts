import { NextRequest, NextResponse } from "next/server";
import { getAthleteDeleteAccess } from "@/lib/athlete-delete-access";
import { hashDeletePassword, verifyDeletePassword, MIN_DELETE_PASSWORD_LENGTH } from "@/lib/delete-password";

export const dynamic = "force-dynamic";

// POST { newPassword, currentPassword? } - owner only. Sets or changes
// the org's athlete-delete password (org_secrets, 0114). Changing an
// existing one needs the current one, so a borrowed logged-in session
// alone can't quietly reset it.
export async function POST(req: NextRequest) {
  const access = await getAthleteDeleteAccess();
  if (!access) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!access.isOwner) {
    return NextResponse.json({ error: "Only the organisation owner can change the delete password" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

  if (newPassword.length < MIN_DELETE_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `The delete password needs at least ${MIN_DELETE_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (access.passwordHash && !(await verifyDeletePassword(currentPassword, access.passwordHash))) {
    return NextResponse.json({ error: "Current delete password is incorrect." }, { status: 403 });
  }

  const { error } = await access.service.from("org_secrets").upsert({
    organisation_id: access.coach.organisation_id,
    athlete_delete_password_hash: await hashDeletePassword(newPassword),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[settings/delete-password]", error);
    return NextResponse.json({ error: "Could not save the delete password." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
