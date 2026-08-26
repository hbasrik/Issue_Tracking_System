import { useCallback, useEffect, useId, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { StatusBadge } from '../components/StatusBadge';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';
import {
  api,
  ApiError,
  type RoleGrant,
  type User,
  type UserRole,
} from '../lib/api';
import { roleDisplayName } from '../lib/roleLabels';

function roleLabel(role: string, roles: RoleGrant[]): string {
  return roleDisplayName(role, roles);
}

function userAdminRoleCodes(roles: RoleGrant[]): Set<string> {
  return new Set(
    roles
      .filter((r) => r.permissions.includes(Perm.AdminManageUsers))
      .map((r) => r.code),
  );
}

function userEditLocks(
  u: User,
  currentUserId: number | undefined,
  users: User[],
  adminRoles: Set<string>,
) {
  const isSelf = currentUserId === u.ID;
  const holders = users.filter(
    (x) => x.IsActive && adminRoles.has(x.Role),
  );
  const isLastUserAdmin =
    u.IsActive && adminRoles.has(u.Role) && holders.length === 1;

  const reasons: string[] = [];
  if (isSelf) {
    reasons.push(
      'You cannot change your own role or deactivate your own account.',
    );
  }
  if (isLastUserAdmin) {
    reasons.push(
      'At least one active user with admin.manage_users must remain.',
    );
  }

  return {
    isSelf,
    isLastUserAdmin,
    roleSelectDisabled: isSelf,
    activeSelectDisabled: isSelf || isLastUserAdmin,
    reasons,
  };
}

function UserAssignControls({
  user: u,
  users,
  roles,
  currentUserId,
  busy,
  onRole,
  onActive,
}: {
  user: User;
  users: User[];
  roles: RoleGrant[];
  currentUserId: number | undefined;
  busy: boolean;
  onRole: (role: UserRole) => void;
  onActive: (isActive: boolean) => void;
}) {
  const reasonId = useId();
  const adminRoles = userAdminRoleCodes(roles);
  const locks = userEditLocks(u, currentUserId, users, adminRoles);
  const selectClass =
    'min-h-touch rounded-lg border bg-[var(--bg-page)] px-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={u.Role}
          disabled={busy || locks.roleSelectDisabled}
          onChange={(e) => onRole(e.target.value)}
          className={selectClass}
          style={{ borderColor: 'var(--border)' }}
          aria-label={`Role for ${u.FullName}`}
          aria-describedby={locks.reasons.length ? reasonId : undefined}
        >
          {roles.map((role) => (
            <option
              key={role.code}
              value={role.code}
              disabled={locks.isLastUserAdmin && !adminRoles.has(role.code)}
            >
              {roleDisplayName(role.code, roles)}
            </option>
          ))}
        </select>
        <select
          value={u.IsActive ? 'active' : 'inactive'}
          disabled={busy || locks.activeSelectDisabled}
          onChange={(e) => onActive(e.target.value === 'active')}
          className={selectClass}
          style={{ borderColor: 'var(--border)' }}
          aria-label={`Status for ${u.FullName}`}
          aria-describedby={locks.reasons.length ? reasonId : undefined}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {locks.reasons.length > 0 && (
        <p id={reasonId} className="text-[12px] text-[var(--text-secondary)]">
          {locks.reasons.join(' ')}
        </p>
      )}
    </div>
  );
}

/** Users & Roles — assign catalogue roles without locking out admin.manage_users. */
export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleGrant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [userRes, rbac] = await Promise.all([api.listUsers(), api.getRBAC()]);
    setUsers(userRes.items ?? []);
    setRoles(rbac.roles ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'failed to load users');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function patch(id: number, body: { role?: UserRole; is_active?: boolean }) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api.updateUser(id, body);
      setUsers((prev) => prev.map((u) => (u.ID === updated.ID ? updated : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'update failed');
      try {
        await load();
      } catch {
        /* keep the previous error */
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Kullanıcılar ve roller</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Katalogdaki herhangi bir rolü atayın. İzinler Roller matrisinden
        düzenlenir. En az bir aktif admin.manage_users sahibi kalmalıdır.
      </p>
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-6">
        <MobileCardStack>
          {users.map((u) => (
            <DataCard key={u.ID}>
              <p className="font-medium">{u.FullName}</p>
              <DataCardField label="Email">
                <span className="break-all">{u.Email}</span>
              </DataCardField>
              <DataCardField label="Role">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                  style={{
                    color: 'var(--accent)',
                    backgroundColor:
                      'color-mix(in srgb, var(--accent) 15%, transparent)',
                  }}
                >
                  {roleLabel(u.Role, roles)}
                </span>
              </DataCardField>
                <DataCardField label="Durum">
                <StatusBadge
                  kind="stationStep"
                  value={u.IsActive ? 'OK' : 'PENDING'}
                />
              </DataCardField>
              <DataCardField label="Assign">
                <UserAssignControls
                  user={u}
                  users={users}
                  roles={roles}
                  currentUserId={currentUser?.ID}
                  busy={busyId === u.ID}
                  onRole={(role) => void patch(u.ID, { role })}
                  onActive={(isActive) => void patch(u.ID, { is_active: isActive })}
                />
              </DataCardField>
            </DataCard>
          ))}
        </MobileCardStack>

        <DesktopTableShell>
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr
                className="border-b text-[13px] text-[var(--text-secondary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assign</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.ID}
                  className="border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="px-4 py-3">{u.FullName}</td>
                  <td className="px-4 py-3">{u.Email}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                      style={{
                        color: 'var(--accent)',
                        backgroundColor:
                          'color-mix(in srgb, var(--accent) 15%, transparent)',
                      }}
                    >
                      {roleLabel(u.Role, roles)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      kind="stationStep"
                      value={u.IsActive ? 'OK' : 'PENDING'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <UserAssignControls
                      user={u}
                      users={users}
                      roles={roles}
                      currentUserId={currentUser?.ID}
                      busy={busyId === u.ID}
                      onRole={(role) => void patch(u.ID, { role })}
                      onActive={(isActive) => void patch(u.ID, { is_active: isActive })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DesktopTableShell>
      </div>
    </section>
  );
}
