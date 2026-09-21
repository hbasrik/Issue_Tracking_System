#!/usr/bin/env node
/**
 * Live negative checks for the six security hardenings.
 *
 * HARD RULE: never mutate an existing row. Create temp users / role / issue /
 * media via the API, then delete only those IDs. Existing media_attachments,
 * issues, vehicles, and seed users are read-only for this script.
 */
import { execFileSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:8080';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? (process.env.UPLOAD_DIR.startsWith('/')
      ? process.env.UPLOAD_DIR
      : join(ROOT, process.env.UPLOAD_DIR))
  : join(ROOT, 'backend', 'uploads');

const results = [];
const created = {
  userIds: [],
  roleId: null,
  issueId: null,
  mediaId: null,
  mediaPath: null,
};

function check(name, cond, detail) {
  results.push([name, Boolean(cond), detail]);
  console.log(cond ? 'PASS' : 'FAIL', '-', name, ':', detail);
}

async function req(method, path, { token, data, rawBody, contentType } = {}) {
  const headers = {};
  let body;
  if (rawBody != null) {
    body = rawBody;
    if (contentType) headers['Content-Type'] = contentType;
  } else if (data !== undefined) {
    body = JSON.stringify(data);
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get('content-type') || '';
  let parsed;
  if (ctype.includes('json')) {
    parsed = buf.length ? JSON.parse(buf.toString('utf8')) : null;
  } else {
    parsed = buf;
  }
  return { status: res.status, body: parsed };
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'karea', '-d', 'karea', '-t', '-A', '-c', sql],
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
}

/** Tiny valid JPEG for disposable uploads only. */
const TINY_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103011100021101031101ffc40014000100000000000000000000000000000008ffc40014100100000000000000000000000000000000ffda000c0301000210031000003f00bf80ffd9',
  'hex',
);

function multipart(fields, fileField, fileName, fileBuf) {
  const boundary = '----karea' + randomUUID().replace(/-/g, '');
  const chunks = [];
  for (const [name, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
  );
  chunks.push(fileBuf);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function createUser(mgrToken, email, role) {
  const { status, body } = await req('POST', '/api/v1/users', {
    token: mgrToken,
    data: { full_name: `Temp ${email.split('@')[0]}`, email, role },
  });
  check(`create ${email}`, status === 201, String(status));
  const uid = body?.user?.ID ?? body?.user?.id;
  const tmp = body?.temporary_password;
  created.userIds.push(uid);
  const login1 = await req('POST', '/api/v1/auth/login', {
    data: { email, password: tmp },
  });
  const pw = 'TempPass9x';
  const ch = await req('POST', '/api/v1/auth/change-password', {
    token: login1.body.token,
    data: {
      current_password: tmp,
      new_password: pw,
      confirm_password: pw,
    },
  });
  check(`change-password ${email}`, ch.status === 200, String(ch.status));
  const login2 = await req('POST', '/api/v1/auth/login', {
    data: { email, password: pw },
  });
  check(`relogin ${email}`, login2.status === 200 && !!login2.body?.token, String(login2.status));
  return { uid, token: login2.body.token, password: pw, email };
}

async function cleanup(mgrToken) {
  // Media first (FK-safe), then issue, users, role — only our IDs.
  if (created.mediaId != null) {
    const before = psql(`SELECT count(*) FROM media_attachments WHERE id = ${Number(created.mediaId)}`);
    psql(`DELETE FROM media_attachments WHERE id = ${Number(created.mediaId)}`);
    const after = psql(`SELECT count(*) FROM media_attachments WHERE id = ${Number(created.mediaId)}`);
    check('delete own media row', before === '1' && after === '0', `id=${created.mediaId}`);
  }
  if (created.mediaPath) {
    const fp = join(UPLOAD_DIR, created.mediaPath);
    if (existsSync(fp)) {
      unlinkSync(fp);
      check('delete own media file', !existsSync(fp), fp);
    }
  }
  if (created.issueId != null) {
    psql(`DELETE FROM audit_logs WHERE metadata->>'issue_id' = '${created.issueId}'`);
    psql(`DELETE FROM issue_list WHERE id = ${Number(created.issueId)}`);
    check(
      'delete own issue',
      psql(`SELECT count(*) FROM issue_list WHERE id = ${Number(created.issueId)}`) === '0',
      String(created.issueId),
    );
  }
  for (const uid of created.userIds) {
    if (!uid) continue;
    await req('PATCH', `/api/v1/users/${uid}`, {
      token: mgrToken,
      data: { is_active: true },
    });
    const del = await req('DELETE', `/api/v1/users/${uid}`, { token: mgrToken });
    check(`delete user ${uid}`, del.status === 204 || del.status === 200, String(del.status));
  }
  if (created.roleId != null) {
    psql(`DELETE FROM role_permissions WHERE role_id = ${Number(created.roleId)}`);
    psql(`DELETE FROM roles WHERE id = ${Number(created.roleId)}`);
    check(
      'delete own role',
      psql(`SELECT count(*) FROM roles WHERE id = ${Number(created.roleId)}`) === '0',
      String(created.roleId),
    );
  }
}

async function main() {
  let mgrToken;
  try {
    const login = await req('POST', '/api/v1/auth/login', {
      data: { email: 'manager@karea.local', password: 'changeme123' },
    });
    if (login.status !== 200) throw new Error(`manager login ${login.status}`);
    mgrToken = login.body.token;

    const suffix = randomUUID().slice(0, 8);
    const roleCode = `SEC_TMP_${suffix.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const roleRes = await req('POST', '/api/v1/roles', {
      token: mgrToken,
      data: { code: roleCode, name: 'Security verify temp' },
    });
    check('create temp role', roleRes.status === 201, String(roleRes.status));
    created.roleId = roleRes.body?.id;

    const matrix = await req('GET', '/api/v1/rbac', { token: mgrToken });
    const perms = (matrix.body?.permissions || []).map((p) => p.code);
    const grant = ['analysis.view', 'web.access'].filter((c) => perms.includes(c));
    if (created.roleId != null) {
      const put = await req('PUT', `/api/v1/roles/${created.roleId}/permissions`, {
        token: mgrToken,
        data: { permissions: grant },
      });
      check('grant limited perms', put.status === 200, grant.join(','));
    }

    const viewer = await createUser(
      mgrToken,
      `sec.viewer.${suffix}@karea.local`,
      'OPERATOR',
    );
    const noview = await createUser(mgrToken, `sec.noview.${suffix}@karea.local`, roleCode);
    const op = await createUser(mgrToken, `sec.op.${suffix}@karea.local`, 'OPERATOR');
    const pwUser = await createUser(mgrToken, `sec.pw.${suffix}@karea.local`, 'OPERATOR');

    // Own issue + own media (never reuse existing media_attachments rows).
    const vin = psql(`SELECT vin FROM vehicles LIMIT 1`);
    const itype = psql(`SELECT id FROM issue_types LIMIT 1`);
    const partId = psql(
      `SELECT id FROM defect_parts WHERE is_active AND code <> '99-99' ORDER BY id LIMIT 1`,
    );
    const typeId = psql(
      `SELECT id FROM defect_types WHERE is_active AND code <> '99' ORDER BY id LIMIT 1`,
    );
    const stationId = psql(`SELECT id FROM stations WHERE is_active ORDER BY id LIMIT 1`);

    const issueRes = await req('POST', '/api/v1/issues', {
      token: viewer.token,
      data: {
        vin,
        source_type: 'MANUAL',
        station_id: Number(stationId),
        issue_type_id: Number(itype),
        severity: 'LOW',
        description: `SEC_VERIFY_${suffix}`,
        defect_part_id: Number(partId),
        defect_type_id: Number(typeId),
      },
    });
    created.issueId = issueRes.body?.ID ?? issueRes.body?.id;
    check(
      'create own issue',
      issueRes.status === 201 && created.issueId,
      `${issueRes.status} ${JSON.stringify(issueRes.body)}`,
    );

    if (!created.issueId) {
      throw new Error('abort media checks: own issue was not created');
    }

    const mp = multipart(
      { entity_type: 'ISSUE', entity_id: String(created.issueId) },
      'file',
      'sec-verify.jpg',
      TINY_JPEG,
    );
    const up = await req('POST', '/api/v1/media', {
      token: mgrToken,
      rawBody: mp.body,
      contentType: mp.contentType,
    });
    created.mediaId = up.body?.id;
    created.mediaPath = up.body?.storage_path;
    check(
      'upload own media',
      up.status === 201 && created.mediaId && created.mediaPath,
      `${up.status} ${created.mediaPath}`,
    );

    const unauth = await req('GET', `/uploads/${created.mediaPath}`);
    check('GET /uploads without token → 401', unauth.status === 401, String(unauth.status));

    const forbidden = await req('GET', `/uploads/${created.mediaPath}`, {
      token: noview.token,
    });
    check(
      'GET /uploads without vehicle.view → 403',
      forbidden.status === 403,
      String(forbidden.status),
    );

    const ok = await req('GET', `/uploads/${created.mediaPath}`, { token: viewer.token });
    const bytes = Buffer.isBuffer(ok.body) ? ok.body.length : 0;
    check('GET /uploads with vehicle.view → 200', ok.status === 200 && bytes > 0, `${ok.status} bytes=${bytes}`);

    const before = psql(
      `SELECT current_stage || '|' || (document_approved_at IS NOT NULL) FROM vehicle_eol_workflow WHERE vin='${vin}'`,
    );
    const retired = await req('POST', `/api/v1/vehicles/${vin}/eol/document-approve`, {
      token: mgrToken,
    });
    check('document-approve → 410', retired.status === 410, String(retired.status));
    const after = psql(
      `SELECT current_stage || '|' || (document_approved_at IS NOT NULL) FROM vehicle_eol_workflow WHERE vin='${vin}'`,
    );
    check('document-approve no state change', before === after, `before=${before} after=${after}`);

    const codes = (matrix.body?.permissions || []).map((p) => p.code);
    check(
      'document_approve not in matrix perms',
      !codes.includes('eol.document_approve'),
      'ok',
    );
    if (created.roleId != null) {
      const assign = await req('PUT', `/api/v1/roles/${created.roleId}/permissions`, {
        token: mgrToken,
        data: { permissions: [...grant, 'eol.document_approve'] },
      });
      check('assign document_approve rejected', assign.status >= 400, String(assign.status));
    }

    const longDesc = await req('POST', '/api/v1/issues', {
      token: viewer.token,
      data: {
        vin,
        source_type: 'MANUAL',
        station_id: Number(stationId),
        issue_type_id: Number(itype),
        severity: 'LOW',
        description: 'ü'.repeat(401),
        defect_part_id: Number(partId),
        defect_type_id: Number(typeId),
      },
    });
    const err = JSON.stringify(longDesc.body || {}).toLowerCase();
    check(
      'description >400 rejected',
      longDesc.status === 400 && err.includes('at most'),
      `${longDesc.status} ${err}`,
    );

    const vehMp = multipart(
      { entity_type: 'VEHICLE', entity_id: vin },
      'file',
      'x.jpg',
      TINY_JPEG,
    );
    const mediaForbidden = await req('POST', '/api/v1/media', {
      token: op.token,
      rawBody: vehMp.body,
      contentType: vehMp.contentType,
    });
    check(
      'POST /media VEHICLE as operator → 403',
      mediaForbidden.status === 403,
      String(mediaForbidden.status),
    );

    const opLogin = await req('POST', '/api/v1/auth/login', {
      data: { email: op.email, password: op.password },
    });
    const oldTok = opLogin.body.token;
    await new Promise((r) => setTimeout(r, 1100));
    const deact = await req('PATCH', `/api/v1/users/${op.uid}`, {
      token: mgrToken,
      data: { is_active: false },
    });
    check('deactivate temp user', deact.status === 200, String(deact.status));
    const dead = await req('GET', '/api/v1/vehicles', { token: oldTok });
    check('deactivated token → 401', dead.status === 401, String(dead.status));

    await new Promise((r) => setTimeout(r, 1100));
    const chpw = await req('POST', '/api/v1/auth/change-password', {
      token: pwUser.token,
      data: {
        current_password: pwUser.password,
        new_password: 'TempPass8y',
        confirm_password: 'TempPass8y',
      },
    });
    check('self password change', chpw.status === 200, String(chpw.status));
    const stale = await req('GET', '/api/v1/vehicles', { token: pwUser.token });
    check('old token after password change → 401', stale.status === 401, String(stale.status));
    const freshLogin = await req('POST', '/api/v1/auth/login', {
      data: { email: pwUser.email, password: 'TempPass8y' },
    });
    const fresh = await req('GET', '/api/v1/vehicles', {
      token: freshLogin.body.token,
    });
    check('new token after password change works', fresh.status === 200, String(fresh.status));
  } finally {
    if (mgrToken) await cleanup(mgrToken);
  }

  const failed = results.filter(([, ok]) => !ok);
  console.log('\n=== SUMMARY ===');
  for (const [name, ok, detail] of results) {
    if (!ok) console.log('FAIL', name, ':', detail);
  }
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
  console.log('verify-security-hardening: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
