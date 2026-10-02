// Family-friendly word filter. Offensive words are REJECTED as plays ("Keep it clean") and, while someone is still
// typing one, the TV masks it so it never sits in big letters on the shared screen.
// Lists are ROT13-encoded so the source stays readable without a wall of profanity.

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

/** true if `word` (lowercase a-z) is not allowed as a play / shouldn't be displayed on the shared screen. */
export function isOffensive(word) {
  const w = String(word || '').toLowerCase();
  if (!w) return false;
  if (EXACT.has(w)) return true;
  if (ALLOW_ROOTS.some((a) => w.includes(a))) return false;
  for (const s of SUBSTRINGS) if (w.includes(s)) return true;
  return false;
}

/** What to show on the TV for a word: the word itself, or a same-length mask. */
export function displayWord(word) {
  return isOffensive(word) ? '•'.repeat(Math.max(3, Math.min(String(word).length, 12))) : word;
}
