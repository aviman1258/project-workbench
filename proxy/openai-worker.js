// Cloudflare Worker: CORS proxy for OpenAI, needed because api.openai.com does
// not allow direct browser calls (no CORS headers). Deploy free at
// workers.cloudflare.com → Create Worker → paste this → Deploy, then paste the
// worker URL into the site's GitHub dialog under the AI key field.
// The worker holds no secrets — the API key arrives per-request from the browser
// and is only forwarded to api.openai.com.

const ALLOWED_ORIGIN = 'https://www.avisheksportfolio.com';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const upstream = await fetch(`https://api.openai.com${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        Authorization: request.headers.get('Authorization') ?? '',
        'Content-Type': 'application/json',
      },
      body: request.method === 'GET' ? undefined : await request.text(),
    });

    const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText });
    response.headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json');
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  },
};
