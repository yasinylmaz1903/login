const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onNotificationData: (callback) => {
    ipcRenderer.on('notification-data', (event, data) => {
      callback(data);
    });
  },
  closeNotification: () => {
    ipcRenderer.send('close-notification');
  },
  notificationClicked: () => {
    ipcRenderer.send('notification-clicked');
  }
});
