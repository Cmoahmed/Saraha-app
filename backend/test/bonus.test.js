const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('bonus examples and edge cases', () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../bonus.js'), 'utf8'), context);
  for (const [input, expected] of [[['flower', 'flow', 'flight'], 'fl'], [['dog', 'racecar', 'car'], ''], [[], ''], [[''], ''], [['alone'], 'alone'], [['same', 'same'], 'same']]) assert.equal(context.longestCommonPrefix(input), expected);
});
