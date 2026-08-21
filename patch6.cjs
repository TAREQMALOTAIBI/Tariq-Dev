const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const tpslHtml = `
                <div className="flex justify-between items-center pt-2 border-t border-gray-800/50 mt-4">
                  <span className="text-sm text-gray-400 font-medium">Trade Size</span>
                  <span className="text-sm font-mono text-emerald-500">100% (ALL-IN)</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-800/50 mt-4">
                  <span className="text-sm text-gray-400 font-medium">Take Profit (TP)</span>
                  <span className="text-sm font-mono text-emerald-500">+10%</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-800/50 mt-4">
                  <span className="text-sm text-gray-400 font-medium">Stop Loss (SL)</span>
                  <span className="text-sm font-mono text-rose-500">-10%</span>
                </div>
`;

code = code.replace(/<div className="flex justify-between items-center pt-2 border-t border-gray-800\/50 mt-4">\s*<span className="text-sm text-gray-400 font-medium">Trade Size<\/span>\s*<span className="text-sm font-mono text-emerald-500">100% \(ALL-IN\)<\/span>\s*<\/div>/m, tpslHtml.trim());
fs.writeFileSync('src/App.tsx', code);
