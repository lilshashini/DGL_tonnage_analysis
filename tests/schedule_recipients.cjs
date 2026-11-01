const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const helpers = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/lib/schedule-recipients.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
}).outputText, {exports: helpers});
const saved = [
  {email: ' shared@example.test ', display_name: 'Saved Name', is_air: true, is_sea: false},
  {email: 'saved@example.test', display_name: 'Saved Only', is_air: false, is_sea: true},
];
const ad = [
  {email: ' SHARED@EXAMPLE.TEST ', displayName: 'AD Name'},
  {email: 'ad@example.test', displayName: 'AD Only'},
  {email: null, displayName: 'No email'},
];
for (const mode of ['AIR', 'SEA']) {
  const result = helpers.buildScheduleRecipients(saved, ad, mode);
  assert.equal(result.length, 3, 'Same email in AD and saved directory must appear once');
  assert.equal(result.find(p => p.email === 'ad@example.test').enabled, true, 'AD-only recipients can be selected in either mode');
  assert.equal(result.find(p => p.email === 'shared@example.test').enabled, mode === 'AIR', 'AD must not override saved preferences');
  assert.equal(result.find(p => p.email === 'saved@example.test').enabled, mode === 'SEA');
  assert.equal(result.find(p => p.email === 'shared@example.test').name, 'AD Name');
}
assert.equal(helpers.buildScheduleRecipients(saved, [], 'AIR').length, 2, 'Saved recipients remain available when AD is unavailable');
console.log('PASS: AD-only users, saved users, deduplication, freight preferences and directory fallback.');
