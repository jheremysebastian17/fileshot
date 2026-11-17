// Basketball: slingshot the ball into the hoop. The rim is two small circles, so it can bounce in or out.
import { fileTag, shadow, sky } from './core.js';

const { Bodies, Events, Body } = Matter;
const GROUND = 460;
const RIM_Y = 235;
const RIM_FRONT = 698;
const RIM_BACK = 772;

export default {
  id: 'basket',
  create(api) {
    const ball = Bodies.circle(0, 0, 17, { restitution: 0.72, frictionAir: 0.006, density: 0.002, label: 'ball' });
    const sensor = Bodies.rectangle((RIM_FRONT + RIM_BACK) / 2, RIM_Y + 18, 46, 8, { isStatic: true, isSensor: true });
    api.add(
      ball, sensor,
      Bodies.rectangle(450, GROUND + 30, 1400, 60, { isStatic: true, restitution: 0.6 }),
      Bodies.rectangle(800, 195, 10, 120, { isStatic: true, restitution: 0.5 }), // backboard
      Bodies.circle(RIM_FRONT, RIM_Y, 4, { isStatic: true, restitution: 0.55 }),
      Bodies.circle(RIM_BACK, RIM_Y, 4, { isStatic: true, restitution: 0.55 }),
    );
    let swish = 0;
    Events.on(api.engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        // Counts only when the ball comes down through the ring, not when it is pushed up from below.
        if ((bodyA === sensor || bodyB === sensor) && ball.velocity.y > 0 && api.phase === 'flying') {
          api.focus = { x: sensor.position.x, y: RIM_Y }; swish = 30; api.score('scoreBasket');
        }
      }
    });

    return {
      reset() { api.useSling(ball, { x: 170, y: 370 }, { maxPull: 170, power: 0.17 }); },
      update() {},
      judge() { api.defaultJudge(ball); },
      draw(g) {
        const t = api.theme;
        sky(g, api, GROUND);
        // Court floor with wood planks and a three-point arc.
        g.fillStyle = '#c98b4e'; g.fillRect(0, GROUND, api.W, api.H - GROUND);
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
        for (let x = -40; x < api.W; x += 60) { g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + 30, api.H); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3;
        g.beginPath(); g.ellipse(790, GROUND + 14, 300, 12, 0, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
        // Pole, backboard and target square.
        g.fillStyle = t.muted; g.fillRect(840, 150, 12, GROUND - 150); g.fillRect(805, 160, 40, 8);
        g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(795, 135, 12, 120);
        g.strokeStyle = '#ef4444'; g.lineWidth = 2; g.strokeRect(796, 185, 10, 34);
        // Net: lines from the rim narrowing down, swaying after a basket.
        const sway = Math.sin(api.frame / 2) * (swish-- > 0 ? swish / 6 : 0);
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5;
        for (let i = 0; i <= 6; i++) {
          const x0 = RIM_FRONT + ((RIM_BACK - RIM_FRONT) / 6) * i;
          const x1 = RIM_FRONT + 14 + ((RIM_BACK - RIM_FRONT - 28) / 6) * i + sway;
          g.beginPath(); g.moveTo(x0, RIM_Y); g.lineTo(x1, RIM_Y + 46); g.stroke();
        }
        for (let k = 1; k <= 3; k++) {
          g.beginPath(); g.moveTo(RIM_FRONT + k * 4.5 + sway * k / 3, RIM_Y + k * 14); g.lineTo(RIM_BACK - k * 4.5 + sway * k / 3, RIM_Y + k * 14); g.stroke();
        }
        shadow(g, ball.position.x, GROUND + 4, 17, GROUND - ball.position.y);
        drawBasketball(g, ball.position.x, ball.position.y, 17, ball.angle);
        // Rim drawn after the ball so the ball looks like it drops through the ring.
        g.strokeStyle = '#f97316'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(RIM_FRONT, RIM_Y); g.lineTo(RIM_BACK + 26, RIM_Y); g.stroke();
        if (api.phase === 'aim') fileTag(g, api, ball.position.x, ball.position.y);
      },
    };
  },
};

function drawBasketball(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  const grad = g.createRadialGradient(-r * 0.4, -r * 0.4, 2, 0, 0, r);
  grad.addColorStop(0, '#fdba74'); grad.addColorStop(1, '#ea580c');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = '#431407'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
  g.beginPath(); g.arc(-r * 1.25, 0, r * 0.95, -0.8, 0.8); g.stroke();
  g.beginPath(); g.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.8, Math.PI + 0.8); g.stroke();
  g.restore();
}
