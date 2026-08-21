const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace('<span className="text-sm font-mono text-emerald-500">${balance.toFixed(2)} (ALL-IN)</span>',
  '<span className="text-sm font-mono text-emerald-500">100% (ALL-IN)</span>');

// Let's add a Wallet section at the very top of the grid or before settings
const walletHtml = `
            {/* Wallets */}
            <section className="bg-[#14161B] border border-gray-800 rounded-lg p-5">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex justify-between items-center">
                Wallets
                <Wallet className="w-4 h-4 text-gray-600" />
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0A0B0D] border border-gray-800 rounded p-3">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">PAPER WALLET</div>
                  <div className={\`text-lg font-mono font-bold \${paperBalance > 5 ? 'text-emerald-400' : paperBalance < 5 ? 'text-rose-400' : 'text-gray-200'}\`}>
                    \${paperBalance.toFixed(2)}
                  </div>
                </div>
                <div className="bg-[#0A0B0D] border border-gray-800 rounded p-3">
                  <div className="text-[10px] font-bold text-gray-500 mb-1">REAL WALLET</div>
                  <div className="text-lg font-mono font-bold text-blue-400">
                    \${liveBalance.toFixed(2)}
                  </div>
                </div>
              </div>
            </section>
`;

code = code.replace('{/* Settings */}', walletHtml + '\n            {/* Settings */}');

// We need to import Wallet icon
if (!code.includes('Wallet,')) {
  code = code.replace('Zap', 'Zap, Wallet');
}

fs.writeFileSync('src/App.tsx', code);
