export type ScheduleRecipient = {email: string; name: string; enabled: boolean; source: string};

/** AD users can be selected individually; saved freight preferences take precedence. */
export function buildScheduleRecipients(savedUsers: any[], orgUsers: any[], mode: "AIR" | "SEA"): ScheduleRecipient[] {
  const people = new Map<string, ScheduleRecipient>();
  for (const user of orgUsers) {
    const email = String(user.email || "").trim().toLowerCase();
    if (email) people.set(email, {email, name: user.displayName || email, enabled: true, source: "Microsoft AD"});
  }
  for (const user of savedUsers) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) continue;
    const existing = people.get(email);
    people.set(email, {email, name: existing?.name || user.display_name || email,
      enabled: mode === "SEA" ? user.is_sea === true : user.is_air !== false,
      source: existing ? "Microsoft AD · Saved recipient" : "Saved recipient"});
  }
  return Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}
