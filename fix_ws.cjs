const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replaceAll('LIMITLESS_TOKEN_ID', 'LIMITLESS_API_KEY');
code = code.replaceAll('LIMITLESS_TOKEN_SECRET', 'LIMITLESS_API_SECRET');

const reSubscribePositions = `                limitlessWsClient?.subscribe('subscribe_positions').catch(console.error);`;
const newReSubscribePositions = `                limitlessWsClient?.subscribe('subscribe_positions', { marketSlugs: [activeContractSlug] }).catch(console.error);`;
code = code.replace(reSubscribePositions, newReSubscribePositions);

const subscribePositions = `              await limitlessWsClient.subscribe('subscribe_positions');`;
const newSubscribePositions = `              await limitlessWsClient.subscribe('subscribe_positions', { marketSlugs: [activeContractSlug!] });`;
code = code.replace(subscribePositions, newSubscribePositions);

fs.writeFileSync('server.ts', code);
