const { contextBridge, ipcRenderer } = require('electron');

// Mask legacy Electron globals
(() => {
  try {
    const noopRequire = () => undefined;
    window.electronRequire = noopRequire;
    window.nodeRequire = noopRequire;
    window.require = noopRequire;
    window.module = undefined;
    window.exports = undefined;
    contextBridge.exposeInMainWorld('electronRequire', noopRequire);
    contextBridge.exposeInMainWorld('nodeRequire', noopRequire);
    contextBridge.exposeInMainWorld('require', noopRequire);
  } catch (_err) {
    /* noop */
  }
})();

contextBridge.exposeInMainWorld('browserAPI', {
  hideCalendarPanel: () => ipcRenderer.send('hide-calendar-panel'),
  calendarLoadAlarms: () => ipcRenderer.invoke('calendar-load-alarms'),
  calendarSaveAlarms: (alarms) => ipcRenderer.send('calendar-save-alarms', alarms),
  calendarAlarmNotify: (alarm) => ipcRenderer.send('calendar-alarm-notify', alarm),
  calendarAlarmTrigger: (alarm) => ipcRenderer.send('calendar-alarm-trigger', alarm),
  onCalendarUpdate: (callback) => ipcRenderer.on('calendar-update', (_event, data) => callback(data))
});
