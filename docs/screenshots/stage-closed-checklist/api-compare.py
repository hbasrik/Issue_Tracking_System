import json, sys, urllib.request, urllib.error

TOK = open('/tmp/karea-verify/tok').read().strip()
OLD, NEW = 18081, 18082
TYPES = ('shipment', 'test', 'eol')


def call(port, path, body=None):
    req = urllib.request.Request(
        f'http://localhost:{port}/api/v1{path}',
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'},
        method='GET' if body is None else 'POST')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def split(items):
    """Mirror of shared/checklistActive.ts splitChecklistByActive."""
    active, closed, inactive = [], [], []
    for it in items:
        if it.get('IsActive') is False:
            inactive.append(it)
        elif it.get('StageClosed') is True:
            closed.append(it)
        else:
            active.append(it)
    return active, closed, inactive


def counts(active):
    passing = sum(1 for i in active if i['Status'] in ('OK', 'CONDITIONAL_OK'))
    return passing, len(active)


def strip(items):
    return [{k: v for k, v in i.items() if k != 'StageClosed'} for i in items]


_, lst = call(NEW, '/vehicles?page_size=100')
vins = sorted(v['VIN'] for v in lst['Items'])
ok = True
rows = []
for vin in vins:
    _, veh_new = call(NEW, f'/vehicles/{vin}')
    _, veh_old = call(OLD, f'/vehicles/{vin}')
    veh_new = veh_new.get('vehicle', veh_new)
    veh_old = veh_old.get('vehicle', veh_old)
    status = veh_new['CurrentGlobalStatus']
    _, eol_new = call(NEW, f'/vehicles/{vin}/eol')
    _, eol_old = call(OLD, f'/vehicles/{vin}/eol')
    passed = bool((eol_new.get('branch_ship') or {}).get('at')) or status in ('DELIVERED', 'SHIPPED')
    per = {}
    for typ in TYPES:
        _, a = call(NEW, f'/vehicles/{vin}/checklist/{typ}')
        _, b = call(OLD, f'/vehicles/{vin}/checklist/{typ}')
        ia, ib = a.get('items') or [], b.get('items') or []
        act, closed, inact = split(ia)
        old_act = [i for i in ib if i.get('IsActive') is not False]
        p, t = counts(act)
        op, ot = counts(old_act)
        per[typ] = dict(new=f'{p}/{t}', old=f'{op}/{ot}', closed=len(closed),
                        closed_nos=[c['ItemNo'] for c in closed])
        if not passed:
            if closed:
                ok = False; print('LINE VEHICLE HAS CLOSED', vin, typ, closed)
            if strip(ia) != strip(ib):
                ok = False; print('LINE VEHICLE CHANGED', vin, typ)
    g_new = eol_new.get('gates', {})
    g_old = eol_old.get('gates', {})
    _, rd_new = call(NEW, f'/vehicles/{vin}/shipment-readiness')
    _, rd_old = call(OLD, f'/vehicles/{vin}/shipment-readiness')
    if not passed:
        if g_new != g_old or rd_new != rd_old or veh_new['TotalProgressPercentage'] != veh_old['TotalProgressPercentage']:
            ok = False; print('LINE VEHICLE GATE/READINESS/PROGRESS CHANGED', vin)
    rows.append(dict(
        vin=vin, status=status, stage_passed=bool(passed),
        progress_new=veh_new['TotalProgressPercentage'], progress_old=veh_old['TotalProgressPercentage'],
        branch_eol_remaining_old=g_old.get('branch_ship', {}).get('branch_eol_remaining'),
        branch_eol_remaining_new=g_new.get('branch_ship', {}).get('branch_eol_remaining'),
        shipment_remaining_old=g_old.get('branch_ship', {}).get('shipment_remaining'),
        shipment_remaining_new=g_new.get('branch_ship', {}).get('shipment_remaining'),
        readiness_new_warnings=len(rd_new.get('warnings') or []),
        checklists=per))

print(f"{'VIN':18} {'STATUS':13} {'PASSED':6} {'SHIP new/old':>14} {'kapali':>6} {'EOL new/old':>12} {'kapali':>6} {'BR-EOL kalan o/n':>16} {'SHIP kalan o/n':>14} {'%':>6}")
for r in rows:
    c = r['checklists']
    print(f"{r['vin']:18} {r['status']:13} {str(r['stage_passed']):6} "
          f"{c['shipment']['new'] + ' / ' + c['shipment']['old']:>14} {c['shipment']['closed']:>6} "
          f"{c['eol']['new'] + ' / ' + c['eol']['old']:>12} {c['eol']['closed']:>6} "
          f"{str(r['branch_eol_remaining_old']) + ' / ' + str(r['branch_eol_remaining_new']):>16} "
          f"{str(r['shipment_remaining_old']) + ' / ' + str(r['shipment_remaining_new']):>14} {r['progress_new']:>6}")
json.dump(rows, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
print('LINE VEHICLES UNCHANGED' if ok else 'LINE VEHICLE DIFF FOUND')
