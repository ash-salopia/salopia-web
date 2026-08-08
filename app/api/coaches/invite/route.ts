import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

async function getOwner(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches")
    .select("id, organisation_id, role")
    .eq("id", user.id)
    .single();
  if (!coach || coach.role !== "owner") return null;
  return coach;
}

export async function POST(req: NextRequest) {
  const { origin } = new URL(req.url);
  const supabase = await createClient();
  const owner = await getOwner(supabase);
  if (!owner) {
    return NextResponse.json({ error: "Only the organisation owner can invite coaches" }, { status: 403 });
  }

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // Every auth.users row in this app is a coach — one row can only
  // ever belong to one organisation, so an email already tied to a
  // coaches row (anywhere) can't be freshly invited. Give a precise,
  // friendly message for each case rather than surfacing whatever raw
  // error inviteUserByEmail would throw.
  const { data: existingCoach } = await service
    .from("coaches")
    .select("organisation_id, accepted_at")
    .eq("email", email)
    .maybeSingle();

  if (existingCoach) {
    if (existingCoach.organisation_id !== owner.organisation_id) {
      return NextResponse.json(
        { error: "This email is already registered to a coach account in another organisation" },
        { status: 409 }
      );
    }
    if (!existingCoach.accepted_at) {
      return NextResponse.json({ error: "This coach already has a pending invite" }, { status: 409 });
    }
    return NextResponse.json({ error: "This person is already a coach in your organisation" }, { status: 409 });
  }

  // App-level seat check before we send anything — avoids emailing an
  // invite (and creating an unconfirmed auth user) that would just get
  // rejected by the DB trigger a moment later.
  const { data: org } = await service
    .from("organisations")
    .select("coach_seat_limit")
    .eq("id", owner.organisation_id)
    .single();
  if (org?.coach_seat_limit != null) {
    const { count } = await service
      .from("coaches")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", owner.organisation_id);
    if ((count ?? 0) >= org.coach_seat_limit) {
      return NextResponse.json(
        { error: "You've reached the coach limit for your current plan. Contact support to add seats." },
        { status: 403 }
      );
    }
  }

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
  });
  if (inviteError || !invited.user) {
    // Backstop for the same "already registered" case above, in case
    // of a race between the pre-check and this call.
    if (inviteError?.message?.toLowerCase().includes("already")) {
      return NextResponse.json({ error: "This email is already registered to a coach account" }, { status: 409 });
    }
    return NextResponse.json({ error: inviteError?.message ?? "Could not send invite" }, { status: 500 });
  }

  const { data: coachRow, error: coachError } = await service
    .from("coaches")
    .insert({
      id: invited.user.id,
      organisation_id: owner.organisation_id,
      role: "coach",
      email,
      name,
      accepted_at: null,
    })
    .select("id, name, email, role, accepted_at")
    .single();

  if (coachError) {
    // Clean up the auth user we just created so this email isn't left
    // in limbo — inviteUserByEmail has no supported resend path once
    // an auth.users row exists, so a dangling one here would silently
    // block ever inviting this email again.
    await service.auth.admin.deleteUser(invited.user.id);
    if (coachError.message.includes("COACH_SEAT_LIMIT_REACHED")) {
      return NextResponse.json(
        { error: "You've reached the coach limit for your current plan. Contact support to add seats." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: coachError.message }, { status: 500 });
  }

  return NextResponse.json({ coach: coachRow });
}
