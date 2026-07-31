// How an athlete's name should render in the shared Community feed
// (PBs, comments, reactions, group chat, competitions) when they've
// opted into first-name-only. Never mutates the stored name — only
// used at the point of returning/writing feed-facing data.
export function feedDisplayName(fullName: string, firstNameOnly: boolean | null | undefined): string {
  if (!firstNameOnly) return fullName;
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName;
}
