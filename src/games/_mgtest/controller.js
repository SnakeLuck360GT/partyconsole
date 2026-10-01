// Renders the gamepad spec the screen sends for the current minigame (same thing the Party Board controller does).
export default function start(ctx) {
  let pad = null;
  let msg = ctx.kit.message(ctx.container, 'Waiting for minigame…');
  function build(controls, title) {
    pad?.destroy();
    msg?.destroy();
    msg = null;
    pad = ctx.kit.gamepad(ctx, { stick: controls.stick || 'analog', buttons: controls.buttons || [], hint: `<b>${title}</b><br>${controls.hint || ''}` });
  }
  ctx.onMessage((m) => {
    if (m.type === 'controls') build(m.controls, m.name);
    else if (m.type === 'vibrate') ctx.vibrate(m.ms || 30);
    else if (m.type === 'status' && pad) pad.setHint(m.text);
  });
  ctx.send({ type: 'hello' });
  return { destroy() { pad?.destroy(); msg?.destroy(); } };
}
