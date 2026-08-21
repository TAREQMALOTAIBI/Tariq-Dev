const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace('const [balance, setBalance] = useState<number>(5.00);', 
  'const [paperBalance, setPaperBalance] = useState<number>(5.00);\n  const [liveBalance, setLiveBalance] = useState<number>(0.00);');

code = code.replace('if (data.currentBalance !== undefined) setBalance(data.currentBalance);',
  'if (data.paperBalance !== undefined) setPaperBalance(data.paperBalance);\n        if (data.liveBalance !== undefined) setLiveBalance(data.liveBalance);');

code = code.replace('eventSource.addEventListener("balance", (e) => {\n      const data = JSON.parse(e.data);\n      if (data.balance) setBalance(data.balance);\n    });',
  'eventSource.addEventListener("balance", (e) => {\n      const data = JSON.parse(e.data);\n      if (data.paperBalance !== undefined) setPaperBalance(data.paperBalance);\n      if (data.liveBalance !== undefined) setLiveBalance(data.liveBalance);\n    });');

fs.writeFileSync('src/App.tsx', code);
