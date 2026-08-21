const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace('broadcast("balance", { balance: paperBalance });', 'broadcast("balance", { paperBalance, liveBalance });');
fs.writeFileSync('server.ts', code);
