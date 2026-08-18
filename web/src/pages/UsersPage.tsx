import { StatusBadge } from '../components/StatusBadge';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';

const USERS = [
  {
    id: 1,
    fullName: 'Local Manager',
    email: 'manager@karea.local',
    role: 'MANAGER_ADMIN' as const,
    isActive: true,
  },
  {
    id: 2,
    fullName: 'Assembly Operator',
    email: 'operator.one@karea.local',
    role: 'OPERATOR' as const,
    isActive: true,
  },
  {
    id: 3,
    fullName: 'Quality Operator',
    email: 'operator.two@karea.local',
    role: 'OPERATOR' as const,
    isActive: true,
  },
];

/** Users & Roles — §4.6. Exactly two roles. */
export default function UsersPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Users & Roles</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Operator (mobile) and Manager/Admin (web) — Decision Log #4
      </p>

      <div className="mt-6">
        <MobileCardStack>
          {USERS.map((u) => (
            <DataCard key={u.id}>
              <p className="font-medium">{u.fullName}</p>
              <DataCardField label="Email">
                <span className="break-all">{u.email}</span>
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
                  {u.role === 'MANAGER_ADMIN' ? 'Manager/Admin' : 'Operator'}
                </span>
              </DataCardField>
              <DataCardField label="Status">
                <StatusBadge
                  kind="stationStep"
                  value={u.isActive ? 'OK' : 'PENDING'}
                />
              </DataCardField>
              <DataCardField label="Assign">
                <select
                  defaultValue={u.role}
                  className="min-h-touch rounded-lg border bg-[var(--bg-page)] px-2 text-[13px]"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label={`Role for ${u.fullName}`}
                >
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="MANAGER_ADMIN">MANAGER_ADMIN</option>
                </select>
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
              {USERS.map((u) => (
                <tr
                  key={u.id}
                  className="border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="px-4 py-3">{u.fullName}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[12px] font-medium"
                      style={{
                        color: 'var(--accent)',
                        backgroundColor:
                          'color-mix(in srgb, var(--accent) 15%, transparent)',
                      }}
                    >
                      {u.role === 'MANAGER_ADMIN' ? 'Manager/Admin' : 'Operator'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      kind="stationStep"
                      value={u.isActive ? 'OK' : 'PENDING'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={u.role}
                      className="min-h-touch rounded-lg border bg-[var(--bg-page)] px-2 text-[13px]"
                      style={{ borderColor: 'var(--border)' }}
                      aria-label={`Role for ${u.fullName}`}
                    >
                      <option value="OPERATOR">OPERATOR</option>
                      <option value="MANAGER_ADMIN">MANAGER_ADMIN</option>
                    </select>
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
