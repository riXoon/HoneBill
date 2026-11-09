/**
 * Geometry of the honeycomb wall used by the "Enter HoneBill" transition. Pure maths (no React Native), so it
 * can be tested on its own.
 *
 * Pointy-top hexagons: width = sqrt(3) * radius, height = 2 * radius, rows 1.5 * radius apart, odd rows shifted
 * by half a width. A hexagon tiling covers the plane, and every point is within `radius` of some cell centre.
 */
export type HexCell = {
  key: string;
  /** Centre, in screen points. */
  x: number;
  y: number;
  /** Which of the three wax tones to fill with. */
  tone: 0 | 1 | 2;
  /** Distance from the screen centre as a 0-1 fraction of the farthest cell: the centre opens first. */
  distance: number;
};

export function hexWidth(radius: number): number {
  return Math.sqrt(3) * radius;
}

/** The cells needed to cover a `width` x `height` screen, plus one ring of margin so no edge shows a gap. */
export function buildHiveGrid(width: number, height: number, radius: number): HexCell[] {
  const w = hexWidth(radius);
  const rowStep = 1.5 * radius;
  const cx = width / 2;
  const cy = height / 2;
  const rowsHalf = Math.ceil(cy / rowStep) + 1;
  const colsHalf = Math.ceil(cx / w) + 1;

  const cells: Omit<HexCell, 'distance'>[] = [];
  for (let row = -rowsHalf; row <= rowsHalf; row += 1) {
    const y = cy + row * rowStep;
    // Odd rows sit half a cell over. Use the absolute row so the centre row (0) is always a cell centre at cx.
    const shift = Math.abs(row) % 2 === 1 ? w / 2 : 0;
    for (let col = -colsHalf; col <= colsHalf; col += 1) {
      const x = cx + col * w + shift;
      // Keep only cells that touch the screen (a cell reaches `w / 2` sideways and `radius` up and down).
      if (x < -w / 2 || x > width + w / 2 || y < -radius || y > height + radius) continue;
      cells.push({ key: `${row}:${col}`, x, y, tone: ((((row + col) % 3) + 3) % 3) as 0 | 1 | 2 });
    }
  }

  const farthest = Math.max(...cells.map((c) => Math.hypot(c.x - cx, c.y - cy)), 1);
  return cells.map((c) => ({ ...c, distance: Math.hypot(c.x - cx, c.y - cy) / farthest }));
}

/**
 * The SVG polygon for one cell: a regular hexagon inset by `inset` so neighbouring cells leave a thin gap that
 * the glow behind shows through.
 */
export function hexPolygon(radius: number, inset: number): { width: number; height: number; points: string } {
  const width = hexWidth(radius);
  const height = 2 * radius;
  const r = radius - inset;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return `${(width / 2 + r * Math.cos(angle)).toFixed(2)},${(radius + r * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
  return { width, height, points };
}
