// Baseball: the pitcher throws, you swing (click, tap or Space) at the right moment.
// The closer the ball is to the sweet spot when you swing, the harder and higher it flies. Clear the fence = home run.
import { fileTag, shadow, sky } from './core.js';

const { Bodies, Body } = Matter;
const GROUND = 460;
const SWEET_X = 172;
const WINDOW = 46; // px around the sweet spot where the bat still connects
const FENCE_X = 862;
const FENCE_TOP = 330;

export default {
  id: 'baseball',
  create(api) {
    const ball = Bodies.circle(-100, -100, 8, { restitution: 0.45, frictionAir: 0.004, density: 0.003 });
    api.add(
      ball,
      Bodies.rectangle(450, GROUND + 30, 1400, 60, { isStatic: true, friction: 0.2 }),
      Bodies.rectangle(FENCE_X + 8, (FENCE_TOP + GROUND) / 2, 16, GROUND - FENCE_TOP, { isStatic: true, restitution: 0.3 }),
    );
    let pitch = null; // { x, y, vx, t } while the ball travels towards the batter (manual motion, no physics)
    let wait = 0;
    let swing = 0; // frames since the swing started (0 = idle)
    let hit = false;

    const doSwing = () => {
      if (api.phase !== 'aim' || swing) return;
      swing = 1;
      if (pitch && Math.abs(pitch.x - SWEET_X) < WINDOW) {
        const q = 1 - Math.abs(pitch.x - SWEET_X) / WINDOW; // 1 = perfect timing
        const angle = (-(12 + 32 * q) * Math.PI) / 180;
        const speed = 12 + 15 * q;
        Body.setStatic(ball, false);
        Body.setPosition(ball, { x: pitch.x, y: pitch.y });
        Body.setVelocity(ball, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
        Body.setAngularVelocity(ball, 0.3);
        pitch = null; hit = true;
        api.startFlight();
      }
    };

    return {
      reset() {
        Body.setStatic(ball, true);
        Body.setPosition(ball, { x: -100, y: -100 });
        pitch = null; hit = false; swing = 0;
        wait = 55 + Math.round(Math.random() * 50); // unpredictable wind-up
      },
      pointerdown: doSwing,
      key(e) { if (e.code === 'Space' && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); doSwing(); } },
      update() {
        if (swing) swing = swing > 16 ? (hit ? 17 : 0) : swing + 1;
        if (api.phase !== 'aim') return;
        if (wait > 0 && --wait === 0) pitch = { x: 600, y: 360, vx: -(8.5 + Math.random() * 3.5), t: 0 };
        if (pitch) {
          pitch.t++; pitch.x += pitch.vx; pitch.y = 360 + pitch.t * pitch.t * 0.004; // slight drop
          if (pitch.x < 60) { pitch = null; api.miss(swing ? 'missGeneric' : 'missStrike'); }
        }
      },
      judge() {
        const p = ball.position;
        api.focus = { x: Math.min(p.x, 820), y: Math.max(p.y, 80) };
        if (p.x > FENCE_X && p.y < FENCE_TOP) return api.score('scoreBaseball');
        api.defaultJudge(ball, { maxSeconds: 5 });
      },
      draw(g) {
        sky(g, api, GROUND);
        // Outfield grass, infield dirt, stands with a crowd.
        g.fillStyle = '#334155'; g.fillRect(FENCE_X - 10, 220, 60, FENCE_TOP - 220);
        for (let i = 0; i < 26; i++) { g.fillStyle = ['#f87171', '#60a5fa', '#fbbf24', '#a78bfa'][i % 4]; g.beginPath(); g.arc(FENCE_X + (i % 4) * 11 - 4, 232 + Math.floor(i / 4) * 15, 4, 0, 7); g.fill(); }
        g.fillStyle = '#15803d'; g.fillRect(0, GROUND, api.W, api.H - GROUND);
        g.fillStyle = '#b45309'; g.beginPath(); g.ellipse(170, GROUND + 6, 120, 14, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(600, GROUND + 6, 60, 10, 0, 0, 7); g.fill();
        // Fence.
        g.fillStyle = '#1d4ed8'; g.fillRect(FENCE_X, FENCE_TOP, 16, GROUND - FENCE_TOP);
        g.fillStyle = '#facc15'; g.fillRect(FENCE_X, FENCE_TOP - 4, 16, 6);
        // Pitcher.
        drawPlayer(g, 610, '#dc2626', pitch || wait < 15 ? 0.6 : 0);
        // Batter with a bat that swings around the shoulder.
        drawPlayer(g, 130, '#1d4ed8', 0);
        const prog = swing ? Math.min(1, swing / 8) : 0;
        const ang = -2.3 + prog * 3.0;
        g.save(); g.translate(140, 380); g.rotate(ang);
        g.fillStyle = '#d6a76a'; g.beginPath(); g.roundRect(0, -4, 64, 9, 4); g.fill();
        g.restore();
        // Sweet-spot hint.
        g.strokeStyle = api.theme.accent; g.globalAlpha = 0.35; g.setLineDash([4, 6]);
        g.beginPath(); g.arc(SWEET_X, 368, 26, 0, 7); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        const p = pitch ?? ball.position;
        if (pitch || hit) { shadow(g, p.x, GROUND + 3, 8, GROUND - p.y); drawBaseball(g, p.x, p.y, 8, hit ? ball.angle : 0); }
        if (api.phase === 'aim' && !pitch) fileTag(g, api, 610, 330);
      },
    };
  },
};

function drawPlayer(g, x, color, arm) {
  g.fillStyle = color; g.beginPath(); g.roundRect(x - 12, 352, 24, 62, 9); g.fill();
  g.fillStyle = '#1f2937'; g.fillRect(x - 11, 412, 9, 48); g.fillRect(x + 2, 412, 9, 48);
  g.fillStyle = '#fcd5b5'; g.beginPath(); g.arc(x, 340, 11, 0, 7); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(x, 336, 11, Math.PI, 0); g.fill();
  if (arm) { g.strokeStyle = color; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, 362); g.lineTo(x + 18, 340 - arm * 10); g.stroke(); }
}

function drawBaseball(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = '#dc2626'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(-r * 1.1, 0, r * 0.8, -0.9, 0.9); g.stroke();
  g.beginPath(); g.arc(r * 1.1, 0, r * 0.8, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
  g.restore();
}
