#!/usr/bin/env node
/**
 * Valy parser test runner
 * Usage: node tests/runner.js
 *
 * Runs every case in cases.json through the same parseEmail logic used in
 * background.js and reports pass/fail. No network calls, no extension needed.
 */

const cases = require('./cases.json');

// ─── Inline the parser (must stay in sync with background.js) ────────────────

function parseEmail({ subject, body: rawBody }) {
  const full = `${subject}\n${rawBody}`;

  // 1. Hyphenated codes (govt/enterprise MFA)
  const hyphenMatch = full.match(/\b(\d{4}-\d{6})\b/);
  if (hyphenMatch) return { type: 'code', code: hyphenMatch[1] };

  // 2. Spaced 3+3 codes (Squarespace style)
  const spacedMatch = full.match(/\b(\d{3})\s(\d{3})\b/);
  if (spacedMatch) return { type: 'code', code: spacedMatch[1] + spacedMatch[2] };

  // 3. Context + code
  const contextPatterns = [
    /(?:code|otp|pin|passcode|verification|one.time|token|single.use|temporary)[^\d]{0,30}([0-9]{4,8})\b/i,
    /\b([0-9]{6})\b/,
    /\b([0-9]{4,8})\b/,
  ];
  for (const re of contextPatterns) {
    const m = full.match(re);
    if (m) {
      const code = m[1];
      if (/^(19|20)\d{2}$/.test(code)) continue;
      return { type: 'code', code };
    }
  }

  // 4. Action links
  const links = [...(full.match(/https?:\/\/[^\s"'<>{}|\\^`[\]]+/gi) || [])];
  const actionKeywords = /verify|confirm|activate|reset|password|magic|login|signin|validate|click/i;
  const link = links.find(l => actionKeywords.test(l) && l.length < 2000);
  if (link) return { type: 'link', link };

  return null;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const tc of cases) {
  const result = parseEmail(tc);
  const gotType = result?.type;
  const gotValue = result?.type === 'code' ? result.code : result?.link;

  const typeOk = gotType === tc.expectedType;
  const valueOk = gotValue === tc.expectedValue;
  const ok = typeOk && valueOk;

  if (ok) {
    console.log(`  ✓  ${tc.id}  ${tc.name}`);
    passed++;
  } else {
    console.log(`  ✗  ${tc.id}  ${tc.name}`);
    if (!typeOk) console.log(`       type:  got "${gotType}", want "${tc.expectedType}"`);
    if (!valueOk) console.log(`       value: got "${gotValue}", want "${tc.expectedValue}"`);
    if (tc.notes) console.log(`       note:  ${tc.notes}`);
    failed++;
  }
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
