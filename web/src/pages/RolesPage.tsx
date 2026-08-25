import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Perm } from '../auth/permissions';
import { api, ApiError, type PermissionRow, type RoleGrant } from '../lib/api';

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
        setError(err instanceof Error ? err.message : 'failed to load matrix');
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

  async function save(role: RoleGrant) {
    setBusyId(role.id);
    setError(null);
    try {
      const codes = [...(drafts[role.id] ?? [])].sort();
      await api.replaceRolePermissions(role.id, codes);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'save failed');
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
      setError(err instanceof ApiError ? err.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Roles & Permissions</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Grant or revoke permissions without a code change. Removing{' '}
        {Perm.AdminManageUsers} from the last granting role is rejected.
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

      <div className="mt-6 overflow-x-auto rounded-xl border bg-[var(--bg-surface-1)]" style={{ borderColor: 'var(--border)' }}>
        <table className="min-w-max text-left text-[13px]">
          <thead>
            <tr className="border-b text-[var(--text-secondary)]" style={{ borderColor: 'var(--border)' }}>
              <th className="sticky left-0 z-10 bg-[var(--bg-surface-1)] px-4 py-3">Role</th>
              {permissions.map((p) => (
                <th
                  key={p.code}
                  className="max-w-[8rem] px-2 py-3 font-normal"
                  title={p.description || p.code}
                >
                  <span className="block origin-bottom-left whitespace-nowrap">
                    {p.code}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const granted = drafts[role.id] ?? new Set<string>();
              const dirty =
                JSON.stringify([...(granted)].sort()) !==
                JSON.stringify([...(role.permissions)].sort());
              return (
                <tr key={role.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="sticky left-0 bg-[var(--bg-surface-1)] px-4 py-3 font-medium">
                    <div>{role.name}</div>
                    <div className="text-[12px] text-[var(--text-secondary)]">{role.code}</div>
                  </td>
                  {permissions.map((p) => (
                    <td key={p.code} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={granted.has(p.code)}
                        onChange={() => toggle(role.id, p.code)}
                        aria-label={`${role.code} ${p.code}`}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busyId === role.id || !dirty}
                      onClick={() => void save(role)}
                      className="min-h-touch rounded-lg bg-[var(--accent)] px-3 text-[13px] text-white disabled:opacity-40"
                    >
                      {busyId === role.id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
