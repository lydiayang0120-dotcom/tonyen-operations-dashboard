const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = __dirname;
for (const file of ['config.js','dashboard-data.js','dashboard.js']) {
  new vm.Script(fs.readFileSync(path.join(base,file),'utf8'),{filename:file});
}
const html = fs.readFileSync(path.join(base,'dashboard.template.html'),'utf8');
if (!html.includes('id="sms-dashboard-web"') || !html.includes(' hidden>')) throw new Error('Missing login wall');
fs.writeFileSync(path.join(base,'index.html'),html,'utf8');
console.log('Built index.html; source JavaScript syntax valid.');
