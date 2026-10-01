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

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

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

function peerHost(code) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { config: ICE, debug: 1 });
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
    peer.on('disconnected', () => {
      // Lost the signalling server; existing data channels keep working. Try to rejoin for new players.
      setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1000);
    });
    peer.on('error', (err) => {
      if (!opened) reject(err);
      else console.warn('[peer]', err.type, err.message);
    });
  });
}

function peerClient(code) {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ config: ICE, debug: 1 });
    const timer = setTimeout(() => { reject(new Error('Could not reach room')); peer.destroy(); }, 15000);
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + code, { serialization: 'json', reliable: true });
      dc.on('open', () => {
        clearTimeout(timer);
        const conn = wrapPeerConn(dc);
        conn.onClose(() => peer.destroy());
        resolve(conn);
      });
    });
    peer.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(err.type === 'peer-unavailable' ? 'Room not found' : err.message));
      peer.destroy();
    });
  });
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
