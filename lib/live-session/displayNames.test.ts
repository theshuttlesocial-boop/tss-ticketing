import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayNames } from './displayNames';

const run = (...names: string[]) => {
  const players = names.map((name, i) => ({ id: `p${i}`, name }));
  const d = displayNames(players);
  return names.map((_, i) => d[`p${i}`]);
};

test('unique first names use the first name alone', () => {
  assert.deepEqual(run('Harry Thuva', 'Kristy Mallea', 'Saranya Sundar'),
    ['Harry', 'Kristy', 'Saranya']);
});

test('duplicate first names add the surname initial', () => {
  assert.deepEqual(run('Mo Ali', 'Mo Khan'), ['Mo A', 'Mo K']);
});

test('same surname initial extends until it separates them', () => {
  assert.deepEqual(run('Sam Smith', 'Sam Stone'), ['Sam Sm', 'Sam St']);
});

test('three-way collision extends only as far as needed', () => {
  assert.deepEqual(run('Sam Smith', 'Sam Stone', 'Sam Patel'),
    ['Sam Sm', 'Sam St', 'Sam Pa']);
});

test('identical full names fall back to numbering', () => {
  assert.deepEqual(run('Jo Patel', 'Jo Patel'), ['Jo Patel (1)', 'Jo Patel (2)']);
});

test('duplicate single names with no surname are numbered', () => {
  assert.deepEqual(run('Nitharshan', 'Nitharshan'), ['Nitharshan (1)', 'Nitharshan (2)']);
});

test('one player with a surname, one without, same first name', () => {
  const r = run('Mo', 'Mo Ali');
  assert.equal(new Set(r).size, 2, `labels must differ, got ${JSON.stringify(r)}`);
});

test('collisions are case-insensitive', () => {
  assert.deepEqual(run('mo ali', 'Mo Khan'), ['mo A', 'Mo K']);
});

test('unaffected players keep short names when others collide', () => {
  assert.deepEqual(run('Mo Ali', 'Mo Khan', 'Priya Nair'), ['Mo A', 'Mo K', 'Priya']);
});
