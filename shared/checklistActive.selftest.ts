import assert from 'node:assert/strict';
import {
  activeIncompleteChecklistItems,
  countActiveChecklistProgress,
  filterByEolPhase,
  splitChecklistByActive,
} from './checklistActive.ts';

const items = [
  { ItemID: 1, Status: 'OK', IsActive: true, EolPhase: 'DEPOT' },
  { ItemID: 2, Status: 'PENDING', IsActive: true, EolPhase: 'DEPOT' },
  { ItemID: 3, Status: 'OK', IsActive: false, EolPhase: 'DEPOT' },
  { ItemID: 4, Status: 'OK', IsActive: true, EolPhase: 'BRANCH' },
];

const depot = filterByEolPhase(items, 'DEPOT');
const { active, inactiveHistorical } = splitChecklistByActive(depot);
assert.equal(active.length, 2);
assert.equal(inactiveHistorical.length, 1);
assert.equal(inactiveHistorical[0]?.ItemID, 3);

const counts = countActiveChecklistProgress(active);
assert.equal(counts.total, 2);
assert.equal(counts.passing, 1);
assert.equal(counts.remaining, 1);
assert.equal(counts.evaluated, 1);

const incomplete = activeIncompleteChecklistItems(active);
assert.deepEqual(
  incomplete.map((i) => i.ItemID),
  [2],
);

assert.equal(
  countActiveChecklistProgress(
    splitChecklistByActive([
      { ItemID: 10, Status: 'OK', IsActive: true },
      { ItemID: 11, Status: 'OK', IsActive: true },
      { ItemID: 12, Status: 'OK', IsActive: false },
    ]).active,
  ).remaining,
  0,
);
assert.equal(
  countActiveChecklistProgress(
    splitChecklistByActive([
      { ItemID: 10, Status: 'PENDING', IsActive: true },
      { ItemID: 11, Status: 'OK', IsActive: true },
      { ItemID: 12, Status: 'OK', IsActive: false },
    ]).active,
  ).remaining,
  1,
);

console.log('shared/checklistActive.ts ok');
