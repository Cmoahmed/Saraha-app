// Course Section B - Question 11 - One backend watcher plus the isolated TypeScript watcher
const { concurrently } = require('concurrently');
const commands = ['npm run dev', 'npm run watch:learning'];
if (process.argv.includes('--check')) console.log(JSON.stringify(commands));
else concurrently(commands, { killOthers: ['failure', 'success'] }).result.catch(() => { process.exitCode = 1; });
