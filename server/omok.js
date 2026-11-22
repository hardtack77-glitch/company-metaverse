// ⚫ 오목 AI (15×15, 흑=사람 선공, 백=NPC) — 5목 이상이면 승리
export const N = 15;
export const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill(0));
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

export function isWin(b, x, y, c) {
  for (const [dx, dy] of DIRS) {
    let n = 1;
    for (const s of [1, -1]) for (let k = 1; k < 6; k++) {
      const X = x + dx * k * s, Y = y + dy * k * s;
      if (!inside(X, Y) || b[Y][X] !== c) break;
      n++;
    }
    if (n >= 5) return true;
  }
  return false;
}

// (x,y)에 c 를 놓았을 때의 공격 점수 (방향별로 연속 개수·열린 끝 수)
function lineScore(b, x, y, c) {
  let total = 0;
  for (const [dx, dy] of DIRS) {
    let cnt = 1, open = 0, gap = 0;
    for (const s of [1, -1]) {
      let k = 1;
      while (true) {
        const X = x + dx * k * s, Y = y + dy * k * s;
        if (inside(X, Y) && b[Y][X] === c) { cnt++; k++; continue; }
        if (inside(X, Y) && b[Y][X] === 0) {
          open++;
          // 한 칸 띄고 같은 돌 (예: ●●_●)
          const X2 = X + dx * s, Y2 = Y + dy * s;
          if (inside(X2, Y2) && b[Y2][X2] === c) gap++;
        }
        break;
      }
    }
    if (cnt >= 5) total += 1e7;
    else if (cnt === 4) total += open === 2 ? 1e6 : open === 1 ? 1e5 : 0;
    else if (cnt === 3) total += open === 2 ? (gap ? 2e5 : 5e4) : open === 1 ? 3e3 : 0;
    else if (cnt === 2) total += open === 2 ? (gap ? 4e3 : 1e3) : open === 1 ? 100 : 0;
    else total += open === 2 ? (gap ? 300 : 20) : open === 1 ? 4 : 0;
  }
  return total;
}

export function aiMove(b, me = 2, you = 1, rand = Math.random) {
  const cands = [];
  let any = false;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (b[y][x]) { any = true; continue; }
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (inside(X, Y) && b[Y][X]) { near = true; break; }
    }
    if (near) cands.push([x, y]);
  }
  if (!any) return [7, 7];
  let best = null, bestScore = -1;
  for (const [x, y] of cands) {
    const atk = lineScore(b, x, y, me);
    const def = lineScore(b, x, y, you);
    const center = 7 - Math.max(Math.abs(x - 7), Math.abs(y - 7));
    const s = atk * 1.1 + def + center + rand() * 3;
    if (s > bestScore) { bestScore = s; best = [x, y]; }
  }
  return best;
}
