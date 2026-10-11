export interface ContactRecord {
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  accountNumber?: string;
  archived?: boolean;
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr"]);
/** Words providers add to contact names that don't identify the person. */
const NOISE = new Set([
  "ndis", "plan", "managed", "management", "self", "agency", "participant", "client", "pm", "sm", "am",
]);
const NICKNAMES: Record<string, string> = {
  bob: "robert", rob: "robert", robbie: "robert", bill: "william", will: "william", liam: "william",
  jim: "james", jimmy: "james", mike: "michael", mick: "michael", tom: "thomas", tommy: "thomas",
  dave: "david", steve: "stephen", steven: "stephen", chris: "christopher", matt: "matthew",
  nick: "nicholas", dan: "daniel", danny: "daniel", tony: "anthony", ben: "benjamin", sam: "samuel",
  alex: "alexander", andy: "andrew", drew: "andrew", joe: "joseph", josh: "joshua", jon: "jonathan",
  kate: "katherine", katie: "katherine", cathy: "catherine", liz: "elizabeth", beth: "elizabeth",
  jen: "jennifer", jenny: "jennifer", sue: "susan", pat: "patricia", trish: "patricia", meg: "margaret",
  maggie: "margaret", peggy: "margaret", becky: "rebecca", bec: "rebecca", jess: "jessica",
  vicky: "victoria", tori: "victoria", mandy: "amanda", abby: "abigail", ally: "alison",
};

/** Name tokens after tidying: lowercase, no accents, titles, brackets or NDIS labels. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((t) => t && !TITLES.has(t) && !NOISE.has(t))
    .map((t) => NICKNAMES[t] ?? t)
    .sort();
}

const ORG_WORDS = /\b(pty|ltd|limited|inc|group|services|partners|management|plan managers?|ndia|agency|trust|association|council)\b/i;

/** Organisations such as plan managers aren't expected to have an NDIS number. */
export function looksLikeOrganisation(name: string): boolean {
  return ORG_WORDS.test(name);
}

/** NDIS numbers are 9 digits starting with 43. */
export function findNdisNumber(c: ContactRecord): string | null {
  for (const field of [c.accountNumber, c.name]) {
    const m = field?.replace(/[\s-]/g, "").match(/43\d{7}/);
    if (m) return m[0];
  }
  return null;
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k++]) t++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** How alike two names are (0-1) and why, or null if they aren't alike. */
export function compareNames(a: string[], b: string[]): { score: number; reason: string } | null {
  if (!a.length || !b.length) return null;
  const ja = a.join(" ");
  const jb = b.join(" ");
  if (ja === jb) return { score: 1, reason: "Same name apart from order, spelling case, labels or a nickname" };

  // One name has an extra (middle) name: "jane mary smith" vs "jane smith".
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 2 && short.every((t) => long.includes(t))) {
    return { score: 0.9, reason: "One name has an extra middle name" };
  }

  // Initials: "j smith" vs "jane smith".
  if (a.length === b.length && a.length >= 2) {
    let full = 0;
    const ok = a.every((t, i) => {
      const u = b[i];
      if (t === u) return ++full > 0;
      return (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u));
    });
    if (ok && full >= 1) return { score: 0.85, reason: "Initial used instead of a first name" };
  }

  const score = jaroWinkler(ja, jb);
  if (score >= 0.93) return { score, reason: "Very similar spelling" };
  return null;
}

export interface DuplicateCluster {
  key: string;
  contactIds: string[];
  confidence: "high" | "medium";
  reasons: string[];
}

function digits(s?: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Groups contacts that are probably the same client. A shared NDIS number is
 * enough on its own. A shared email or phone also needs a loosely similar name,
 * because many participants list their plan manager's email and phone.
 */
export function findDuplicateClusters(contacts: ContactRecord[]): DuplicateCluster[] {
  const tokens = contacts.map((c) => nameTokens(c.name));
  const parent = contacts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons = new Map<number, { reasons: Set<string>; high: boolean }>();

  const link = (i: number, j: number, reason: string, high: boolean) => {
    const [ri, rj] = [find(i), find(j)];
    const root = Math.min(ri, rj);
    const merged = reasons.get(ri) ?? { reasons: new Set<string>(), high: false };
    const other = reasons.get(rj);
    if (other && ri !== rj) {
      other.reasons.forEach((r) => merged.reasons.add(r));
      merged.high ||= other.high;
    }
    merged.reasons.add(reason);
    merged.high ||= high;
    parent[Math.max(ri, rj)] = root;
    reasons.delete(Math.max(ri, rj));
    reasons.set(root, merged);
  };

  // Only compare contacts that share a key or a name-token prefix, so large
  // contact lists don't need every pair compared.
  const buckets = new Map<string, number[]>();
  const add = (key: string, i: number) => {
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  };
  contacts.forEach((c, i) => {
    const ndis = findNdisNumber(c);
    if (ndis) add(`ndis:${ndis}`, i);
    if (c.email) add(`email:${c.email.trim().toLowerCase()}`, i);
    const phone = digits(c.phone);
    if (phone.length >= 8) add(`phone:${phone.slice(-9)}`, i);
    for (const t of tokens[i]) add(`tok:${t.slice(0, 3)}`, i);
  });

  const seen = new Set<string>();
  for (const [key, ids] of buckets) {
    if (ids.length < 2 || ids.length > 500) continue;
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const [i, j] = [ids[x], ids[y]];
        const pairKey = `${key.split(":")[0]}:${i}:${j}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        if (key.startsWith("ndis:")) {
          link(i, j, "Same NDIS number", true);
          continue;
        }
        const names = compareNames(tokens[i], tokens[j]);
        if (key.startsWith("email:") || key.startsWith("phone:")) {
          const loose = names ?? (jaroWinkler(tokens[i].join(" "), tokens[j].join(" ")) >= 0.8 ? { score: 0.8 } : null);
          if (loose) link(i, j, key.startsWith("email:") ? "Same email and a similar name" : "Same phone and a similar name", true);
        } else if (names) {
          link(i, j, names.reason, names.score >= 0.97);
        }
      }
    }
  }

  const clusters = new Map<number, number[]>();
  contacts.forEach((_, i) => {
    const r = find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), i]);
  });

  return [...clusters.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => {
      const ids = members.map((i) => contacts[i].contactId).sort();
      const info = reasons.get(root);
      return {
        key: ids.join("|"),
        contactIds: ids,
        confidence: info?.high ? "high" : "medium",
        reasons: [...(info?.reasons ?? [])],
      } satisfies DuplicateCluster;
    })
    .sort((a, b) => (a.confidence === b.confidence ? b.contactIds.length - a.contactIds.length : a.confidence === "high" ? -1 : 1));
}
