// What a coach is allowed to do, from their coaches row and the org's
// settings (0134 - Settings -> Coach permissions, and the per-coach
// switches in Settings -> Team). Pure, so the coach layout (server),
// API routes and client components all use the same rules.
//
// The owner is never restricted, except that export_access "off"
// means nobody downloads data - the owner included.

export type ExportAccess = "off" | "owner" | "all";

export interface CoachPermissions {
  isOwner: boolean;
  canExport: boolean; // raw CSV/JSON export, testing CSV, report ZIPs
  canMessage: boolean; // 1-to-1 messages, group chat, announcements
  canSeeContacts: boolean; // athletes' contact email
  canDeleteAthletes: boolean; // still needs the delete password (0114)
}

export const FULL_PERMISSIONS: CoachPermissions = {
  isOwner: true,
  canExport: true,
  canMessage: true,
  canSeeContacts: true,
  canDeleteAthletes: true,
};

export function exportAccessOf(settings: { export_access?: unknown } | null | undefined): ExportAccess {
  const v = settings?.export_access;
  return v === "off" || v === "all" ? v : "owner";
}

export function coachPermissions(
  coach: { role?: string | null; can_export?: boolean | null; can_message?: boolean | null } | null | undefined,
  settings: Record<string, unknown> | null | undefined
): CoachPermissions {
  const isOwner = coach?.role === "owner";
  const access = exportAccessOf(settings);
  return {
    isOwner,
    canExport: access === "all" || (access === "owner" && (isOwner || coach?.can_export === true)),
    canMessage: isOwner || coach?.can_message !== false,
    canSeeContacts: isOwner || settings?.coaches_see_contact_details !== false,
    canDeleteAthletes: isOwner || settings?.coaches_can_delete_athletes === true,
  };
}

export const EXPORT_BLOCKED_MESSAGE = "Downloading data is turned off for your account. Ask the account owner if you need it.";
export const MESSAGING_BLOCKED_MESSAGE = "The account owner has turned off messaging for you.";
