(() => {
  const dom = {
    title: document.getElementById('calendar-title'),
    timeDisplay: document.getElementById('time-display'),
    btnHide: document.getElementById('btn-hide'),
    calendarMonth: document.getElementById('calendar-month'),
    calendarDays: document.getElementById('calendar-days'),
    prevMonth: document.getElementById('prev-month'),
    nextMonth: document.getElementById('next-month'),
    btnAddAlarm: document.getElementById('btn-add-alarm'),
    alarmList: document.getElementById('alarm-list'),
    alarmModal: document.getElementById('alarm-modal'),
    alarmDate: document.getElementById('alarm-date'),
    alarmTime: document.getElementById('alarm-time'),
    alarmText: document.getElementById('alarm-text'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSave: document.getElementById('modal-save')
  };

  let currentDate = new Date();
  let alarms = [];

  const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  function updateTimeDisplay() {
    const now = new Date();
    const dayName = DAYS_TR[now.getDay()];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    dom.timeDisplay.textContent = `${dayName}, ${hours}:${minutes}`;
  }

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    dom.calendarMonth.textContent = `${MONTHS_TR[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);

    const firstDayIndex = (firstDay.getDay() + 6) % 7; // Pazartesi başlasın
    const lastDayDate = lastDay.getDate();
    const prevLastDayDate = prevLastDay.getDate();

    let days = '';

    // Previous month days
    for (let i = firstDayIndex; i > 0; i--) {
      days += `<div class="day other-month">${prevLastDayDate - i + 1}</div>`;
    }

    // Current month days
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    for (let i = 1; i <= lastDayDate; i++) {
      const isToday = isCurrentMonth && today.getDate() === i;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const hasAlarm = alarms.some(a => a.date === dateStr);
      
      days += `<div class="day ${isToday ? 'today' : ''} ${hasAlarm ? 'has-alarm' : ''}">${i}</div>`;
    }

    // Next month days
    const totalCells = firstDayIndex + lastDayDate;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingCells; i++) {
      days += `<div class="day other-month">${i}</div>`;
    }

    dom.calendarDays.innerHTML = days;
  }

  function renderAlarms() {
    if (alarms.length === 0) {
      dom.alarmList.innerHTML = '<div class="empty-state">Henüz alarm eklenmemiş</div>';
      return;
    }

    // Sort alarms by datetime
    const sortedAlarms = [...alarms].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateA - dateB;
    });

    dom.alarmList.innerHTML = sortedAlarms.map(alarm => {
      const alarmDate = new Date(`${alarm.date}T${alarm.time}`);
      const dateStr = `${alarm.date.split('-')[2]} ${MONTHS_TR[alarmDate.getMonth()]} ${alarmDate.getFullYear()}`;
      
      return `
        <div class="alarm-item">
          <div class="alarm-info">
            <div class="alarm-time">${alarm.time} - ${dateStr}</div>
            <div class="alarm-text">${alarm.text || 'Alarm'}</div>
          </div>
          <button class="alarm-delete" data-id="${alarm.id}">Sil</button>
        </div>
      `;
    }).join('');

    // Attach delete handlers
    dom.alarmList.querySelectorAll('.alarm-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        deleteAlarm(id);
      });
    });
  }

  function deleteAlarm(id) {
    alarms = alarms.filter(a => a.id !== id);
    saveAlarms();
    renderAlarms();
    renderCalendar();
  }

  function openAlarmModal() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    dom.alarmDate.value = dateStr;
    dom.alarmTime.value = timeStr;
    dom.alarmText.value = '';
    dom.alarmModal.classList.add('active');
  }

  function closeAlarmModal() {
    dom.alarmModal.classList.remove('active');
  }

  function saveNewAlarm() {
    const date = dom.alarmDate.value;
    const time = dom.alarmTime.value;
    const text = dom.alarmText.value.trim();

    if (!date || !time) {
      alert('Tarih ve saat alanları zorunludur!');
      return;
    }

    const newAlarm = {
      id: Date.now(),
      date,
      time,
      text: text || 'Alarm',
      triggered: false
    };

    alarms.push(newAlarm);
    saveAlarms();
    renderAlarms();
    renderCalendar();
    closeAlarmModal();
  }

  function saveAlarms() {
    if (window.browserAPI?.calendarSaveAlarms) {
      window.browserAPI.calendarSaveAlarms(alarms);
    }
  }

  function checkAlarms() {
    const now = new Date();
    const currentDateTime = now.getTime();

    alarms.forEach(alarm => {
      if (alarm.triggered) return;

      const alarmDateTime = new Date(`${alarm.date}T${alarm.time}`).getTime();
      const diff = alarmDateTime - currentDateTime;

      // 2 dakika kala bildirim
      if (diff > 0 && diff <= 120000 && !alarm.notified) {
        alarm.notified = true;
        if (window.browserAPI?.calendarAlarmNotify) {
          window.browserAPI.calendarAlarmNotify(alarm);
        }
      }

      // Tam zamanında trigger
      if (diff <= 0 && !alarm.triggered) {
        alarm.triggered = true;
        if (window.browserAPI?.calendarAlarmTrigger) {
          window.browserAPI.calendarAlarmTrigger(alarm);
        }
      }
    });

    // Triggered alarmları temizle (geçmiş olanları)
    const oneDayAgo = currentDateTime - (24 * 60 * 60 * 1000);
    alarms = alarms.filter(alarm => {
      const alarmDateTime = new Date(`${alarm.date}T${alarm.time}`).getTime();
      return alarmDateTime > oneDayAgo || !alarm.triggered;
    });

    saveAlarms();
  }

  // Event Listeners
  dom.btnHide.addEventListener('click', () => {
    if (window.browserAPI?.hideCalendarPanel) {
      window.browserAPI.hideCalendarPanel();
    }
  });

  dom.prevMonth.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  dom.nextMonth.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  dom.btnAddAlarm.addEventListener('click', openAlarmModal);
  dom.modalCancel.addEventListener('click', closeAlarmModal);
  dom.modalSave.addEventListener('click', saveNewAlarm);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dom.alarmModal.classList.contains('active')) {
        closeAlarmModal();
      } else if (window.browserAPI?.hideCalendarPanel) {
        window.browserAPI.hideCalendarPanel();
      }
    }
  });

  // IPC listeners
  if (window.browserAPI?.onCalendarUpdate) {
    window.browserAPI.onCalendarUpdate((data) => {
      alarms = data || [];
      renderAlarms();
      renderCalendar();
    });
  }

  // Initial load
  if (window.browserAPI?.calendarLoadAlarms) {
    window.browserAPI.calendarLoadAlarms().then(data => {
      alarms = data || [];
      renderAlarms();
      renderCalendar();
    });
  }

  // Update time every second
  updateTimeDisplay();
  setInterval(updateTimeDisplay, 1000);

  // Check alarms every 10 seconds
  setInterval(checkAlarms, 10000);
  checkAlarms();

  // Initial render
  renderCalendar();
  renderAlarms();
})();
