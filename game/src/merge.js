// mergeGeometries — merge indexed, vertex-colored parts into one geometry's
// arrays, so many static pieces draw in ONE call (threejs-performance:
// merge static geometry; threejs-geometry: built-ins are indexed).
// Pure array math, no THREE import — runs in node tests.
// Each part: { positions, normals, uvs?, color: [r, g, b] 0..1, index }.
// All parts must share the same attribute set. Returns merged
// { positions, normals, uvs|null, colors, index } as typed arrays.
export function mergeGeometries(parts) {
  if (!parts || parts.length === 0) throw new Error('mergeGeometries: no parts');
  const hasUv = parts[0].uvs !== undefined;
  for (const part of parts) {
    if (!part.positions || !part.normals || !part.index) {
      throw new Error('mergeGeometries: part needs positions, normals, index');
    }
    if (part.positions.length % 3 !== 0) {
      throw new Error('mergeGeometries: positions must be triples');
    }
    if ((part.uvs !== undefined) !== hasUv) {
      throw new Error('mergeGeometries: uv mismatch between parts');
    }
    if (!part.color || part.color.length !== 3) {
      throw new Error('mergeGeometries: part needs color [r, g, b]');
    }
  }
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const index = [];
  let offset = 0;
  for (const part of parts) {
    const n = part.positions.length / 3;
    positions.push(...part.positions);
    normals.push(...part.normals);
    if (hasUv) uvs.push(...part.uvs);
    for (let i = 0; i < n; i += 1) colors.push(part.color[0], part.color[1], part.color[2]);
    for (const idx of part.index) index.push(idx + offset);
    offset += n;
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: hasUv ? Float32Array.from(uvs) : null,
    colors: Float32Array.from(colors),
    index: Uint32Array.from(index),
  };
}
