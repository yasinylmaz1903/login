const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const buf = await pngToIco(path.join(__dirname, 'resources', 'icons', 'ogame.png'));
    fs.writeFileSync(path.join(__dirname, 'resources', 'icons', 'icon.ico'), buf);
    console.log('✅ ICO icon oluşturuldu: resources/icons/icon.ico');
  } catch (err) {
    console.error('❌ Hata:', err);
    process.exit(1);
  }
})();
