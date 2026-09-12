/**
 * Screenshot harness.
 *
 * `chrome --screenshot` can only photograph the top of a page in whatever theme
 * the OS reports, and this site is dark-first with its best material below the
 * fold. So this drives Chrome over the DevTools protocol instead: it can set the
 * stored theme before first paint, scroll to a named element, click through to
 * the live demo, and wait for real chain data to arrive before the shutter.
 *
 * Every shot is of the deployed site reading Hedera testnet. Nothing is mocked.
 *
 * Usage: bun assets/capture.ts [baseUrl]
 */

const BASE = process.argv[2] ?? 'https://recourse-nine.vercel.app';
const OUT = new URL('.', import.meta.url).pathname;
const PORT = 9222;
const DPR = 2;

interface Shot {
  name: string;
  path: string;
  width: number;
  height: number;
  /** Scroll until this text is at the top of the viewport. */
  scrollToText?: string;
  /** Nudge after scrolling, to include a heading above the target. */
  offset?: number;
  /** Click the nth button inside this selector, then wait. */
  click?: { selector: string; index: number; waitMs: number };
  theme?: 'dark' | 'light';
}

const SHOTS: Shot[] = [
  { name: '01-hero', path: '/', width: 1440, height: 900 },
  {
    name: '02-problem',
    path: '/',
    width: 1440,
    height: 900,
    scrollToText: 'Autonomous payments have a missing step',
    offset: -40,
  },
  {
    name: '03-demo-verdict',
    path: '/',
    width: 1280,
    height: 900,
    click: { selector: '#demo button', index: 0, waitMs: 21000 },
  },
  { name: '04-explorer', path: '/explorer', width: 1440, height: 950 },
  {
    name: '05-payment-sla',
    path: '/payment/0xc79c411d326b9088fa8e0279fbd06ad604d4b04afb85fa595d194c0b96790991',
    width: 1440,
    height: 980,
    scrollToText: 'Adjudication',
    offset: -30,
  },
  {
    name: '06-sla-builder',
    path: '/services/new',
    width: 1440,
    height: 900,
    scrollToText: 'Publish a service level agreement',
    offset: -120,
  },
];

let nextId = 1;

class Session {
  private ws: WebSocket;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 60_000);
    });
  }

  close() {
    this.ws.close();
  }
}

async function connect(targetId: string): Promise<Session> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${targetId}`);
  await new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res(), { once: true });
    ws.addEventListener('error', (e) => rej(e), { once: true });
  });
  return new Session(ws);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function capture(shot: Shot) {
  const created = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = (await created.json()) as { id: string };
  const s = await connect(target.id);

  try {
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: DPR,
      mobile: false,
    });
    // The site decides its theme before first paint from this key, so it has to
    // be set on the right origin before the real navigation happens.
    await s.send('Page.navigate', { url: BASE });
    await sleep(1500);
    await s.send('Runtime.evaluate', {
      expression: `localStorage.setItem('recourse-theme', ${JSON.stringify(shot.theme ?? 'dark')})`,
    });

    await s.send('Page.navigate', { url: BASE + shot.path });
    await sleep(shot.path.startsWith('/payment') || shot.path === '/explorer' ? 7000 : 4500);

    if (shot.scrollToText) {
      await s.send('Runtime.evaluate', {
        expression: `(() => {
          const t = ${JSON.stringify(shot.scrollToText)};
          const el = [...document.querySelectorAll('h1,h2,h3,p')].find(n => n.textContent.trim().startsWith(t));
          if (el) { el.scrollIntoView({block:'start', behavior:'instant'}); window.scrollBy(0, ${shot.offset ?? 0}); }
          return !!el;
        })()`,
      });
      await sleep(1200);
    }

    if (shot.click) {
      await s.send('Runtime.evaluate', {
        expression: `document.querySelectorAll(${JSON.stringify(shot.click.selector)})[${shot.click.index}]?.click()`,
      });
      await sleep(shot.click.waitMs);
    }

    const { data } = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await Bun.write(`${OUT}${shot.name}.png`, Buffer.from(data, 'base64'));
    console.log(`  ✓ ${shot.name}.png  ${shot.width * DPR}x${shot.height * DPR}`);
  } finally {
    s.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
  }
}

for (const shot of SHOTS) {
  try {
    await capture(shot);
  } catch (e) {
    console.log(`  ✗ ${shot.name}: ${(e as Error).message}`);
  }
}
