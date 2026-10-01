// Family-friendly display filter. Offensive words are still ACCEPTED as valid plays (they are real words and
// rejecting them would feel arbitrary), but they are never shown in big letters on the TV: they get masked.
// Lists are ROT13-encoded so the source stays readable without a wall of profanity.

const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const decode = (s) => rot13(s).split(' ').filter(Boolean);

// Roots that are offensive wherever they appear inside a word.
const SUBSTRINGS = decode('shpx phag avttre avttn snttbg fuvg juber fyhg ovgpu zbgures qvpxurnq nffubyr ohyyfuvg wvmm qvyqb jnax chffl cbea');

// Words that are only offensive on their own (so "class", "peacock", "title" stay fine).
const EXACT = new Set(decode('nff nffrf nefr nefrf onfgneq onfgneqf obyybpxf obare obbo obbof obbol ohggubyr pbpx pbpxf penc penccl phz phzf qvpx qvpxf qlxr qlxrf snt sntf xvxr xvxrf cravf cravfrf cvff cvffrq cvffrf encr encrq encrf encvat encvfg ergneq ergneqrq ergneqf fcvp fcvpf gvg gvgf gvggl gvggvrf gjng gjngf intvan intvanf puvax puvaxf pbba pbbaf tbbx tbbxf ubzb ubzbf arteb artebrf ubbxre ubbxref ubeal betnfz betnfzf frzra fcrez grfgvpyr grfgvpyrf nany nahf pyvg pyvgf fxnax fxnaxf fpebghz frkl frk frkhny frkhnyyl ulzra anmv anmvf gnzcba gheq gheqf cbbc crr crrq crrvat chxr'));

// Letter sequences never used as a prompt (they'd sit huge in the middle of the TV).
export const BAD_PROMPTS = new Set(decode('nff frk snt phz gvg avt shp shx pbx qvx wvm xxx pag ubr jgs fug cbb crr tnl spx'));

/** true if `word` (lowercase a-z) should not be displayed on the shared screen. */
export function isOffensive(word) {
  const w = String(word || '').toLowerCase();
  if (!w) return false;
  if (EXACT.has(w)) return true;
  for (const s of SUBSTRINGS) if (w.includes(s)) return true;
  return false;
}

/** What to show on the TV for a word: the word itself, or a same-length mask. */
export function displayWord(word) {
  return isOffensive(word) ? '✱'.repeat(Math.max(3, Math.min(String(word).length, 12))) : word;
}
