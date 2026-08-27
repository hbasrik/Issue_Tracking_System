import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type PermissionRow, type RoleGrant } from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { groupPermissions } from '../lib/permissionLabels';

/** Role × permission matrix. Saving writes role_permissions immediately. */
export default function RolesPage() {
  const [roles, setRoles] = useState<RoleGrant[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const rbac = await api.getRBAC();
    const nextRoles = rbac.roles ?? [];
    setRoles(nextRoles);
    setPermissions(rbac.permissions ?? []);
    const nextDrafts: Record<number, Set<string>> = {};
    for (const role of nextRoles) {
      nextDrafts[role.id] = new Set(role.permissions);
    }
    setDrafts(nextDrafts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? apiErrorMessage(err) : 'Matris yüklenemedi');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function toggle(roleId: number, perm: string) {
    setDrafts((prev) => {
      const current = new Set(prev[roleId] ?? []);
      if (current.has(perm)) current.delete(perm);
      else current.add(perm);
      return { ...prev, [roleId]: current };
    });
  }

  function isDirty(role: RoleGrant): boolean {
    const granted = [...(drafts[role.id] ?? [])].sort();
    const saved = [...role.permissions].sort();
    return JSON.stringify(granted) !== JSON.stringify(saved);
  }

  async function save(role: RoleGrant) {
    setBusyId(role.id);
    setError(null);
    try {
      const codes = [...(drafts[role.id] ?? [])].sort();
      await api.replaceRolePermissions(role.id, codes);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err) : 'Kayıt başarısız');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createRole({ code: code.trim(), name: name.trim() });
      setCode('');
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err) : 'Rol oluşturulamadı');
    } finally {
      setCreating(false);
    }
  }

  const groups = groupPermissions(permissions);
  const roleColWidth = '8.5rem';

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Roller ve izinler</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Kod değiştirmeden izin verin veya alın. Son yönetici rolünden
        Kullanıcı ve rol yönetimi iznini kaldırmak reddedilir.
      </p>
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="mt-6 flex flex-col gap-2 rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:flex-row sm:items-end"
        style={{ borderColor: 'var(--border)' }}
      >
        <label className="block text-[13px] text-[var(--text-secondary)]">
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            placeholder="QUALITY_LEAD"
            className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label className="block text-[13px] text-[var(--text-secondary)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Quality Lead"
            className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <button
          type="submit"
          disabled={creating || !code.trim()}
          className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] text-white disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create role'}
        </button>
      </form>

      <div
        className="mt-6 overflow-auto rounded-xl border bg-[var(--bg-surface-1)]"
        style={{ borderColor: 'var(--border)' }}
      >
        <table className="w-full min-w-max border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b text-[var(--text-secondary)]" style={{ borderColor: 'var(--border)' }}>
              <th
                className="sticky left-0 top-0 z-30 bg-[var(--bg-surface-1)] px-4 py-3 font-medium text-[var(--text-primary)]"
                style={{ minWidth: '16rem', width: '16rem' }}
              >
                İzin
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="sticky top-0 z-20 bg-[var(--bg-surface-1)] px-2 py-3 text-center font-medium text-[var(--text-primary)]"
                  style={{ minWidth: roleColWidth, width: roleColWidth }}
                >
                  <div className="leading-snug">{role.name}</div>
                  <div className="mt-0.5 truncate text-[11px] font-normal text-[var(--text-secondary)]">
                    {role.code}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === role.id || !isDirty(role)}
                    onClick={() => void save(role)}
                    className="mt-2 min-h-touch w-full rounded-lg bg-[var(--accent)] px-2 text-[12px] font-medium text-white disabled:opacity-40"
                  >
                    {busyId === role.id ? 'Saving…' : 'Save'}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <PermissionGroupRows
                key={group.id}
                group={group}
                roles={roles}
                drafts={drafts}
                roleColWidth={roleColWidth}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PermissionGroupRows({
  group,
  roles,
  drafts,
  roleColWidth,
  onToggle,
}: {
  group: ReturnType<typeof groupPermissions>[number];
  roles: RoleGrant[];
  drafts: Record<number, Set<string>>;
  roleColWidth: string;
  onToggle: (roleId: number, perm: string) => void;
}) {
  return (
    <>
      <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
        <td
          colSpan={1 + roles.length}
          className="bg-[var(--bg-surface-2)] px-4 py-2 text-[12px] font-semibold tracking-wide text-[var(--text-secondary)]"
        >
          {group.label}
        </td>
      </tr>
      {group.items.map((item) => (
        <tr key={item.code} className="border-t" style={{ borderColor: 'var(--border)' }}>
          <td
            className="sticky left-0 z-10 bg-[var(--bg-surface-1)] px-4 py-2.5 align-middle"
            style={{ minWidth: '16rem', width: '16rem' }}
            title={item.code}
          >
            <div className="leading-snug text-[var(--text-primary)]">{item.label}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-secondary)]">
              {item.code}
            </div>
          </td>
          {roles.map((role) => {
            const granted = drafts[role.id] ?? new Set<string>();
            return (
              <td
                key={role.id}
                className="px-2 py-2.5 text-center align-middle"
                style={{ minWidth: roleColWidth, width: roleColWidth }}
              >
                <input
                  type="checkbox"
                  className="mx-auto block h-4 w-4"
                  checked={granted.has(item.code)}
                  onChange={() => onToggle(role.id, item.code)}
                  aria-label={`${role.name}: ${item.label}`}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
