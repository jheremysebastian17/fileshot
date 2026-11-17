// Bowling (top view, no gravity): roll the ball down the lane and knock down at least 7 of 10 pins.
import { fileTag } from './core.js';

const { Bodies, Vector } = Matter;
const LANE_TOP = 165;
const LANE_BOTTOM = 335;
const NEEDED = 7;
const PIN_R = 9;

export default {
  id: 'bowling',
  gravity: 0,
  create(api) {
    const ball = Bodies.circle(0, 0, 17, { density: 0.02, frictionAir: 0.005, restitution: 0.15 });
    const pins = [];
    const spots = [];
    for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) spots.push({ x: 700 + row * 30, y: 250 + (i - row / 2) * 30 });
    api.add(
      ball,
      Bodies.rectangle(470, LANE_TOP - 10, 900, 20, { isStatic: true, restitution: 0.3 }), // gutter walls
      Bodies.rectangle(470, LANE_BOTTOM + 10, 900, 20, { isStatic: true, restitution: 0.3 }),
      Bodies.rectangle(900, 250, 20, 220, { isStatic: true, restitution: 0.1 }), // pit back wall
    );
    let settle = 0;
    const down = () => pins.filter((p, i) => Vector.magnitude(Vector.sub(p.position, spots[i])) > PIN_R * 1.4).length;

    return {
      reset() {
        api.remove(...pins);
        pins.length = 0;
        for (const s of spots) pins.push(Bodies.circle(s.x, s.y, PIN_R, { density: 0.0016, frictionAir: 0.045, restitution: 0.55 }));
        api.add(...pins);
        settle = 0;
        api.useSling(ball, { x: 110, y: 250 }, { maxPull: 150, power: 0.14 });
      },
      update() {},
      judge() {
        // Wait until the ball is gone/stopped, then let the pins settle before counting.
        if (!settle && (ball.position.x > 860 || ball.speed < 0.15 || api.flyFrames > 360)) settle = 1;
        if (settle && ++settle > 75) {
          const n = down();
          api.focus = { x: 740, y: 250 };
          if (n >= NEEDED) api.score(n === 10 ? 'scoreStrike' : 'scoreBowling', { n });
          else api.miss('missBowling', { n, need: NEEDED });
        }
      },
      draw(g) {
        const t = api.theme;
        g.fillStyle = t.bg; g.fillRect(0, 0, api.W, api.H);
        // Gutters and the wooden lane.
        g.fillStyle = '#1f2937'; g.fillRect(0, LANE_TOP - 24, api.W, 24); g.fillRect(0, LANE_BOTTOM, api.W, 24);
        const wood = g.createLinearGradient(0, LANE_TOP, 0, LANE_BOTTOM);
        wood.addColorStop(0, '#e9c48f'); wood.addColorStop(0.5, '#f4d7a8'); wood.addColorStop(1, '#e2b97f');
        g.fillStyle = wood; g.fillRect(0, LANE_TOP, api.W, LANE_BOTTOM - LANE_TOP);
        g.strokeStyle = 'rgba(120,72,24,.18)'; g.lineWidth = 1;
        for (let y = LANE_TOP + 10; y < LANE_BOTTOM; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(api.W, y); g.stroke(); }
        // Foul line and aiming arrows.
        g.fillStyle = '#7c2d12'; g.fillRect(170, LANE_TOP, 3, LANE_BOTTOM - LANE_TOP);
        g.fillStyle = 'rgba(124,45,18,.6)';
        for (let i = -2; i <= 2; i++) { const y = 250 + i * 26; const x = 330 + Math.abs(i) * 16; g.beginPath(); g.moveTo(x + 12, y); g.lineTo(x, y - 5); g.lineTo(x, y + 5); g.fill(); }
        // Pit.
        g.fillStyle = '#0f172a'; g.fillRect(860, LANE_TOP - 24, 40, LANE_BOTTOM - LANE_TOP + 48);
        // Pins (top view: white disc with a red neck ring), knocked pins are drawn tilted/faded.
        pins.forEach((p, i) => {
          const off = Vector.magnitude(Vector.sub(p.position, spots[i])) > PIN_R * 1.4;
          g.globalAlpha = off ? 0.55 : 1;
          g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(p.position.x + 2, p.position.y + 3, PIN_R, 0, 7); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.position.x, p.position.y, PIN_R, 0, 7); g.fill();
          g.strokeStyle = '#dc2626'; g.lineWidth = 2.5; g.beginPath(); g.arc(p.position.x, p.position.y, PIN_R * 0.55, 0, 7); g.stroke();
          g.globalAlpha = 1;
        });
        // Ball.
        const b = ball.position;
        g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(b.x + 3, b.y + 4, 17, 0, 7); g.fill();
        const grad = g.createRadialGradient(b.x - 6, b.y - 6, 2, b.x, b.y, 17);
        grad.addColorStop(0, '#818cf8'); grad.addColorStop(1, '#312e81');
        g.fillStyle = grad; g.beginPath(); g.arc(b.x, b.y, 17, 0, 7); g.fill();
        g.fillStyle = '#0b1120';
        for (const [dx, dy] of [[4, -6], [8, -1], [2, 2]]) {
          const c = Math.cos(ball.angle); const s = Math.sin(ball.angle);
          g.beginPath(); g.arc(b.x + dx * c - dy * s, b.y + dx * s + dy * c, 2.4, 0, 7); g.fill();
        }
        // Live pin counter.
        g.fillStyle = t.text; g.font = '700 18px "Barlow Condensed", system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText(`${down()}/10`, api.W - 14, LANE_BOTTOM + 34);
        if (api.phase === 'aim') fileTag(g, api, b.x, b.y);
      },
    };
  },
};
