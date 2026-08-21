const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const txListener = `            limitlessWsClient.on('tx', (data: any) => {
              if (data.status === 'confirmed') {
                console.log(\`WS Tx confirmed: \${data.hash}. Fetching new balance...\`);
                updateLiveBalance();
              }
            });`;

const newListeners = `            limitlessWsClient.on('tx', (data: any) => {
              if (data.status === 'confirmed') {
                console.log(\`WS Tx confirmed: \${data.hash}. Fetching new balance...\`);
                updateLiveBalance();
              }
            });
            
            limitlessWsClient.on('orderEvent', (event: any) => {
              if (event.source === 'OME') {
                console.log(\`WS Order OME: \${event.type} \${event.orderId}\`);
              } else if (event.source === 'SETTLEMENT') {
                console.log(\`WS Order Settlement: \${event.type} \${event.orderId} tx: \${event.txHash}\`);
              }
            });`;

code = code.replace(txListener, newListeners);

const subscribePos = `              await limitlessWsClient.subscribe('subscribe_positions');
              await limitlessWsClient.subscribe('subscribe_transactions');`;

const newSubscribes = `              await limitlessWsClient.subscribe('subscribe_positions');
              await limitlessWsClient.subscribe('subscribe_transactions');
              await limitlessWsClient.subscribe('subscribe_order_events');`;

code = code.replace(subscribePos, newSubscribes);
code = code.replace(
  `limitlessWsClient?.subscribe('subscribe_transactions').catch(console.error);`,
  `limitlessWsClient?.subscribe('subscribe_transactions').catch(console.error);\n                limitlessWsClient?.subscribe('subscribe_order_events').catch(console.error);`
);

fs.writeFileSync('server.ts', code);
