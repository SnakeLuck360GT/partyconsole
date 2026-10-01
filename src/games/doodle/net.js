// Chunked messaging: WebRTC data channels (and some browsers' SCTP stacks) dislike messages above ~64 KB,
// so anything big (drawings) is split into ≤24 KB string chunks and reassembled on the other side.

const LIMIT = 24000;
let seq = 0;

export function chunkedSend(send, data) {
  const s = JSON.stringify(data);
  if (s.length <= LIMIT) { send(data); return; }
  const id = `${Date.now().toString(36)}${(++seq).toString(36)}`;
  const n = Math.ceil(s.length / LIMIT);
  for (let i = 0; i < n; i++) send({ type: '_ck', id, i, n, s: s.slice(i * LIMIT, (i + 1) * LIMIT) });
}

/** Returns assemble(senderKey, msg) → the full message, or null while chunks are still arriving. */
export function makeAssembler() {
  const bufs = new Map();
  let lastSweep = Date.now();
  return (key, msg) => {
    if (!msg || typeof msg !== 'object') return null;
    if (msg.type !== '_ck') return msg;
    const now = Date.now();
    if (now - lastSweep > 20000) {
      lastSweep = now;
      for (const [k, b] of bufs) if (now - b.t > 60000) bufs.delete(k);
    }
    const n = msg.n | 0;
    const i = msg.i | 0;
    if (n <= 0 || n > 200 || i < 0 || i >= n || typeof msg.s !== 'string') return null;
    const k = `${key}:${msg.id}`;
    let b = bufs.get(k);
    if (!b) { b = { parts: new Array(n), got: 0, t: now }; bufs.set(k, b); }
    if (b.parts[i] === undefined) { b.parts[i] = msg.s; b.got++; }
    if (b.got < n) return null;
    bufs.delete(k);
    try { return JSON.parse(b.parts.join('')); } catch { return null; }
  };
}
