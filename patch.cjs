const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/currentBalance/g, 'paperBalance'); // since most of it is paper anyway
// except in api/state, we want to return both
code = code.replace('paperBalance, contractSlug:', 'paperBalance, liveBalance, contractSlug:');
fs.writeFileSync('server.ts', code);
