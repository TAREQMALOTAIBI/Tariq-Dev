const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "const httpClient = new HttpClient({",
  "const logger = new ConsoleLogger('info');\n    const httpClient = new HttpClient({\n      logger,\n"
);
fs.writeFileSync('server.ts', code);
