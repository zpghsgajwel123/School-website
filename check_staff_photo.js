const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find staff modal form
const sIdx = html.indexOf('id="modal-staff"');
console.log('modal-staff form:');
console.log(html.substring(sIdx, sIdx + 1600));

// Find staffPhotoOverrides or where staff photo is stored/used
let pos = 0;
while ((pos = html.indexOf('staffPhotoOverrides', pos)) !== -1) {
  console.log('staffPhotoOverrides pos:', pos);
  console.log(html.substring(pos - 50, pos + 250));
  pos += 'staffPhotoOverrides'.length;
}

// Find view staff avatar/photo
const vIdx = html.indexOf('id="view-staff-avatar"');
console.log('\nview-staff-avatar pos:', vIdx);
console.log(html.substring(vIdx - 100, vIdx + 300));
