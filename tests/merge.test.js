// mergeGeometries — pure array merge for vertex-colored static geometry.
// Parts are plain arrays (no THREE import), so this runs in node tests.
// Each part: { positions, normals, uvs?, color: [r, g, b] (0..1), index? }.
// All parts must share the same attribute set (positions + normals required,
// uvs optional but consistent, index required — all built-in geometries are
// indexed). Returns merged { positions, normals, uvs|null, colors, index }.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGeometries } from '../game/src/merge.js';

// A minimal indexed box: 8 corners, 12 triangles (positions only matter for counts).
function boxPart(color, ox = 0) {
  const positions = [];
  for (let i = 0; i < 8; i += 1) {
    positions.push(ox + (i & 1), (i >> 1) & 1, (i >> 2) & 1);
  }
  const normals = new Array(24).fill(0);
  const uvs = new Array(16).fill(0);
  const index = [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7, 0, 4, 1, 1, 4, 5, 2, 3, 6, 6, 3, 7, 0, 2, 4, 4, 2, 6, 1, 5, 3, 3, 5, 7];
  return { positions, normals, uvs, color, index };
}

test('mergeGeometries concatenates vertices and offsets indices', () => {
  const a = boxPart([1, 0, 0]);
  const b = boxPart([0, 0, 1], 10);
  const out = mergeGeometries([a, b]);
  assert.equal(out.positions.length, 48, `positions=${out.positions.length}`);
  assert.equal(out.colors.length, 48, `colors=${out.colors.length}`);
  assert.equal(out.index.length, 72, `index=${out.index.length}`);
  // Second part's indices are offset by 8 vertices.
  assert.equal(out.index[36], 8, `first index of part B=${out.index[36]}`);
  // Part B's first vertex kept its +10 offset.
  assert.equal(out.positions[24], 10, `part B x=${out.positions[24]}`);
});

test('mergeGeometries fills one flat color per part', () => {
  const out = mergeGeometries([boxPart([1, 0, 0]), boxPart([0, 1, 0])]);
  assert.deepEqual([...out.colors.slice(0, 3)], [1, 0, 0]);
  assert.deepEqual([...out.colors.slice(24, 27)], [0, 1, 0]);
});

test('mergeGeometries rejects mismatched attribute sets', () => {
  const a = boxPart([1, 0, 0]);
  const noUv = { ...boxPart([0, 0, 1]), uvs: undefined };
  assert.throws(() => mergeGeometries([a, noUv]), /uv/);
});
