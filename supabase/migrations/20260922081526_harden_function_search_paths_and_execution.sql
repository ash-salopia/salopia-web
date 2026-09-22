-- Harden database functions without changing their behaviour.
--
-- `public` remains first because existing function bodies intentionally use
-- unqualified application table names. The live project prevents anon and
-- authenticated roles from creating objects in this schema, so the explicit
-- path removes caller-controlled resolution without introducing shadowing.

begin;

alter function public.check_coach_seat_limit() set search_path = public, auth, extensions;
alter function public.check_seat_limit() set search_path = public, auth, extensions;
alter function public.coach_can_access_athlete(uuid) set search_path = public, auth, extensions;
alter function public.coach_owns_athlete_row(uuid, uuid) set search_path = public, auth, extensions;
alter function public.get_coach_public_profiles(uuid[]) set search_path = public, auth, extensions;
alter function public.is_active_coach() set search_path = public, auth, extensions;
alter function public.is_platform_admin() set search_path = public, auth, extensions;
alter function public.my_coach_role() set search_path = public, auth, extensions;
alter function public.my_organisation_id() set search_path = public, auth, extensions;
alter function public.set_referral_code() set search_path = public, auth, extensions;
alter function public.set_updated_at() set search_path = public, auth, extensions;

-- RLS helpers and deliberate client RPCs are authenticated-only. Revoke the
-- implicit PUBLIC grant first so anon does not inherit direct execution.
revoke execute on function public.coach_can_access_athlete(uuid) from public, anon;
revoke execute on function public.coach_owns_athlete_row(uuid, uuid) from public, anon;
revoke execute on function public.get_coach_public_profiles(uuid[]) from public, anon;
revoke execute on function public.is_active_coach() from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.my_coach_role() from public, anon;
revoke execute on function public.my_organisation_id() from public, anon;
revoke execute on function public.my_referral_summary() from public, anon;

grant execute on function public.coach_can_access_athlete(uuid) to authenticated, service_role;
grant execute on function public.coach_owns_athlete_row(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_coach_public_profiles(uuid[]) to authenticated, service_role;
grant execute on function public.is_active_coach() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.my_coach_role() to authenticated, service_role;
grant execute on function public.my_organisation_id() to authenticated, service_role;
grant execute on function public.my_referral_summary() to authenticated, service_role;

-- This RPC intentionally resolves a public referral code to an organisation
-- name before sign-up. Preserve that narrow anonymous use, but remove the
-- blanket PUBLIC grant.
revoke execute on function public.resolve_referral_code(text) from public;
grant execute on function public.resolve_referral_code(text) to anon, authenticated, service_role;

-- Trigger-only and internal seeding functions never need direct Data API
-- execution. Their owning role can still invoke them through their triggers.
revoke execute on function public.check_coach_seat_limit() from public, anon, authenticated;
revoke execute on function public.check_seat_limit() from public, anon, authenticated;
revoke execute on function public.forum_bump_thread_activity() from public, anon, authenticated;
revoke execute on function public.forum_guard_pin() from public, anon, authenticated;
revoke execute on function public.gen_referral_code() from public, anon, authenticated;
revoke execute on function public.seed_fms_battery(uuid) from public, anon, authenticated;
revoke execute on function public.set_direct_message_organisation() from public, anon, authenticated;
revoke execute on function public.set_referral_code() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.trg_seed_fms_battery() from public, anon, authenticated;

commit;
