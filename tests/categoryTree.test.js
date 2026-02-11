import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryTree, reorderByIds } from '../src/utils/categoryTreeCore.js';

test('buildCategoryTree builds nested tree and sorts by sort_order', () => {
  const flat = [
    { id: 'b', name: 'B', parent_id: null, sort_order: 2 },
    { id: 'a', name: 'A', parent_id: null, sort_order: 1 },
    { id: 'c1', name: 'C1', parent_id: 'a', sort_order: 2 },
    { id: 'c0', name: 'C0', parent_id: 'a', sort_order: 1 },
  ];
  const { tree, map } = buildCategoryTree(flat);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].id, 'a');
  assert.equal(tree[1].id, 'b');
  assert.equal(map.get('a').children[0].id, 'c0');
  assert.equal(map.get('a').children[1].id, 'c1');
});

test('reorderByIds reorders subset and preserves others', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const out = reorderByIds(items, ['c', 'a']);
  assert.deepEqual(out.map((x) => x.id), ['c', 'a', 'b']);
});
