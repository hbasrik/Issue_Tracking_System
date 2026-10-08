import assert from 'node:assert/strict';
import { checklistCriteriaLines } from './checklistCriteria.ts';

const template = { AcceptanceCriterion: 'Kriter B', ControlMethod: 'Yöntem B', FormRevision: 'Rev. B' };
const copy = { AcceptanceCriterion: 'Kriter A', ControlMethod: null, FormRevision: 'Rev. A', CopiedAt: '2026-10-08T10:00:00Z' };
const texts = (lines: { kind: string; text: string }[]) => lines.map((l) => `${l.kind}=${l.text}`);

// PENDING: template in both contexts.
const pending = { Status: 'PENDING', ...template };
assert.deepEqual(texts(checklistCriteriaLines(pending, 'record', { revision: true })),
  ['criterion=Kriter B', 'method=Yöntem B', 'revision=Rev. B']);
assert.deepEqual(texts(checklistCriteriaLines(pending, 'edit')), ['criterion=Kriter B', 'method=Yöntem B']);

// Answered with a copy: record reads the copy, edit the template.
const answered = { Status: 'NOT_OK', ...template, AnsweredCriteria: copy };
assert.deepEqual(texts(checklistCriteriaLines(answered, 'record', { revision: true })),
  ['criterion=Kriter A', 'revision=Rev. A']);
assert.deepEqual(texts(checklistCriteriaLines(answered, 'record')), ['criterion=Kriter A']);
assert.deepEqual(texts(checklistCriteriaLines(answered, 'edit')), ['criterion=Kriter B', 'method=Yöntem B']);

// Answered without a copy: record shows nothing, never the template.
const legacy = { Status: 'OK', ...template, AnsweredCriteria: null };
assert.deepEqual(checklistCriteriaLines(legacy, 'record', { revision: true }), []);
assert.deepEqual(checklistCriteriaLines({ Status: 'OK', ...template }, 'record'), []);

// Copy taken when the form gave none: nothing.
const emptyCopy = { Status: 'OK', ...template, AnsweredCriteria: { CopiedAt: '2026-10-08T10:00:00Z' } };
assert.deepEqual(checklistCriteriaLines(emptyCopy, 'record', { revision: true }), []);

// Blank values never produce a line.
assert.deepEqual(checklistCriteriaLines({ Status: 'PENDING', AcceptanceCriterion: '  ', ControlMethod: '' }, 'edit'), []);

console.log('shared/checklistCriteria.ts ok');
