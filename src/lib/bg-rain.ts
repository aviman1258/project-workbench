// The site-wide background animation: thin cyan streaks of rain falling
// behind the content. Deliberately subtle — low opacity, no interaction —
// and cheap: one canvas, one rAF loop, paused while the tab is hidden,
// skipped entirely when the visitor prefers reduced motion.

interface Drop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
}

export function startBackgroundRain(canvas: HTMLCanvasElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  let width = 0;
  let height = 0;
  let drops: Drop[] = [];

  const spawn = (fromTop: boolean): Drop => ({
    x: Math.random() * width,
    y: fromTop ? -40 - Math.random() * height * 0.2 : Math.random() * height,
    length: 14 + Math.random() * 36,
    speed: 60 + Math.random() * 140,
    opacity: 0.05 + Math.random() * 0.14,
  });

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // roughly one drop per 18px of width, capped so wide screens stay cheap
    const count = Math.min(110, Math.max(40, Math.floor(width / 18)));
    drops = Array.from({ length: count }, () => spawn(false));
  };

  let last = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.lineCap = 'round';
    for (const drop of drops) {
      drop.y += drop.speed * delta;
      if (drop.y - drop.length > height) Object.assign(drop, spawn(true));
      const gradient = context.createLinearGradient(drop.x, drop.y - drop.length, drop.x, drop.y);
      gradient.addColorStop(0, 'rgba(34, 211, 238, 0)');
      gradient.addColorStop(1, `rgba(34, 211, 238, ${drop.opacity})`);
      context.strokeStyle = gradient;
      context.beginPath();
      context.moveTo(drop.x, drop.y - drop.length);
      context.lineTo(drop.x, drop.y);
      context.stroke();
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
