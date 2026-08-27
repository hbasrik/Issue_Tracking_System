import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { ActiveBadge } from '../components/ActiveBadge';
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
import { PASSWORD_RULE_HINT, passwordErrorMessage } from '../lib/password';
import { apiErrorMessage } from '../lib/apiErrors';
import {
  EMAIL_FORMAT_HINT,
  allowedDomainsHint,
  emailCreateErrorMessage,
} from '../lib/email';
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

  return {
    isSelf,
    isLastUserAdmin,
    roleSelectDisabled: isSelf,
    roleTitle: isSelf ? 'Kendi rolünüzü değiştiremezsiniz.' : undefined,
    activeSelectDisabled: isSelf || isLastUserAdmin,
    activeTitle: isSelf
      ? 'Kendi hesabınızı pasife çekemezsiniz.'
      : isLastUserAdmin
        ? 'En az bir aktif yönetici kalmalıdır.'
        : 'Pasif kullanıcı giriş yapamaz, geçmiş kayıtları korunur.',
    resetDisabled: isSelf,
    resetTitle: isSelf
      ? 'Kendi şifrenizi Ayarlar’dan değiştirin.'
      : undefined,
    deleteDisabled: isSelf || isLastUserAdmin,
    deleteTitle: isSelf
      ? 'Kendi hesabınızı silemezsiniz.'
      : isLastUserAdmin
        ? 'En az bir aktif yönetici kalmalıdır.'
        : 'Yalnızca hiç işlem yapmamış hesaplar silinebilir.',
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
  onReset,
  onDelete,
}: {
  user: User;
  users: User[];
  roles: RoleGrant[];
  currentUserId: number | undefined;
  busy: boolean;
  onRole: (role: UserRole) => void;
  onActive: (isActive: boolean) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const reasonId = useId();
  const adminRoles = userAdminRoleCodes(roles);
  const locks = userEditLocks(u, currentUserId, users, adminRoles);
  const selectClass =
    'min-h-touch rounded-lg border bg-[var(--bg-page)] px-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-60';
  const helpId = locks.roleSelectDisabled || locks.activeSelectDisabled || locks.resetDisabled || locks.deleteDisabled
    ? reasonId
    : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={u.Role}
          disabled={busy || locks.roleSelectDisabled}
          onChange={(e) => onRole(e.target.value)}
          className={selectClass}
          style={{ borderColor: 'var(--border)' }}
          aria-label={`${u.FullName} için rol`}
          title={locks.roleTitle}
          aria-describedby={helpId}
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
          aria-label={`${u.FullName} için durum`}
          title={locks.activeTitle}
          aria-describedby={helpId}
        >
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>
        <button
          type="button"
          disabled={busy || locks.resetDisabled}
          onClick={onReset}
          title={locks.resetTitle}
          className="min-h-touch rounded-lg border px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: 'var(--border)' }}
        >
          Şifreyi sıfırla
        </button>
      </div>
      <button
        type="button"
        disabled={busy || locks.deleteDisabled}
        onClick={onDelete}
        title={locks.deleteTitle}
        className="self-start text-[13px] text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
      >
        Hesabı sil
      </button>
      <span id={reasonId} className="sr-only">
        {[locks.roleTitle, locks.activeTitle, locks.resetTitle, locks.deleteTitle]
          .filter(Boolean)
          .join(' ')}
      </span>
    </div>
  );
}

function TemporaryPasswordBanner({
  label,
  password,
  onDismiss,
}: {
  label: string;
  password: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="mt-4 rounded-xl border bg-[var(--bg-surface-1)] p-4"
      style={{ borderColor: 'var(--accent)' }}
      role="status"
    >
      <p className="text-[15px] font-medium">{label}</p>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Bu şifre yalnızca bir kez gösterilir. Kullanıcı ilk girişte değiştirmek
        zorundadır. {PASSWORD_RULE_HINT}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={password}
          className="min-h-touch min-w-[12rem] flex-1 rounded-lg border bg-[var(--bg-page)] px-3 font-mono text-[15px]"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Geçici şifre"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] font-medium text-white"
        >
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-touch rounded-lg border px-4 text-[15px]"
          style={{ borderColor: 'var(--border)' }}
        >
          Gizle
        </button>
      </div>
    </div>
  );
}

function CreateUserForm({
  roles,
  allowedEmailDomains,
  onCreated,
}: {
  roles: RoleGrant[];
  allowedEmailDomains: string[];
  onCreated: (user: User, temporaryPassword: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [error, setError] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (roles.length === 0) return;
    if (!roles.some((r) => r.code === role)) {
      setRole(roles[0].code);
    }
  }, [roles, role]);

  function onEmailChange(value: string) {
    setEmail(value);
    setEmailHint(emailCreateErrorMessage(value, allowedEmailDomains));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const formatErr = emailCreateErrorMessage(email, allowedEmailDomains);
    if (formatErr) {
      setEmailHint(formatErr);
      setError(formatErr);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.createUser({
        full_name: fullName,
        email,
        role,
      });
      setFullName('');
      setEmail('');
      setEmailHint(null);
      onCreated(res.user, res.temporary_password);
    } catch (err) {
      setError(
        err instanceof ApiError ? passwordErrorMessage(err) : 'Kullanıcı oluşturulamadı',
      );
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px]';
  const domainHint = allowedDomainsHint(allowedEmailDomains);

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
      noValidate
    >
      <h2 className="text-[15px] font-medium">Yeni kullanıcı</h2>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Sistem geçici bir şifre üretir ve yalnızca bir kez gösterir.{' '}
        {PASSWORD_RULE_HINT} Yeni kullanıcı aktif oluşturulur.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-[13px] text-[var(--text-secondary)]">
          Ad soyad
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={fieldClass}
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label className="block text-[13px] text-[var(--text-secondary)]">
          E-posta
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
            aria-invalid={emailHint ? true : undefined}
            className={fieldClass}
            style={{
              borderColor: emailHint ? 'var(--status-not-ok)' : 'var(--border)',
            }}
          />
          <span className="mt-1 block text-[12px] text-[var(--text-secondary)]">
            {EMAIL_FORMAT_HINT}
            {domainHint ? ` ${domainHint}` : ''}
          </span>
          {emailHint && (
            <span className="mt-1 block text-[12px]" style={{ color: 'var(--status-not-ok)' }}>
              {emailHint}
            </span>
          )}
        </label>
        <label className="block text-[13px] text-[var(--text-secondary)]">
          Rol
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={fieldClass}
            style={{ borderColor: 'var(--border)' }}
          >
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {roleDisplayName(r.code, roles)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] font-medium text-white disabled:opacity-60"
      >
        {busy ? 'Oluşturuluyor…' : 'Kullanıcı oluştur'}
      </button>
    </form>
  );
}

/** Users & Roles — assign catalogue roles without locking out the last admin. */
export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleGrant[]>([]);
  const [allowedEmailDomains, setAllowedEmailDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [revealed, setRevealed] = useState<{
    label: string;
    password: string;
  } | null>(null);

  const load = useCallback(async () => {
    const [userRes, rbac] = await Promise.all([api.listUsers(), api.getRBAC()]);
    setUsers(userRes.items ?? []);
    setAllowedEmailDomains(userRes.allowed_email_domains ?? []);
    setRoles(rbac.roles ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? apiErrorMessage(err) : 'Kullanıcılar yüklenemedi');
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
      setError(err instanceof ApiError ? apiErrorMessage(err) : 'Güncelleme başarısız');
      try {
        await load();
      } catch {
        /* keep the previous error */
      }
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(u: User) {
    if (
      !window.confirm(
        `${u.FullName} için yeni geçici şifre üretilsin mi? Kullanıcı bir sonraki girişte şifre değiştirmek zorunda kalır.`,
      )
    ) {
      return;
    }
    setBusyId(u.ID);
    setError(null);
    try {
      const res = await api.resetUserPassword(u.ID);
      setRevealed({
        label: `${u.FullName} için geçici şifre`,
        password: res.temporary_password,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? passwordErrorMessage(err) : 'Şifre sıfırlanamadı',
      );
    } finally {
      setBusyId(null);
    }
  }

  function requestDelete(u: User) {
    setError(null);
    setPendingDelete(u);
  }

  async function confirmDelete() {
    const u = pendingDelete;
    if (!u) return;
    setBusyId(u.ID);
    setError(null);
    try {
      await api.deleteUser(u.ID);
      setUsers((prev) => prev.filter((x) => x.ID !== u.ID));
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? apiErrorMessage(err) : 'Kullanıcı silinemedi',
      );
      setPendingDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Kullanıcılar ve roller</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Katalogdaki herhangi bir rolü atayın. İzinler Roller matrisinden
        düzenlenir. En az bir aktif yönetici kalmalıdır. Hesabı kapatmanın yolu
        Aktif/Pasif anahtarıdır: pasif kullanıcı giriş yapamaz, geçmiş kayıtları
        korunur. Silme yalnızca hiç işlem yapmamış hesaplar içindir.
      </p>
      {error && (
        <div
          className="mt-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--status-not-ok)' }}
          role="alert"
        >
          <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
            {error}
          </p>
        </div>
      )}
      {pendingDelete && (
        <div
          className="mt-3 rounded-xl border bg-[var(--bg-surface-1)] p-4"
          style={{ borderColor: 'var(--status-not-ok)' }}
          role="status"
        >
          <p className="text-[15px] font-medium">Hesabı sil</p>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {pendingDelete.FullName} ({pendingDelete.Email}) kalıcı olarak
            silinsin mi? Yalnızca hiç işlem yapmamış hesaplar silinebilir. İşlem
            yapmış kullanıcıları pasife çekin.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId === pendingDelete.ID}
              onClick={() => void confirmDelete()}
              className="min-h-touch rounded-lg px-4 text-[15px] font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--status-not-ok)' }}
            >
              {busyId === pendingDelete.ID ? 'Siliniyor…' : 'Evet, sil'}
            </button>
            <button
              type="button"
              disabled={busyId === pendingDelete.ID}
              onClick={() => setPendingDelete(null)}
              className="min-h-touch rounded-lg border px-4 text-[15px]"
              style={{ borderColor: 'var(--border)' }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      <CreateUserForm
        roles={roles}
        allowedEmailDomains={allowedEmailDomains}
        onCreated={(user, temporaryPassword) => {
          setUsers((prev) => [...prev, user].sort((a, b) => a.ID - b.ID));
          setRevealed({
            label: `${user.FullName} için geçici şifre`,
            password: temporaryPassword,
          });
        }}
      />
      {revealed && (
        <TemporaryPasswordBanner
          label={revealed.label}
          password={revealed.password}
          onDismiss={() => setRevealed(null)}
        />
      )}

      <div className="mt-6">
        <MobileCardStack>
          {users.map((u) => (
            <DataCard key={u.ID}>
              <p className="font-medium">{u.FullName}</p>
              <DataCardField label="E-posta">
                <span className="break-all">{u.Email}</span>
              </DataCardField>
              <DataCardField label="Rol">
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
                <ActiveBadge active={u.IsActive} />
              </DataCardField>
              <DataCardField label="Atama">
                <UserAssignControls
                  user={u}
                  users={users}
                  roles={roles}
                  currentUserId={currentUser?.ID}
                  busy={busyId === u.ID}
                  onRole={(role) => void patch(u.ID, { role })}
                  onActive={(isActive) => void patch(u.ID, { is_active: isActive })}
                  onReset={() => void resetPassword(u)}
                  onDelete={() => requestDelete(u)}
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
                <th className="px-4 py-3">Ad</th>
                <th className="px-4 py-3">E-posta</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Atama</th>
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
                    <ActiveBadge active={u.IsActive} />
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
                      onReset={() => void resetPassword(u)}
                  onDelete={() => requestDelete(u)}
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
