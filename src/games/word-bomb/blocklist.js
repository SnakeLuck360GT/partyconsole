// Family-friendly display filter. Offensive words are VALID plays (they're real words), but the shared TV never
// shows them in full: the offensive part is masked, keeping its first letter ("F***ERS"). The player's own phone
// shows what they typed. Lists are ROT13-encoded so the source stays readable without a wall of profanity.

const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const decode = (s) => rot13(s).split(' ').filter(Boolean);

// Roots that are offensive wherever they appear inside a word.
const SUBSTRINGS = decode('shpx phag avttre avttn snttbg fuvg juber fyhg ovgpu zbgures qvpxurnq nffubyr ohyyfuvg wvmm qvyqb jnax chffl cbea');

// Innocent words that happen to contain one of the roots above.
const ALLOW_ROOTS = decode('favttre fjnax chfflpng chfflsbbg chfflgbr');

// Words that are only offensive on their own (so "class", "peacock", "title" stay fine).
const EXACT = new Set(decode('nff nffrf nefr nefrf onfgneq onfgneqf obyybpxf obare obbo obbof obbol ohggubyr pbpx pbpxf phz phzf qvpx qvpxf qlxr qlxrf snt sntf xvxr xvxrf cravf cravfrf cvff cvffrq cvffrf encr encrq encrf encvat encvfg ergneq ergneqrq ergneqf fcvp fcvpf gvg gvgf gvggl gvggvrf gjng gjngf intvan intvanf puvax puvaxf pbba pbbaf tbbx tbbxf ubzb ubzbf arteb artebrf ubbxre ubbxref ubeal betnfz betnfzf frzra fcrez grfgvpyr grfgvpyrf nany nahf pyvg pyvgf fxnax fxnaxf fpebghz frkl frk frkhny frkhnyyl ulzra anmv anmvf gnzcba'));

// Letter sequences never used as a prompt (they'd sit huge in the middle of the TV).
export const BAD_PROMPTS = new Set(decode('nff frk snt phz gvg avt shp shx pbx qvx wvm xxx pag ubr jgs fug cbb crr tnl spx'));

/** Spans [start, end) of `word` that are offensive, or [] if the word is fine. */
function offensiveSpans(word) {
  const w = String(word || '').toLowerCase();
  if (!w) return [];
  if (EXACT.has(w)) return [[0, w.length]];
  if (ALLOW_ROOTS.some((a) => w.includes(a))) return [];
  const spans = [];
  for (const s of SUBSTRINGS) {
    for (let i = w.indexOf(s); i >= 0; i = w.indexOf(s, i + 1)) spans.push([i, i + s.length]);
  }
  return spans;
}

/** true if `word` (lowercase a-z) shouldn't be shown in full on the shared screen. */
export function isOffensive(word) {
  return offensiveSpans(word).length > 0;
}

/** What the TV shows for a word: offensive parts masked except their first letter, the rest left readable. */
export function displayWord(word) {
  const w = String(word || '');
  const spans = offensiveSpans(w);
  if (!spans.length) return w;
  const out = w.split('');
  for (const [a, b] of spans) for (let i = a + 1; i < b; i++) out[i] = '*';
  return out.join('');
}
