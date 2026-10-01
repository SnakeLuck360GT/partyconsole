# Brain Brawl — credits

## Questions
Multiple-choice and true/false questions in `questions.json` come from the
**Open Trivia Database** (https://opentdb.com), licensed under
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**
(https://creativecommons.org/licenses/by-sa/4.0/).

The data was fetched with `scripts/trivia-build.mjs`. Changes made: HTML/URL entities decoded,
whitespace normalised, categories renamed for display (e.g. "Entertainment: Film" → "Film"),
duplicates removed and the fields re-shaped to a compact format. The derived `questions.json` is
shared under the same CC BY-SA 4.0 licence.

## Closest-number questions
The "Closest number" questions (`src/games/trivia/closest.js`) are original to PartyConsole.

## Sounds and visuals
All sounds are synthesized at runtime by the PartyConsole SDK. All visuals are CSS/SVG drawn in code.
