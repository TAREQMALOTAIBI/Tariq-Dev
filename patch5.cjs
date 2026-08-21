const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const tpSlLogic = `
            limitlessWsClient.on('orderbookUpdate', (data: any) => {
              if (data.marketSlug === activeContractSlug && data.orderbook && data.orderbook.adjustedMidpoint !== undefined) {
                currentContractPrice = data.orderbook.adjustedMidpoint;
                broadcast("contract_price", { price: currentContractPrice, slug: activeContractSlug });

                // Check Take Profit / Stop Loss (10%)
                if (activeTrade && mode === "PAPER") {
                  if (currentContractPrice >= activeTrade.contractPrice * 1.10) {
                    const profit = activeTrade.amount * 0.10;
                    paperBalance = activeTrade.amount + profit;
                    console.log(\`[RESOLVE TP] Take Profit 10% Hit! New balance: $\${paperBalance.toFixed(2)}\`);
                    broadcast("balance", { paperBalance, liveBalance });
                    activeTrade = null;
                  } else if (currentContractPrice <= activeTrade.contractPrice * 0.90) {
                    const loss = activeTrade.amount * 0.10;
                    paperBalance = activeTrade.amount - loss;
                    console.log(\`[RESOLVE SL] Stop Loss 10% Hit! New balance: $\${paperBalance.toFixed(2)}\`);
                    broadcast("balance", { paperBalance, liveBalance });
                    activeTrade = null;
                  }
                }
              }
            });
`;

code = code.replace(/limitlessWsClient\.on\('orderbookUpdate',[\s\S]*?\}\);/m, tpSlLogic.trim());
fs.writeFileSync('server.ts', code);
