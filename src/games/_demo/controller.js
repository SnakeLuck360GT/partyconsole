// Minimal reference controller: the standard gamepad sends {type:'input', x, y, b}.
export default function start(ctx) {
  const pad = ctx.kit.gamepad(ctx, { stick: 'analog', buttons: [{ id: 'a', label: 'A' }], hint: 'Move & jump!' });
  ctx.onMessage((msg) => { if (msg.type === 'bump') ctx.vibrate(40); });
  return { destroy: () => pad.destroy() };
}
