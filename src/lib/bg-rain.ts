// The site-wide background: rain drops on glass. Two populations — small
// condensation beads that sit and slowly evaporate, and heavier runner drops
// that slide down with stick-slip motion, wobbling and shedding a trail of
// beads. Still deliberately a backdrop: one canvas, capped populations,
// paused on hidden tabs, skipped under reduced motion.

interface Bead {
  x: number;
  y: number;
  r: number;
  /** evaporation, radius-px per second */
  decay: number;
  opacity: number;
}

interface Runner {
  x: number;
  y: number;
  r: number;
  vy: number;
  /** the speed this drop eases toward; retargeted for stick-slip pauses */
  targetVy: number;
  wobblePhase: number;
  wobbleSpeed: number;
  opacity: number;
}

export function startBackgroundRain(canvas: HTMLCanvasElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  let width = 0;
  let height = 0;
  let beads: Bead[] = [];
  let runners: Runner[] = [];
  let maxBeads = 90;
  let maxRunners = 10;

  const spawnBead = (x?: number, y?: number, r?: number): Bead => ({
    x: x ?? Math.random() * width,
    y: y ?? Math.random() * height,
    r: r ?? 1 + Math.random() * 3.2,
    decay: 0.08 + Math.random() * 0.25,
    opacity: 0.5 + Math.random() * 0.5,
  });

  const spawnRunner = (): Runner => ({
    x: Math.random() * width,
    y: -12 + Math.random() * height * 0.3,
    r: 3.5 + Math.random() * 4,
    vy: 0,
    targetVy: 20 + Math.random() * 60,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 2 + Math.random() * 4,
    opacity: 0.75 + Math.random() * 0.25,
  });

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    maxBeads = Math.min(130, Math.max(50, Math.floor(width / 12)));
    maxRunners = Math.min(14, Math.max(6, Math.floor(width / 140)));
    beads = Array.from({ length: Math.floor(maxBeads * 0.7) }, () => spawnBead());
    runners = Array.from({ length: Math.floor(maxRunners * 0.5) }, () => spawnRunner());
  };

  // One glassy droplet: soft body, brighter rim, specular glint up-left.
  const drawDrop = (x: number, y: number, r: number, stretch: number, alpha: number) => {
    const ry = r * stretch;
    const body = context.createRadialGradient(x - r * 0.3, y - ry * 0.4, r * 0.15, x, y, Math.max(r, ry));
    body.addColorStop(0, `rgba(215, 242, 255, ${0.30 * alpha})`);
    body.addColorStop(0.55, `rgba(150, 205, 235, ${0.10 * alpha})`);
    body.addColorStop(0.88, `rgba(140, 200, 235, ${0.07 * alpha})`);
    body.addColorStop(1, `rgba(170, 225, 250, ${0.28 * alpha})`);
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = `rgba(255, 255, 255, ${0.5 * alpha})`;
    context.beginPath();
    context.arc(x - r * 0.33, y - ry * 0.4, Math.max(0.5, r * 0.18), 0, Math.PI * 2);
    context.fill();
  };

  let last = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    context.clearRect(0, 0, width, height);

    // condensation: beads evaporate; new ones appear at a gentle rate
    beads = beads.filter((bead) => (bead.r -= bead.decay * delta) > 0.4);
    if (beads.length < maxBeads && Math.random() < 2.2 * delta) beads.push(spawnBead());
    for (const bead of beads) drawDrop(bead.x, bead.y, bead.r, 1, bead.opacity * 0.8);

    // runners: stick-slip slide, slight wobble, shed beads, grow a touch
    if (runners.length < maxRunners && Math.random() < 0.45 * delta * maxRunners) runners.push(spawnRunner());
    runners = runners.filter((drop) => drop.y - drop.r * 2 < height);
    for (const drop of runners) {
      if (Math.random() < 0.8 * delta) {
        // retarget: mostly slip, sometimes stick in place for a beat
        drop.targetVy = Math.random() < 0.3 ? 1 + Math.random() * 4 : 15 + Math.random() * 70 + drop.r * 6;
      }
      drop.vy += (drop.targetVy - drop.vy) * Math.min(1, 2.5 * delta);
      drop.wobblePhase += drop.wobbleSpeed * delta;
      drop.y += drop.vy * delta;
      drop.x += Math.sin(drop.wobblePhase) * 2.4 * delta;
      // shed a trail bead while moving, and fatten slightly from swept-up water
      if (drop.vy > 10 && Math.random() < 6 * delta && beads.length < maxBeads + 20) {
        beads.push(spawnBead(drop.x + (Math.random() - 0.5) * drop.r, drop.y - drop.r * 1.6, drop.r * (0.25 + Math.random() * 0.2)));
        drop.r = Math.min(9, drop.r + 0.01);
      }
      const stretch = 1 + Math.min(0.5, drop.vy / 160);
      drawDrop(drop.x, drop.y, drop.r, stretch, drop.opacity);
    }

    frame = requestAnimationFrame(tick);
  };

  const start = () => {
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const stop = () => cancelAnimationFrame(frame);

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  start();
}
