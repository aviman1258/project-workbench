// Our Adventures — the private vacation reel library.
//
// One Worker does everything: serves the UI (static assets), the metadata
// API, and the media bytes. Cloudflare Access sits in front of the whole
// hostname at the edge, so unauthenticated requests never reach this code;
// the Worker still verifies the Access JWT on every request (defense in
// depth) and uses its email claim for the admin check.
//
// Storage layout in the MEDIA R2 bucket:
//   library.json          — the whole data model (vacations + reels)
//   media/<uuid>.<ext>    — videos, cover images, thumbnails

const LIBRARY_KEY = 'library.json';
const EMPTY_LIBRARY = { vacations: [], reels: [] };

// ---------------------------------------------------------------------------
// Cloudflare Access JWT verification (RS256 against the team's public certs)
// ---------------------------------------------------------------------------

let certCache = { keys: null, fetchedAt: 0 };

async function accessKeys(teamDomain) {
  if (certCache.keys && Date.now() - certCache.fetchedAt < 60 * 60 * 1000) return certCache.keys;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error('could not fetch Access certs');
  const { keys } = await response.json();
  certCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function b64urlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Verify the Access JWT; returns { email } or null. */
async function verifyAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!signaturePart) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerPart)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadPart)));
  } catch {
    return null;
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.ACCESS_AUD)) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;

  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return null;
  return { email: (payload.email ?? '').toLowerCase() };
}

function isAdmin(user, env) {
  const admins = (env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
  return Boolean(user && admins.includes(user.email));
}

// ---------------------------------------------------------------------------
// Library (metadata) helpers
// ---------------------------------------------------------------------------

async function readLibrary(env) {
  const object = await env.MEDIA.get(LIBRARY_KEY);
  if (!object) return structuredClone(EMPTY_LIBRARY);
  try {
    return await object.json();
  } catch {
    return structuredClone(EMPTY_LIBRARY);
  }
}

async function writeLibrary(env, library) {
  await env.MEDIA.put(LIBRARY_KEY, JSON.stringify(library, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Request routing
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Static UI (gallery + player) — Access already gated the hostname.
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/media/')) {
      return env.ASSETS.fetch(request);
    }

    const user = await verifyAccess(request, env);
    if (!user) return json({ error: 'Not signed in.' }, 401);
    const admin = isAdmin(user, env);

    // --- reads (any allowlisted viewer) ---

    if (request.method === 'GET' && pathname === '/api/me') {
      return json({ email: user.email, admin });
    }

    if (request.method === 'GET' && pathname === '/api/library') {
      return json(await readLibrary(env));
    }

    if (request.method === 'GET' && pathname.startsWith('/media/')) {
      const key = decodeURIComponent(pathname.slice(1));
      if (!key.startsWith('media/')) return json({ error: 'Bad key.' }, 400);
      const range = request.headers.get('Range');
      const object = await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
      if (!object) return json({ error: 'Not found.' }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'private, max-age=3600');
      headers.set('ETag', object.httpEtag);
      if (object.range) {
        const end = object.range.offset + object.range.length - 1;
        headers.set('Content-Range', `bytes ${object.range.offset}-${end}/${object.size}`);
        headers.set('Content-Length', String(object.range.length));
        return new Response(object.body, { status: 206, headers });
      }
      headers.set('Content-Length', String(object.size));
      return new Response(object.body, { status: 200, headers });
    }

    // --- writes (admins only) ---

    if (!admin) return json({ error: 'Viewing only — ask Avishek for edit access.' }, 403);

    // Raw media upload; returns the storage key for the metadata call.
    if (request.method === 'POST' && pathname === '/api/upload') {
      const contentType = request.headers.get('Content-Type') ?? 'application/octet-stream';
      const name = url.searchParams.get('name') ?? 'file';
      const ext = (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'bin').toLowerCase();
      const key = `media/${crypto.randomUUID()}.${ext}`;
      await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
      return json({ key });
    }

    // Create or update a vacation (full object; id present = update).
    if (request.method === 'POST' && pathname === '/api/vacations') {
      const input = await request.json();
      if (!input.title || !DATE_RE.test(input.startDate ?? '') || !DATE_RE.test(input.endDate ?? '')) {
        return json({ error: 'Title and valid start/end dates (YYYY-MM-DD) are required.' }, 400);
      }
      const library = await readLibrary(env);
      const existing = input.id && library.vacations.find((v) => v.id === input.id);
      const vacation = existing ?? { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      Object.assign(vacation, {
        title: String(input.title),
        destination: String(input.destination ?? ''),
        startDate: input.startDate,
        endDate: input.endDate,
        description: String(input.description ?? ''),
        coverKey: String(input.coverKey ?? vacation.coverKey ?? ''),
      });
      if (!existing) library.vacations.push(vacation);
      await writeLibrary(env, library);
      return json(vacation);
    }

    // Attach a finished reel to a vacation.
    if (request.method === 'POST' && pathname === '/api/reels') {
      const input = await request.json();
      const library = await readLibrary(env);
      if (!library.vacations.some((v) => v.id === input.vacationId)) {
        return json({ error: 'Unknown vacation.' }, 400);
      }
      if (!input.videoKey) return json({ error: 'videoKey is required.' }, 400);
      const reel = {
        id: crypto.randomUUID(),
        vacationId: input.vacationId,
        title: String(input.title ?? ''),
        videoKey: String(input.videoKey),
        thumbKey: String(input.thumbKey ?? ''),
        duration: Number(input.duration) || 0,
        music: {
          title: String(input.music?.title ?? ''),
          artist: String(input.music?.artist ?? ''),
          source: String(input.music?.source ?? ''),
          license: String(input.music?.license ?? ''),
        },
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        visibility: 'family',
      };
      library.reels.push(reel);
      await writeLibrary(env, library);
      return json(reel);
    }

    if (request.method === 'DELETE' && pathname.startsWith('/api/reels/')) {
      const id = pathname.split('/').pop();
      const library = await readLibrary(env);
      const reel = library.reels.find((r) => r.id === id);
      if (!reel) return json({ error: 'Not found.' }, 404);
      library.reels = library.reels.filter((r) => r.id !== id);
      await writeLibrary(env, library);
      // the bytes go too — reels have no recycle bin, the source media is in Google Photos
      if (reel.videoKey) await env.MEDIA.delete(reel.videoKey);
      if (reel.thumbKey) await env.MEDIA.delete(reel.thumbKey);
      return json({ ok: true });
    }

    if (request.method === 'DELETE' && pathname.startsWith('/api/vacations/')) {
      const id = pathname.split('/').pop();
      const library = await readLibrary(env);
      const vacation = library.vacations.find((v) => v.id === id);
      if (!vacation) return json({ error: 'Not found.' }, 404);
      if (library.reels.some((r) => r.vacationId === id)) {
        return json({ error: 'Delete or move its reels first.' }, 400);
      }
      library.vacations = library.vacations.filter((v) => v.id !== id);
      await writeLibrary(env, library);
      if (vacation.coverKey) await env.MEDIA.delete(vacation.coverKey);
      return json({ ok: true });
    }

    return json({ error: 'Not found.' }, 404);
  },
};
