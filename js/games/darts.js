// Darts: throw the dart in an arc at a board on the wall (seen at an angle). Hit the bull's ring to score.
import { fileTag, sky } from './core.js';

const { Bodies, Body } = Matter;
const WALL_X = 812;
const BOARD_Y = 215;
const BOARD_R = 92;  // half height of the drawn board
const BULL = 26;     // scoring zone: ± px around the centre (bull + inner ring)

export default {
  id: 'darts',
  create(api) {
    const dart = Bodies.circle(0, 0, 4, { frictionAir: 0.002, density: 0.004 });
    api.add(dart);
    let stuck = null; // { y, angle } once the dart hits the wall
    let angle = 0;
    let wobble = 0;

    return {
      reset() { stuck = null; angle = 0; api.useSling(dart, { x: 150, y: 330 }, { maxPull: 160, power: 0.2 }); },
      update() {
        if (!stuck && !dart.isStatic && dart.speed > 0.5) angle = Math.atan2(dart.velocity.y, dart.velocity.x);
      },
      judge() {
        const p = dart.position;
        if (!stuck && p.x >= WALL_X) {
          // The tip sinks into the wall/board where it arrives.
          stuck = { y: p.y, angle };
          Body.setStatic(dart, true);
          Body.setPosition(dart, { x: WALL_X, y: p.y });
          wobble = 18;
          const off = Math.abs(p.y - BOARD_Y);
          api.focus = { x: WALL_X, y: p.y };
          if (off <= BULL) return api.score('scoreDarts');
          return api.miss(off <= BOARD_R ? 'missDarts' : 'missGeneric');
        }
        if (!stuck) api.defaultJudge(dart, { maxSeconds: 4 });
      },
      draw(g) {
        const t = api.theme;
        sky(g, api, api.H);
        // Wall and floor of a bar.
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(WALL_X, 0, api.W - WALL_X, api.H);
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 440, api.W, 60);
        g.fillStyle = t.accent; g.fillRect(120, 438, 70, 4); // throw line (oche)
        // Board seen at an angle: concentric ellipses.
        const cx = WALL_X + 14;
        const rings = [[1, '#111827'], [0.86, '#f5f5dc'], [0.62, '#111827'], [0.5, '#f5f5dc'], [BULL / BOARD_R + 0.06, '#16a34a'], [BULL / BOARD_R * 0.55, '#dc2626']];
        g.fillStyle = '#7c2d12'; g.beginPath(); g.ellipse(cx + 2, BOARD_Y, 26, BOARD_R + 10, 0, 0, 7); g.fill();
        for (const [k, c] of rings) { g.fillStyle = c; g.beginPath(); g.ellipse(cx, BOARD_Y, 22 * k, BOARD_R * k, 0, 0, 7); g.fill(); }
        // Thin red/green segments on the doubles ring.
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          g.strokeStyle = i % 2 ? '#dc2626' : '#16a34a'; g.lineWidth = 3;
          g.beginPath(); g.ellipse(cx, BOARD_Y, 20, BOARD_R * 0.93, 0, a, a + Math.PI / 20); g.stroke();
        }
        // Scoring zone marker.
        g.strokeStyle = t.accent; g.globalAlpha = 0.5; g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(WALL_X - 30, BOARD_Y - BULL); g.lineTo(WALL_X - 6, BOARD_Y - BULL); g.moveTo(WALL_X - 30, BOARD_Y + BULL); g.lineTo(WALL_X - 6, BOARD_Y + BULL); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
        // Dart: barrel along the flight direction, flights at the back.
        const p = dart.position;
        const a = stuck ? stuck.angle + Math.sin(wobble) * (wobble-- > 0 ? wobble / 200 : 0) : angle;
        g.save(); g.translate(p.x, p.y); g.rotate(a);
        g.fillStyle = '#9ca3af'; g.fillRect(-6, -1, 10, 2); // tip
        g.fillStyle = '#e5e7eb'; g.beginPath(); g.roundRect(-30, -3, 24, 6, 3); g.fill(); // barrel
        g.fillStyle = t.accent2; g.beginPath(); g.moveTo(-30, 0); g.lineTo(-44, -9); g.lineTo(-40, 0); g.lineTo(-44, 9); g.fill(); // flights
        g.restore();
        if (api.phase === 'aim') fileTag(g, api, p.x - 16, p.y);
      },
    };
  },
};
