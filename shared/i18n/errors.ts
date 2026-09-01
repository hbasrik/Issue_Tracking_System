import type { MessageKey } from './messages';
import type { Translate } from './translate';

/**
 * Client-side mapping of backend `err.Error()` strings to i18n keys.
 *
 * Why not API keys: the Go domain sentinels are the HTTP contract (tests and
 * existing clients assert the English phrases). Changing them would version
 * the API. Mapping on the client keeps the contract stable and still lets
 * TR/EN UI copy change independently. Structured extras (item ids, domains)
 * stay in the English payload and are interpolated into the translated
 * template.
 */
const EXACT: Record<string, MessageKey> = {
  'invalid credentials': 'error.invalidCredentials',
  'password must be at least 8 characters': 'error.passwordTooShort',
  'password must contain at least one letter and one digit': 'error.passwordTooWeak',
  'new password and confirmation do not match': 'error.passwordMismatch',
  'email is already in use': 'error.emailTaken',
  'you cannot reset your own password this way': 'error.cannotResetOwn',
  'you cannot delete your own account': 'error.cannotDeleteSelf',
  'you cannot change your own role': 'error.cannotChangeOwnRole',
  'you cannot deactivate your own account': 'error.cannotDeactivateSelf',
  'cannot remove the last user who can manage users': 'error.lastAdmin',
  'full_name is required': 'error.fullNameRequired',
  'email is required': 'error.emailRequired',
  'email address is not valid': 'error.emailInvalid',
  'description is required for this status': 'error.descRequiredStatus',
  'description is required': 'error.descRequired',
  'solution_description is required when marking an issue done':
    'error.solutionRequired',
  'issue severity is required': 'error.severityRequired',
  'vin is required': 'error.vinRequired',
  'station_id is required': 'error.stationRequired',
  'issue_type_id is required': 'error.issueTypeRequired',
  'manual issues must not set source_station_step_id or source_check_item_id':
    'error.invalidManualSource',
  'image format is not displayable in the browser; upload JPEG or PNG':
    'error.unsupportedImage',
  'invalid enum value': 'error.invalidEnum',
  'invalid status transition': 'error.invalidTransition',
  'operation not permitted for role': 'error.forbidden',
  'entity not found': 'error.notFound',
  'account or role is inactive': 'error.accountInactive',
  'password must be changed before continuing': 'error.mustChangePassword',
  'cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK':
    'error.depotLocked',
  'item_text is required': 'error.itemTextRequired',
  'item_text must be at most 250 characters': 'error.itemTextTooLong',
  'eol_phase is required for EOL template items': 'error.eolPhaseRequired',
  'eol_phase is only valid on EOL template items': 'error.eolPhaseNotAllowed',
  'item_ids must list every item on the template exactly once':
    'error.reorderInvalid',
  'invalid token': 'error.invalidToken',
  'token expired': 'error.tokenExpired',
  'permission not granted': 'error.permissionDenied',
  'database rejected the change': 'error.dbRejected',
  'bu kullanıcı kayıtlarda kullanılmış, silinemez — pasife çekebilirsiniz':
    'error.userInUseUnknown',
};

export function translateApiError(t: Translate, err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (!msg) return t('common.error');

  const exact = EXACT[msg];
  if (exact) return t(exact);

  if (msg.startsWith('email domain is not allowed')) {
    const listed = msg.split('accepted domains:')[1]?.trim();
    return listed
      ? t('email.domainDenied', { listed })
      : t('email.domainDeniedShort');
  }

  const templateInUse = msg.match(
    /^bu madde (\d+) araçta kullanılmış, silinemez/,
  );
  if (templateInUse) {
    return t('error.templateItemInUse', { n: templateInUse[1] });
  }
  const userInUse = msg.match(
    /^bu kullanıcı (\d+) kayıtta kullanılmış, silinemez/,
  );
  if (userInUse) {
    return t('error.userInUse', { n: userInUse[1] });
  }

  const gate = msg.match(
    /^(\S+) gate blocked: (\d+) item\(s\) not OK\/CONDITIONAL_OK \(item ids: ([^)]+)\)/,
  );
  if (gate) {
    return t('error.gateBlocked', { type: gate[1], n: gate[2], ids: gate[3] });
  }
  const depot = msg.match(
    /^depot release blocked for (\S+): (\d+) open issue\(s\) remain \(issue ids: ([^)]+)\)/,
  );
  if (depot) {
    return t('error.depotReleaseBlocked', {
      vin: depot[1],
      n: depot[2],
      ids: depot[3],
    });
  }

  return msg;
}

export function translatePasswordError(t: Translate, err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'invalid credentials') return t('password.wrongCurrent');
  return translateApiError(t, err);
}
