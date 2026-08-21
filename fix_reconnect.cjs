const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace("limitlessWsClient.on('reconnect', () => {", "(limitlessWsClient as any).on('reconnect', () => {");
code = code.replaceAll('console.log(`Limitless WS Reconnected. Resubscribing...`);', 'console.log(`Limitless WS Reconnected. Resubscribing...`);'); // just to check if it matches

fs.writeFileSync('server.ts', code);
