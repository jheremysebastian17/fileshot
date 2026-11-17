// Golf: one stroke over a small hill into the cup. The ball rolls with friction and can lip out.
import { fileTag, shadow, sky } from './core.js';

const { Bodies, Events } = Matter;
const GROUND = 430;
const CUP_L = 722;
const CUP_R = 756;
const CUP_BOTTOM = 458;

export default {
  id: 'golf',
  create(api) {
    const ball = Bodies.circle(0, 0, 8, { restitution: 0.32, friction: 0.03, frictionStatic: 0.6, frictionAir: 0.011, density: 0.004 });
    const cup = Bodies.rectangle((CUP_L + CUP_R) / 2, CUP_BOTTOM - 10, CUP_R - CUP_L - 4, 16, { isStatic: true, isSensor: true });
    const hill = Bodies.trapezoid(430, GROUND - 17, 230, 34, 0.32, { isStatic: true, friction: 0.04 });
    api.add(
      ball, cup, hill,
      Bodies.rectangle(CUP_L / 2 - 200, GROUND + 40, CUP_L + 400, 80, { isStatic: true, friction: 0.04 }), // fairway up to the cup
      Bodies.rectangle((CUP_R + 1300) / 2, GROUND + 40, 1300 - CUP_R, 80, { isStatic: true, friction: 0.04 }), // green after the cup
      Bodies.rectangle((CUP_L + CUP_R) / 2, CUP_BOTTOM + 20, CUP_R - CUP_L + 10, 40, { isStatic: true }), // cup bottom
    );
    Events.on(api.engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        if ((bodyA === cup || bodyB === cup) && api.phase === 'flying') { api.focus = { x: 739, y: 380 }; api.score('scoreGolf'); }
      }
    });

    return {
      reset() { api.useSling(ball, { x: 90, y: GROUND - 9 }, { maxPull: 150, power: 0.12 }); },
      update() {},
      judge() { api.defaultJudge(ball, { maxSeconds: 8 }); },
      draw(g) {
        sky(g, api, GROUND);
        // Distant hills.
        g.fillStyle = 'rgba(34,197,94,.25)';
        g.beginPath(); g.ellipse(200, GROUND, 260, 70, 0, Math.PI, 0); g.ellipse(700, GROUND, 320, 95, 0, Math.PI, 0); g.fill();
        // Fairway, the hill and the cup.
        g.fillStyle = '#4ade80'; g.fillRect(0, GROUND, api.W, api.H - GROUND);
        g.fillStyle = '#22c55e'; g.fillRect(560, GROUND, 340, api.H - GROUND); // green
        g.fillStyle = '#4ade80';
        g.beginPath(); hill.vertices.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.fill();
        g.fillStyle = '#14532d'; g.fillRect(CUP_L, GROUND, CUP_R - CUP_L, CUP_BOTTOM - GROUND);
        g.fillStyle = '#d4d4d8'; g.fillRect(CUP_L, GROUND, 2, CUP_BOTTOM - GROUND); g.fillRect(CUP_R - 2, GROUND, 2, CUP_BOTTOM - GROUND);
        // Flag (waves a little).
        const wave = Math.sin(api.frame / 12) * 3;
        g.fillStyle = '#e5e7eb'; g.fillRect(CUP_R + 8, 300, 3, GROUND - 300);
        g.fillStyle = '#ef4444'; g.beginPath(); g.moveTo(CUP_R + 11, 300); g.quadraticCurveTo(CUP_R + 30, 306 + wave, CUP_R + 50, 312); g.lineTo(CUP_R + 11, 326); g.fill();
        // Tee box marker.
        g.fillStyle = '#ffffff'; g.fillRect(84, GROUND, 12, 5);
        shadow(g, ball.position.x, GROUND + 2, 8, Math.max(0, GROUND - ball.position.y - 9));
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ball.position.x, ball.position.y, 8, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; for (const [dx, dy] of [[-3, -2], [2, -3], [3, 2], [-2, 3], [0, 0]]) { g.beginPath(); g.arc(ball.position.x + dx, ball.position.y + dy, 1, 0, 7); g.fill(); }
        if (api.phase === 'aim') fileTag(g, api, ball.position.x, ball.position.y);
      },
    };
  },
};
