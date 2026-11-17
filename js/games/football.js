// Football: shoot past a goalkeeper who keeps jumping between the ground and the crossbar.
import { fileTag, shadow, sky } from './core.js';

const { Bodies, Body, Events } = Matter;
const GROUND = 460;
const BAR_Y = 300;
const MOUTH_X = 790;

export default {
  id: 'football',
  create(api) {
    const ball = Bodies.circle(0, 0, 15, { restitution: 0.62, frictionAir: 0.008, friction: 0.05, density: 0.0015, label: 'ball' });
    const keeper = Bodies.rectangle(752, 412, 26, 96, { isStatic: true, restitution: 0.4, chamfer: { radius: 10 } });
    const goal = Bodies.rectangle(842, 385, 76, 140, { isStatic: true, isSensor: true });
    api.add(
      ball, keeper, goal,
      Bodies.rectangle(450, GROUND + 30, 1400, 60, { isStatic: true, friction: 0.08 }),
      Bodies.rectangle(840, BAR_Y, 100, 8, { isStatic: true, restitution: 0.5 }), // crossbar
      Bodies.rectangle(888, 380, 6, 160, { isStatic: true, restitution: 0.05 }), // back of the net
    );
    let netHit = 0;
    let t = 0;
    let speed = 0.045;
    Events.on(api.engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        if ((bodyA === goal || bodyB === goal) && api.phase === 'flying' && ball.position.x > MOUTH_X - 4) {
          netHit = 30; api.focus = { x: 840, y: 380 }; api.score('scoreFootball');
        }
      }
    });

    return {
      reset() {
        api.useSling(ball, { x: 150, y: GROUND - 15 }, { maxPull: 170, power: 0.16 });
        speed = 0.04 + Math.random() * 0.02; // each attempt the keeper moves at a slightly different pace
      },
      update() {
        t += speed;
        const y = 412 - (Math.sin(t) * 0.5 + 0.5) * 112;
        Body.setPosition(keeper, { x: 752, y });
      },
      judge() { api.defaultJudge(ball, { maxSeconds: 5 }); },
      draw(g) {
        sky(g, api, GROUND);
        // Pitch with mowing stripes.
        for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#15803d' : '#16a34a'; g.fillRect(i * 80, GROUND, 80, api.H - GROUND); }
        g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(MOUTH_X - 2, GROUND, 4, 40);
        // Net (behind the ball).
        const bulge = netHit-- > 0 ? Math.sin(netHit / 3) * 4 : 0;
        g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1;
        for (let x = MOUTH_X; x <= 888; x += 12) { g.beginPath(); g.moveTo(x, BAR_Y); g.lineTo(x + bulge, GROUND); g.stroke(); }
        for (let y = BAR_Y; y <= GROUND; y += 12) { g.beginPath(); g.moveTo(MOUTH_X, y); g.lineTo(888 + bulge, y); g.stroke(); }
        shadow(g, ball.position.x, GROUND + 3, 15, GROUND - ball.position.y);
        drawFootball(g, ball.position.x, ball.position.y, 15, ball.angle);
        // Goalkeeper.
        const k = keeper.position;
        g.fillStyle = '#facc15'; g.beginPath(); g.roundRect(k.x - 13, k.y - 34, 26, 66, 10); g.fill();
        g.fillStyle = '#1e293b'; g.fillRect(k.x - 13, k.y + 18, 26, 14);
        g.fillStyle = '#fcd5b5'; g.beginPath(); g.arc(k.x, k.y - 42, 10, 0, 7); g.fill();
        g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(k.x - 16, k.y - 30, 7, 0, 7); g.arc(k.x + 16, k.y - 30, 7, 0, 7); g.fill();
        // Posts in front of everything.
        g.fillStyle = '#ffffff'; g.fillRect(MOUTH_X - 3, BAR_Y - 4, 100, 8); g.fillRect(MOUTH_X - 4, BAR_Y - 4, 8, GROUND - BAR_Y + 4);
        if (api.phase === 'aim') fileTag(g, api, ball.position.x, ball.position.y);
      },
    };
  },
};

function drawFootball(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.fillStyle = '#111827';
  const pent = (cx, cy, s) => { g.beginPath(); for (let i = 0; i < 5; i++) { const an = -Math.PI / 2 + (i * 2 * Math.PI) / 5; g.lineTo(cx + Math.cos(an) * s, cy + Math.sin(an) * s); } g.fill(); };
  pent(0, 0, r * 0.38);
  for (let i = 0; i < 5; i++) { const an = -Math.PI / 2 + (i * 2 * Math.PI) / 5; pent(Math.cos(an) * r * 0.9, Math.sin(an) * r * 0.9, r * 0.28); }
  g.strokeStyle = '#111827'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
  g.restore();
}
