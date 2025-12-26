const { contextBridge, ipcRenderer } = require('electron');

// Canvas Fingerprinting Engelleyici
(() => {
  try {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    
    function addNoise(imageData) {
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.01) {
          data[i] = data[i] ^ (Math.random() < 0.5 ? 1 : 0);
          data[i + 1] = data[i + 1] ^ (Math.random() < 0.5 ? 1 : 0);
          data[i + 2] = data[i + 2] ^ (Math.random() < 0.5 ? 1 : 0);
        }
      }
      return imageData;
    }
    
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, args);
    };
    
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      const ctx = this.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        addNoise(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      return originalToBlob.call(this, callback, ...args);
    };
    
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = originalGetImageData.apply(this, args);
      return addNoise(imageData);
    };
  } catch (_err) { /* noop */ }
})();

// Telegram bildirimleri için IPC bridge
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      // Sadece izin verilen kanallar
      const validChannels = ['telegram-notification'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    }
  }
});

