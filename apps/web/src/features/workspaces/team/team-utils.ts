import type { AccessMatrixOut, MemberOut } from "../api";

export const WORKSPACE_ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** UI only - the API re-checks every one of these (13-Authentication.md §13.5). */
export function canManageTeam(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function byRoleThenName(a: MemberOut, b: MemberOut): number {
  return (
    (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
    (a.team ?? "￿").localeCompare(b.team ?? "￿") ||
    a.name.localeCompare(b.name)
  );
}

export function teamsOf(members: MemberOut[]): string[] {
  return [...new Set(members.map((m) => m.team?.trim()).filter((t): t is string => Boolean(t)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Each member's project count from the access matrix: projects they can open. */
export function projectCounts(matrix: AccessMatrixOut | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const project of matrix?.projects ?? []) {
    if (project.archived) continue;
    for (const userId of Object.keys(project.roles)) counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }
  return counts;
}

// ── Org tree ─────────────────────────────────────────────────────────────────

export interface OrgPerson {
  member: MemberOut;
  /** user_id of the person drawn above them, or null for the workspace itself. */
  parentId: string | null;
  /** True when no manager is set and they're shown under the owner by default. */
  inferred: boolean;
  children: OrgPerson[];
}

export interface OrgTree {
  /** People directly under the workspace card (normally just the owner). */
  roots: OrgPerson[];
  byUser: Map<string, OrgPerson>;
}

/**
 * The reporting tree. A set reporting line wins. Anyone without one - every member,
 * until an admin draws the chart - is shown under the owner with a dashed line, since
 * in a small team that's who they report to; the person drawer says the line isn't
 * set. A line to someone who left, or a loop (which the API refuses, but older data
 * might hold), is treated as not set rather than hiding people.
 */
export function buildOrgTree(members: MemberOut[]): OrgTree {
  const byUser = new Map<string, OrgPerson>();
  for (const member of members) {
    byUser.set(member.user_id, { member, parentId: null, inferred: false, children: [] });
  }
  const owner = members.find((m) => m.role === "owner");

  const explicitParent = (userId: string): string | null => {
    const managerId = byUser.get(userId)?.member.manager_user_id ?? null;
    return managerId && managerId !== userId && byUser.has(managerId) ? managerId : null;
  };
  const inLoop = (userId: string): boolean => {
    const seen = new Set<string>([userId]);
    let current = explicitParent(userId);
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = explicitParent(current);
    }
    return false;
  };

  for (const person of byUser.values()) {
    const userId = person.member.user_id;
    const parent = inLoop(userId) ? null : explicitParent(userId);
    if (parent) {
      person.parentId = parent;
    } else if (owner && userId !== owner.user_id) {
      person.parentId = owner.user_id;
      person.inferred = true;
    }
  }
  // A loop broken above can still leave the owner under someone; the owner always
  // heads the chart.
  if (owner) {
    const ownerNode = byUser.get(owner.user_id)!;
    if (ownerNode.parentId && inSubtreeOf(byUser, ownerNode.parentId, owner.user_id)) {
      ownerNode.parentId = null;
    }
  }

  const roots: OrgPerson[] = [];
  for (const person of byUser.values()) {
    const parent = person.parentId ? byUser.get(person.parentId) : undefined;
    if (parent) parent.children.push(person);
    else roots.push(person);
  }
  const sort = (list: OrgPerson[]) => {
    list.sort((a, b) => byRoleThenName(a.member, b.member));
    list.forEach((p) => sort(p.children));
  };
  sort(roots);
  return { roots, byUser };
}

function inSubtreeOf(byUser: Map<string, OrgPerson>, userId: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  let current: string | null = userId;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byUser.get(current)?.parentId ?? null;
  }
  return false;
}

/** Everyone below `userId` (not including them). */
export function descendantsOf(tree: OrgTree, userId: string): Set<string> {
  const out = new Set<string>();
  const walk = (person: OrgPerson | undefined) => {
    person?.children.forEach((child) => {
      out.add(child.member.user_id);
      walk(child);
    });
  };
  walk(tree.byUser.get(userId));
  return out;
}

/** userIds from `userId` up to the top of the chart, nearest first. */
export function chainOf(tree: OrgTree, userId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | null = userId;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = tree.byUser.get(current)?.parentId ?? null;
  }
  return chain;
}

export function countDescendants(person: OrgPerson): number {
  return person.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
