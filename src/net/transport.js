// Transport layer. Two implementations share one tiny interface:
//
//   Host:   const host = await createHost(code)
//           host.onConnection(conn => { conn.onData(fn); conn.onClose(fn); conn.send(obj) })
//   Client: const conn = await connectToHost(code)
//           conn.onData(fn); conn.onClose(fn); conn.send(obj)
//
// "peer"  -> WebRTC data channels via PeerJS (public free signalling broker). No server of our own.
// "local" -> BroadcastChannel, for testing multiple tabs in one browser without internet (?local=1).

import { Peer } from 'peerjs';

const PREFIX = 'partyconsole-v1-';

const STUN_ONLY = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

// STUN only works when both devices can reach each other directly. Mobile data, guest Wi-Fi and routers without
// NAT hairpinning need a TURN relay, whose credentials come from the Netlify function netlify/functions/ice.mjs.
// No function (vite dev server) or no TURN configured -> STUN only, same as before.
let icePromise = null;
let hasTurn = false;
function getIce() {
  icePromise ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/ice`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return STUN_ONLY;
      const { iceServers, turn } = await res.json();
      if (!Array.isArray(iceServers) || !iceServers.length) return STUN_ONLY;
      hasTurn = !!turn;
      return { iceServers };
    } catch {
      return STUN_ONLY;
    }
  })();
  return icePromise;
}

export function transportMode() {
  const p = new URLSearchParams(location.search);
  return p.has('local') ? 'local' : 'peer';
}

function makeConn(sendFn) {
  const dataHandlers = [];
  const closeHandlers = [];
  let closed = false;
  return {
    send: (obj) => { if (!closed) sendFn(obj); },
    onData: (fn) => dataHandlers.push(fn),
    onClose: (fn) => closeHandlers.push(fn),
    _emitData: (d) => dataHandlers.forEach((fn) => fn(d)),
    _emitClose: () => {
      if (closed) return;
      closed = true;
      closeHandlers.forEach((fn) => fn());
    },
    get closed() { return closed; },
  };
}

// ---------------------------------------------------------------- local (BroadcastChannel)

function localHost(code) {
  const bc = new BroadcastChannel(PREFIX + code);
  const conns = new Map();
  const handlers = [];
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.to !== 'host') return;
    if (m.kind === 'open') {
      const conn = makeConn((obj) => bc.postMessage({ to: m.from, kind: 'data', data: obj }));
      conns.set(m.from, conn);
      bc.postMessage({ to: m.from, kind: 'accept' });
      handlers.forEach((fn) => fn(conn));
    } else if (m.kind === 'data') {
      conns.get(m.from)?._emitData(m.data);
    } else if (m.kind === 'close') {
      conns.get(m.from)?._emitClose();
      conns.delete(m.from);
    }
  };
  window.addEventListener('beforeunload', () => {
    for (const id of conns.keys()) bc.postMessage({ to: id, kind: 'close' });
  });
  return Promise.resolve({
    code,
    onConnection: (fn) => handlers.push(fn),
    destroy: () => bc.close(),
  });
}

function localClient(code) {
  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel(PREFIX + code);
    const id = Math.random().toString(36).slice(2);
    const conn = makeConn((obj) => bc.postMessage({ to: 'host', from: id, kind: 'data', data: obj }));
    const timer = setTimeout(() => reject(new Error('Room not found')), 3000);
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.to !== id) return;
      if (m.kind === 'accept') { clearTimeout(timer); resolve(conn); }
      else if (m.kind === 'data') conn._emitData(m.data);
      else if (m.kind === 'close') conn._emitClose();
    };
    window.addEventListener('beforeunload', () => bc.postMessage({ to: 'host', from: id, kind: 'close' }));
    bc.postMessage({ to: 'host', from: id, kind: 'open' });
  });
}

// ---------------------------------------------------------------- peer (WebRTC)

function wrapPeerConn(dc) {
  const conn = makeConn((obj) => {
    if (dc.open) dc.send(obj);
  });
  dc.on('data', (d) => conn._emitData(d));
  dc.on('close', () => conn._emitClose());
  dc.on('error', () => conn._emitClose());
  // Detect dead channels (phone locked, wifi drop) that never fire 'close'.
  const pc = dc.peerConnection;
  if (pc) {
    pc.addEventListener('iceconnectionstatechange', () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
        setTimeout(() => {
          if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) conn._emitClose();
        }, 4000);
      }
    });
  }
  return conn;
}

async function peerHost(code) {
  const config = await getIce();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { config, debug: 1 });
    const handlers = [];
    let opened = false;
    peer.on('open', () => {
      opened = true;
      resolve({ code, onConnection: (fn) => handlers.push(fn), destroy: () => peer.destroy() });
    });
    peer.on('connection', (dc) => {
      dc.on('open', () => {
        const conn = wrapPeerConn(dc);
        handlers.forEach((fn) => fn(conn));
      });
    });
    // Lost the signalling server; existing data channels keep working, but new players can't find the room until
    // we're back. A failed reconnect (e.g. the broker still holds our old ID) emits 'disconnected' again, so this
    // retries with backoff until it sticks. Waking from sleep / coming back online retries immediately.
    let attempt = 0;
    let timer = null;
    const reconnect = () => {
      clearTimeout(timer);
      timer = null;
      if (!peer.destroyed && peer.disconnected) peer.reconnect();
    };
    peer.on('disconnected', () => {
      if (!timer) timer = setTimeout(reconnect, Math.min(10000, 1000 * 2 ** attempt++));
    });
    peer.on('open', () => { attempt = 0; });
    const wake = () => { if (peer.disconnected) reconnect(); };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    peer.on('error', (err) => {
      if (!opened) reject(err);
      else console.warn('[peer]', err.type, err.message);
    });
  });
}

// One attempt: broker handshake, then the WebRTC data channel. Rejects with err.retry = true for failures that a
// fresh attempt can fix (broker hiccup, ICE failure/timeout), false for "room doesn't exist".
function peerClientOnce(code, config) {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ config, debug: 1 });
    let done = false;
    const fail = (message, retry, kind) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer.destroy();
      reject(Object.assign(new Error(message), { retry, kind }));
    };
    let dc = null;
    const timer = setTimeout(() => {
      // The public broker throttles repeated "peer unavailable" replies for the same ID, so a missing room can
      // look like silence. If the TV never answered our offer, that's what happened; otherwise the network failed.
      const answered = dc?.peerConnection && dc.peerConnection.signalingState !== 'have-local-offer';
      if (dc && !answered) fail('Room not found', false, 'missing');
      else fail('Could not reach room', true, 'timeout');
    }, 14000);
    peer.on('open', () => {
      dc = peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
      dc.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const conn = wrapPeerConn(dc);
        conn.onClose(() => peer.destroy());
        resolve(conn);
      });
      // The broker found the room but no network path works: don't sit out the whole timeout.
      dc.peerConnection?.addEventListener('iceconnectionstatechange', () => {
        if (dc.peerConnection.iceConnectionState === 'failed') fail('Could not reach room', true, 'ice');
      });
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail('Room not found', false, 'missing');
      else fail(err.message || err.type, true, err.type);
    });
  });
}

async function peerClient(code) {
  const config = await getIce();
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await peerClientOnce(code, config);
    } catch (err) {
      lastErr = err;
      // Broker hiccups get up to 3 tries; an unreachable TV is retried once (ICE sometimes works on a second go).
      // A missing room isn't retried here: quick repeats get no reply from the broker (see above), and the
      // controller's reconnect loop already rides out the TV briefly dropping off the broker.
      if (!err.retry || (['timeout', 'ice'].includes(err.kind) && attempt >= 1)) break;
      await new Promise((r) => setTimeout(r, 800 + attempt * 700));
    }
  }
  if (lastErr.kind === 'timeout' || lastErr.kind === 'ice') {
    lastErr.message = hasTurn
      ? 'the TV is unreachable. Check your connection and try again.'
      : "this network can't link to the TV. Try the same Wi-Fi as the TV, or mobile data.";
  }
  throw lastErr;
}

// ---------------------------------------------------------------- public

export function createHost(code) {
  return transportMode() === 'local' ? localHost(code) : peerHost(code);
}

export function connectToHost(code) {
  return transportMode() === 'local' ? localClient(code) : peerClient(code);
}

export function isCodeTaken(err) {
  return err && err.type === 'unavailable-id';
}
