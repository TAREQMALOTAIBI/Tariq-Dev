const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add global wallet
code = code.replace(
  'let usdcContract: ethers.Contract | null = null;',
  'let usdcContract: ethers.Contract | null = null;\nlet walletSigner: ethers.Wallet | null = null;'
);

// 2. Change wallet to walletSigner
code = code.replace('const wallet = new ethers.Wallet(privateKey, provider);', 'walletSigner = new ethers.Wallet(privateKey, provider);\n      const wallet = walletSigner;');

// 3. Fix wallet references in WS
code = code.replaceAll('&& wallet &&', '&& walletSigner &&');
code = code.replaceAll('usdcAbi, wallet', 'usdcAbi, walletSigner');

// 4. Fix collateral -> cost & marketValue
code = code.replaceAll('pos.positions.yes.collateral', '(Number(pos.positions.yes.cost) / 1000000)');
code = code.replaceAll('pos.positions.no.collateral', '(Number(pos.positions.no.cost) / 1000000)');
code = code.replaceAll('pos.positions.yes.unrealizedPnl', '(Number(pos.positions.yes.unrealizedPnl) / 1000000)');
code = code.replaceAll('pos.positions.no.unrealizedPnl', '(Number(pos.positions.no.unrealizedPnl) / 1000000)');

// 5. Fix status on tradeDetails
code = code.replaceAll('tradeDetails.status =', '(tradeDetails as any).status =');

fs.writeFileSync('server.ts', code);
