// lib/managementCache.ts
type Entry<T> = { data: T; ts: number };

const TTL_MS = 60_000;

const membersCache = new Map<string, Entry<any>>();
const staffCache = new Map<string, Entry<any>>();
const invitationsCache = new Map<string, Entry<any>>();

function read<T>(
  map: Map<string, Entry<T>>,
  key: string | null | undefined,
): T | null {
  if (!key) return null;
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL_MS) {
    map.delete(key);
    return null;
  }
  return e.data;
}

function write<T>(
  map: Map<string, Entry<T>>,
  key: string | null | undefined,
  data: T,
) {
  if (!key) return;
  map.set(key, { data, ts: Date.now() });
}

function drop<T>(map: Map<string, Entry<T>>, key: string | null | undefined) {
  if (!key) return;
  map.delete(key);
}

export const managementCache = {
  getMembers: (accountId: string | null | undefined) =>
    read(membersCache, accountId),
  setMembers: (accountId: string | null | undefined, data: any) =>
    write(membersCache, accountId, data),
  invalidateMembers: (accountId: string | null | undefined) =>
    drop(membersCache, accountId),

  getStaff: (accountId: string | null | undefined) =>
    read(staffCache, accountId),
  setStaff: (accountId: string | null | undefined, data: any) =>
    write(staffCache, accountId, data),
  invalidateStaff: (accountId: string | null | undefined) =>
    drop(staffCache, accountId),

  getInvitations: (accountId: string | null | undefined) =>
    read(invitationsCache, accountId),
  setInvitations: (accountId: string | null | undefined, data: any) =>
    write(invitationsCache, accountId, data),
  invalidateInvitations: (accountId: string | null | undefined) =>
    drop(invitationsCache, accountId),

  invalidateAll: (accountId?: string | null) => {
    if (accountId) {
      membersCache.delete(accountId);
      staffCache.delete(accountId);
      invitationsCache.delete(accountId);
    } else {
      membersCache.clear();
      staffCache.clear();
      invitationsCache.clear();
    }
  },
};
