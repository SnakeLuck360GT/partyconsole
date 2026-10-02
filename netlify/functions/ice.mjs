// GET /api/ice -> { iceServers: [...] } for WebRTC (see src/net/transport.js).
//
// STUN alone can't connect every phone: mobile data (carrier NAT), guest/school Wi-Fi, and home routers without
// NAT hairpinning need a TURN relay. Credentials stay server-side; set ONE of these in Netlify → Site configuration
// → Environment variables, then redeploy:
//
//   Cloudflare Realtime TURN (free up to 1 TB/month, short-lived credentials):
//     CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
//   Any other TURN provider with static credentials (e.g. Metered, coturn):
//     TURN_URLS (comma-separated, e.g. "turn:a.example.com:3478,turns:a.example.com:443?transport=tcp"),
//     TURN_USERNAME, TURN_CREDENTIAL
//
// With neither set it returns STUN only, which is what the client falls back to anyway.

const STUN = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

const json = (body, maxAge) => new Response(JSON.stringify(body), {
  headers: { 'content-type': 'application/json', 'cache-control': maxAge ? `private, max-age=${maxAge}` : 'no-store' },
});

async function cloudflare(keyId, token) {
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: 86400 }),
  });
  if (!res.ok) throw new Error(`cloudflare ${res.status}`);
  const { iceServers } = await res.json();
  // Browsers block port 53, and those URLs only add connection-setup timeouts.
  return [].concat(iceServers)
    .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length);
}

export default async () => {
  const env = (k) => process.env[k]?.trim();
  try {
    if (env('CLOUDFLARE_TURN_KEY_ID') && env('CLOUDFLARE_TURN_API_TOKEN')) {
      return json({ iceServers: [...STUN, ...(await cloudflare(env('CLOUDFLARE_TURN_KEY_ID'), env('CLOUDFLARE_TURN_API_TOKEN')))], turn: true }, 3600);
    }
    if (env('TURN_URLS') && env('TURN_USERNAME') && env('TURN_CREDENTIAL')) {
      const urls = env('TURN_URLS').split(',').map((u) => u.trim()).filter(Boolean);
      return json({ iceServers: [...STUN, { urls, username: env('TURN_USERNAME'), credential: env('TURN_CREDENTIAL') }], turn: true }, 3600);
    }
  } catch (err) {
    console.error('[ice]', err.message);
  }
  return json({ iceServers: STUN, turn: false });
};

export const config = { path: '/api/ice' };
