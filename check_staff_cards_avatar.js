const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const sIdx = html.indexOf('function renderStaffTable');
console.log('renderStaffTable teaching card:\n', html.substring(sIdx + 900, sIdx + 2200));

const ntIdx = html.indexOf('function renderStaffTable');
console.log('\nrenderStaffTable non-teaching card:\n', html.substring(sIdx + 6200, sIdx + 7500));
