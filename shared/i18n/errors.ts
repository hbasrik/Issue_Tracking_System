import {
  errorStatus,
  isServerError,
  isTimeoutError,
  isTransportError,
} from '../networkError';
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
  'password is too common or easy to guess': 'error.passwordTooCommon',
  'password must not be based on your name or email': 'error.passwordPersonal',
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
  'description must be at most 400 characters': 'error.descTooLong',
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
  'client_request_id must be a uuid': 'error.clientRequestIdInvalid',
  'bu kullanıcı kayıtlarda kullanılmış, silinemez — pasife çekebilirsiniz':
    'error.userInUseUnknown',
  'this endpoint has been retired': 'error.endpointRetired',
  'image file could not be decoded; upload a valid JPEG or PNG':
    'error.undecodableImage',
  'hold reason is required': 'error.holdReasonRequired',
  'vehicle is not on hold': 'error.notOnHold',
  'vehicle cannot be placed on hold from its current status':
    'error.holdNotAllowed',
  'code, name_tr and name_en are required': 'error.catalogFieldsRequired',
  'code is too long': 'error.catalogCodeTooLong',
  'name_tr or name_en is too long': 'error.catalogNameTooLong',
  'catalogue code already exists': 'error.catalogCodeTaken',
  'reorder id list is invalid': 'error.catalogReorderInvalid',
  'zone_id is required': 'error.zoneRequired',
  'defect part is required': 'error.defectPartRequired',
  'defect type is required': 'error.defectTypeRequired',
  'custom part name is required for Other': 'error.customPartNameRequired',
  'custom defect name is required for Other': 'error.customDefectNameRequired',
  'selected catalogue item is inactive': 'error.catalogItemInactive',
  "selected part's zone is inactive": 'error.zoneInactive',
  'parts cannot be added to an inactive zone': 'error.zoneClosedForParts',
  'the Other catalogue rows are protected': 'error.catalogProtected',
  'part code must be the zone code, a dash and two digits': 'error.partCodeFormatGeneric',
  'defect type code must be two digits': 'error.typeCodeFormat',
  'a part with this name already exists in the zone': 'error.partNameTaken',
  'a defect type with this name already exists': 'error.typeNameTaken',
  'responsible process is required': 'error.processRequired',
  'selected process is inactive': 'error.processInactive',
  'promote kind must be part or type': 'error.promoteKindInvalid',
  'custom name to promote is required': 'error.promoteNameRequired',
  'template item_no conflict': 'error.templateItemNoConflict',
  'internal server error': 'error.server',
};

/**
 * Anything the backend sends that is not in the catalogue (malformed-input
 * 400s, middleware errors, raw trigger text) is technical; show a generic
 * sentence for the status instead of the English payload.
 */
function genericForStatus(t: Translate, status: number): string {
  if (status === 401) return t('error.invalidToken');
  if (status === 403) return t('error.forbidden');
  if (status === 404) return t('error.notFound');
  if (status === 409) return t('error.conflict');
  if (status === 410) return t('error.endpointRetired');
  if (status === 413) return t('error.tooLarge');
  if (status === 429) return t('error.tooManyRequests');
  if (status >= 400 && status < 500) return t('error.badRequest');
  return t('common.error');
}

/** Split message + optional 5xx request id for UI that wants a copyable code. */
export type ApiErrorParts = {
  message: string;
  requestId?: string;
};

type ErrorLike = {
  status?: number;
  body?: { request_id?: string; error?: string };
  requestId?: string;
  message?: string;
};

/** Request id shown to users only for unexpected server failures (5xx). */
export function serverErrorRequestId(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as ErrorLike;
  const status = typeof e.status === 'number' ? e.status : 0;
  if (status < 500) return undefined;
  const fromBody =
    typeof e.body?.request_id === 'string' ? e.body.request_id.trim() : '';
  if (fromBody) return fromBody;
  const fromField = typeof e.requestId === 'string' ? e.requestId.trim() : '';
  return fromField || undefined;
}

function translateApiErrorMessage(t: Translate, err: unknown): string {
  if (isTimeoutError(err)) return t('error.timeout');
  if (isServerError(err)) return t('error.server');
  if (isTransportError(err)) return t('error.offline');

  const status = errorStatus(err);
  const msg = err instanceof Error ? err.message : '';
  if (!msg) return status != null ? genericForStatus(t, status) : t('common.error');

  const exact = EXACT[msg];
  if (exact) return t(exact);

  const partCode = msg.match(
    /^part code must be the zone code, a dash and two digits: expected (\S+)$/,
  );
  if (partCode) return t('error.partCodeFormat', { expected: partCode[1] });

  // Wrapped sentinels: "invalid status transition: vehicle status changes …"
  const colon = msg.indexOf(':');
  if (colon > 0) {
    const wrapped = EXACT[msg.slice(0, colon)];
    if (wrapped) return t(wrapped);
  }

  if (msg.startsWith('email domain is not allowed')) {
    const listed = msg.split('accepted domains:')[1]?.trim();
    return listed
      ? t('email.domainDenied', { listed })
      : t('email.domainDeniedShort');
  }

  const loginLimited = msg.match(
    /^too many failed login attempts\. try again in (\d+) minutes$/,
  );
  if (loginLimited) {
    return t('error.loginRateLimited', { minutes: loginLimited[1] });
  }

  const templateInUse = msg.match(/^bu madde (\d+) araçta /);
  if (templateInUse) {
    return t('error.templateItemInUse', { n: templateInUse[1] });
  }
  const userInUse = msg.match(
    /^bu kullanıcı (\d+) kayıtta kullanılmış, silinemez/,
  );
  if (userInUse) {
    return t('error.userInUse', { n: userInUse[1] });
  }
  const catalogInUse = msg.match(
    /^(?:bu (?:bölge|parça|kusur tipi|süreç)|katalog maddesi) (\d+) kayıtta kullanılmış/,
  );
  if (catalogInUse) {
    return t('error.catalogInUse', { n: catalogInUse[1] });
  }
  const propagationEmpty = msg.match(
    /^catalogue item created but scope "[^"]*" matched 0 vehicles; (\d+) assigned/,
  );
  if (propagationEmpty) {
    return t('error.propagationEmpty', { n: propagationEmpty[1] });
  }

  const gate = msg.match(
    /^(\S+) gate blocked: (\d+) item\(s\) not OK\/CONDITIONAL_OK \(item ids: ([^)]+)\)/,
  );
  if (gate) {
    return t('error.gateBlocked', { type: checklistTypeName(t, gate[1]), n: gate[2], ids: gate[3] });
  }
  const gateAny = msg.match(/^(\S+) gate blocked/);
  if (gateAny) {
    return t('error.gateBlockedGeneric', { type: checklistTypeName(t, gateAny[1]) });
  }
  const branchShip = msg.match(
    /^branch ship blocked for (\S+): (\d+) gate\(s\) incomplete/,
  );
  if (branchShip) {
    return t('error.branchShipBlocked', { vin: branchShip[1], n: branchShip[2] });
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
  const dbGate = msg.match(/^Cannot (?:move|ship|release|mark) vehicle (\S+)/);
  if (dbGate) {
    return t('error.dbVehicleGate', { vin: dbGate[1] });
  }

  // Errors built on the client already carry translated copy.
  if (status == null) return msg;
  return genericForStatus(t, status);
}

function checklistTypeName(t: Translate, type: string): string {
  switch (type.toUpperCase()) {
    case 'EOL':
      return t('templates.typeEol');
    case 'SHIPMENT':
      return t('templates.typeShipment');
    case 'TEST':
      return t('templates.typeTest');
    default:
      return type;
  }
}

export function describeApiError(t: Translate, err: unknown): ApiErrorParts {
  return {
    message: translateApiErrorMessage(t, err),
    requestId: serverErrorRequestId(err),
  };
}

export function translateApiError(t: Translate, err: unknown): string {
  const { message, requestId } = describeApiError(t, err);
  if (!requestId) return message;
  return `${message}\n${t('error.requestCode', { id: requestId })}`;
}

export function translatePasswordError(t: Translate, err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'invalid credentials') return t('password.wrongCurrent');
  return translateApiError(t, err);
}
