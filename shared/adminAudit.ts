/**
 * Readable text for management audit rows (USER_ADMIN_CHANGE,
 * ROLE_PERMISSION_CHANGE, CHECKLIST_TEMPLATE_CHANGE, DEFECT_CATALOG_CHANGE —
 * docs/11 Karar 25). The server stores names snapshotted at write time plus
 * stable codes; this module turns them into sentences and never prints a raw
 * id, enum or boolean.
 */

import type { MessageKey, Translate } from './i18n';
import { checklistSectionTitle } from './checklistSections';

export const ADMIN_AUDIT_EVENT_TYPES = [
  'USER_ADMIN_CHANGE',
  'ROLE_PERMISSION_CHANGE',
  'CHECKLIST_TEMPLATE_CHANGE',
  'DEFECT_CATALOG_CHANGE',
] as const;

/** Readable only with admin.manage_users (server enforces the same). */
export const SENSITIVE_ADMIN_AUDIT_EVENT_TYPES = ['USER_ADMIN_CHANGE', 'ROLE_PERMISSION_CHANGE'] as const;

export type AdminAuditValue = { code?: string; tr?: string; en?: string };
export type AdminFieldChange = { field: string; from: AdminAuditValue; to: AdminAuditValue };
export type AdminAuditMove = { subject: AdminAuditValue; from: number; to: number };

export type AdminAuditDetail = {
  action: string;
  entity: string;
  entity_id?: number;
  subject: AdminAuditValue;
  subject_email?: string;
  parent?: AdminAuditValue;
  template_type?: string;
  item_no?: number;
  changes?: AdminFieldChange[] | null;
  granted?: AdminAuditValue[] | null;
  revoked?: AdminAuditValue[] | null;
  moved?: AdminAuditMove[] | null;
};

/** Labels the caller owns (web permission catalogue, role names). */
export type AdminAuditLabelers = {
  permission: (code: string, description: string) => string;
  role: (code: string, name: string) => string;
};

const EVENT_LABEL: Record<string, MessageKey> = {
  USER_ADMIN_CHANGE: 'activity.filter.userAdmin',
  ROLE_PERMISSION_CHANGE: 'activity.filter.rolePermission',
  CHECKLIST_TEMPLATE_CHANGE: 'activity.filter.template',
  DEFECT_CATALOG_CHANGE: 'activity.filter.catalog',
};

const ACTION_LABEL: Record<string, MessageKey> = {
  create: 'adminAudit.action.create',
  update: 'adminAudit.action.update',
  role_change: 'adminAudit.action.role_change',
  activate: 'adminAudit.action.activate',
  deactivate: 'adminAudit.action.deactivate',
  delete: 'adminAudit.action.delete',
  password_reset: 'adminAudit.action.password_reset',
  login_unlock: 'adminAudit.action.login_unlock',
  grants_change: 'adminAudit.action.grants_change',
  reorder: 'adminAudit.action.reorder',
};

const ENTITY_LABEL: Record<string, MessageKey> = {
  user: 'adminAudit.entity.user',
  role: 'adminAudit.entity.role',
  template_item: 'adminAudit.entity.template_item',
  zone: 'adminAudit.entity.zone',
  part: 'adminAudit.entity.part',
  defect_type: 'adminAudit.entity.defect_type',
  process: 'adminAudit.entity.process',
};

const FIELD_LABEL: Record<string, MessageKey> = {
  name: 'adminAudit.field.name',
  email: 'adminAudit.field.email',
  role: 'adminAudit.field.role',
  is_active: 'adminAudit.field.is_active',
  code: 'adminAudit.field.code',
  zone: 'adminAudit.field.zone',
  default_process: 'adminAudit.field.default_process',
  sort_order: 'adminAudit.field.sort_order',
  item_text: 'adminAudit.field.item_text',
  eol_phase: 'adminAudit.field.eol_phase',
  section: 'adminAudit.field.section',
};

const TEMPLATE_TYPE_LABEL: Record<string, MessageKey> = {
  EOL: 'home.activity.detailEol',
  TEST: 'home.activity.detailTest',
  SHIPMENT: 'home.activity.detailShipment',
};

const PHASE_LABEL: Record<string, MessageKey> = {
  BRANCH: 'checklist.branch',
  DEPOT: 'checklist.depot',
};

export function isAdminAuditEvent(type: string): boolean {
  return (ADMIN_AUDIT_EVENT_TYPES as readonly string[]).includes(type);
}

/** Filter / action-column label of a management event type. */
export function adminAuditEventLabel(type: string, t: Translate): string {
  const key = EVENT_LABEL[type];
  return key ? t(key) : t('home.activity.other');
}

function isEmpty(v: AdminAuditValue | null | undefined): boolean {
  return !v || (!v.code && !v.tr && !v.en);
}

function bilingual(v: AdminAuditValue): string {
  const tr = (v.tr ?? '').trim();
  const en = (v.en ?? '').trim();
  return tr && en && tr !== en ? `${tr} / ${en}` : tr || en;
}

function named(v: AdminAuditValue, locale: string): string {
  const tr = (v.tr ?? '').trim();
  const en = (v.en ?? '').trim();
  return locale === 'en' ? en || tr : tr || en;
}

function fieldValue(
  field: string,
  v: AdminAuditValue,
  t: Translate,
  locale: string,
  labels: AdminAuditLabelers,
): string {
  if (field === 'section') {
    // No section means the item sits under "Other items".
    return checklistSectionTitle(v?.code || null, t);
  }
  if (isEmpty(v)) return t('common.emDash');
  switch (field) {
    case 'is_active':
      if (v.code === 'true') return t('common.active');
      if (v.code === 'false') return t('common.inactive');
      return t('timeline.value.unknown');
    case 'eol_phase': {
      const key = v.code ? PHASE_LABEL[v.code] : undefined;
      return key ? t(key) : t('timeline.value.unknown');
    }
    case 'role':
      return labels.role(v.code ?? '', named(v, locale));
    case 'code':
    case 'sort_order':
      return v.code || t('common.emDash');
    default: {
      const text = named(v, locale);
      if (text && v.code && field === 'zone') {
        return `${text} (${v.code})`;
      }
      return text || t('timeline.value.unknown');
    }
  }
}

function subjectText(d: AdminAuditDetail, locale: string, labels: AdminAuditLabelers): string {
  const s = d.subject ?? {};
  switch (d.entity) {
    case 'user': {
      const name = named(s, locale);
      return d.subject_email ? `${name} (${d.subject_email})` : name;
    }
    case 'role':
      return labels.role(s.code ?? '', named(s, locale));
    case 'template_item':
    case 'process':
      // Process codes are internal keys (ASSEMBLY); zone/part/type codes
      // are the printed defect code and stay visible.
      return named(s, locale);
    default: {
      const name = named(s, locale);
      return s.code && name ? `${name} (${s.code})` : name || s.code || '';
    }
  }
}

function contextText(d: AdminAuditDetail, t: Translate, locale: string): string {
  if (d.entity === 'template_item' && d.template_type) {
    const key = TEMPLATE_TYPE_LABEL[d.template_type];
    return key ? t(key) : named(d.parent ?? {}, locale);
  }
  if (!isEmpty(d.parent)) return named(d.parent as AdminAuditValue, locale);
  return '';
}

/** One short sentence: "Kullanıcı Mehmet (m@x) — rolü değiştirildi". */
export function adminAuditHeadline(
  d: AdminAuditDetail | null | undefined,
  t: Translate,
  locale: string,
  labels: AdminAuditLabelers,
): string {
  if (!d) return t('home.activity.other');
  const entityKey = ENTITY_LABEL[d.entity];
  const actionKey = ACTION_LABEL[d.action];
  const entity = entityKey ? t(entityKey) : t('home.activity.other');
  const action = actionKey ? t(actionKey) : t('adminAudit.action.update');
  const context = contextText(d, t, locale);
  const where = context ? ` (${context})` : '';
  if (d.action === 'reorder') return `${entity}${where} — ${action}`;
  const subject = subjectText(d, locale, labels);
  return `${entity} «${subject || t('common.emDash')}»${where} — ${action}`;
}

/** Old → new lines, granted / revoked permissions and moved positions. */
export function adminAuditChangeLines(
  d: AdminAuditDetail | null | undefined,
  t: Translate,
  locale: string,
  labels: AdminAuditLabelers,
): string[] {
  if (!d) return [];
  const lines: string[] = [];
  for (const c of d.changes ?? []) {
    const key = FIELD_LABEL[c.field];
    if (!key) continue;
    let from = fieldValue(c.field, c.from ?? {}, t, locale, labels);
    let to = fieldValue(c.field, c.to ?? {}, t, locale, labels);
    if (d.action === 'create') lines.push(`${t(key)}: ${to}`);
    else if (d.action === 'delete') lines.push(`${t(key)}: ${from}`);
    else {
      if (from === to && c.field === 'name') {
        // Only the other language changed; show both so the edit is visible.
        from = bilingual(c.from ?? {});
        to = bilingual(c.to ?? {});
      }
      lines.push(`${t(key)}: ${from} → ${to}`);
    }
  }
  const perm = (v: AdminAuditValue) => labels.permission(v.code ?? '', named(v, locale));
  if (d.granted && d.granted.length > 0) {
    lines.push(t('adminAudit.granted', { list: d.granted.map(perm).join(', ') }));
  }
  if (d.revoked && d.revoked.length > 0) {
    lines.push(t('adminAudit.revoked', { list: d.revoked.map(perm).join(', ') }));
  }
  for (const m of d.moved ?? []) {
    const name =
      d.entity === 'template_item' ? named(m.subject, locale) : subjectText({ ...d, subject: m.subject }, locale, labels);
    lines.push(t('adminAudit.moved', { name, from: m.from, to: m.to }));
  }
  return lines;
}

/** Headline plus change lines joined for a single table cell. */
export function adminAuditDetailLine(
  d: AdminAuditDetail | null | undefined,
  t: Translate,
  locale: string,
  labels: AdminAuditLabelers,
): string {
  return [adminAuditHeadline(d, t, locale, labels), ...adminAuditChangeLines(d, t, locale, labels)].join(' · ');
}
