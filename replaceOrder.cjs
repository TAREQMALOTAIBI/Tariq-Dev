const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldOrderCall = `        const result = await limitlessOrderClient.createOrder({
          marketSlug: market.slug,
          tokenId: tokenId,
          side: Side.BUY,
          makerAmount: tradeAmount, // Buy FOK using 10% dollar amount
          orderType: OrderType.FOK,
        });`;

const newOrderCall = `        const result = await orderQueue.enqueue(() =>
          withRetry(
            () => limitlessOrderClient!.createOrder({
              marketSlug: market.slug,
              tokenId: tokenId,
              side: Side.BUY,
              makerAmount: tradeAmount,
              orderType: OrderType.FOK,
            }),
            { statusCodes: [429, 500, 502, 503, 504], maxRetries: 3 }
          )
        );`;

code = code.replace(oldOrderCall, newOrderCall);
code = code.replace(
  `        if (error.status) {`,
  `        if (error instanceof APIError) {
           console.error(\`API Error \${error.status}: \${error.message}\`, error.data);
        } else if (error.status) {`
);
fs.writeFileSync('server.ts', code);
