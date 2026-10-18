import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";

// Which messaging an athlete currently has (0121), for the athlete-link
// routes. Mirrors the SQL functions athlete_direct_messages_enabled /
// group_chat_enabled, which are what actually block writes; this is
// just so the athlete app can hide what's off instead of erroring.
// Before 0121 is run the columns read as undefined, which counts as on.
export interface MessagingAccess {
  directMessages: boolean;
  /** Account and athlete switches both on (groups still checked one by one). */
  groupChat: boolean;
  /** Groups the athlete is in whose chat is open to them. */
  chatGroupIds: Set<string>;
}

export async function getMessagingAccess(athlete: { id: string } & Record<string, any>): Promise<MessagingAccess> {
  const supabase = createServiceRoleClient();
  const [settings, { data: memberships }] = await Promise.all([
    getOrgSettingsForAthlete(athlete.id),
    supabase.from("group_members").select("group_id, groups(*)").eq("athlete_id", athlete.id),
  ]);
  const groups = (memberships ?? [])
    .map((m: any) => (Array.isArray(m.groups) ? m.groups[0] : m.groups))
    .filter(Boolean);

  const directMessages =
    settings.direct_messages_enabled !== false &&
    athlete.direct_messages_enabled !== false &&
    !groups.some((g: any) => g.direct_messages_enabled === false);
  const groupChat = settings.group_chat_enabled !== false && athlete.group_chat_enabled !== false;
  const chatGroupIds = new Set<string>(
    groupChat ? groups.filter((g: any) => g.chat_enabled !== false).map((g: any) => g.id) : []
  );
  return { directMessages, groupChat, chatGroupIds };
}
