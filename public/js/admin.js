// IT Admin Portal Logic

let adminPin = sessionStorage.getItem('admin_pin') || '';
let currentTab = 'feed';
let staffDirectory = [];

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const localDate = `${y}-${m}-${d}`;
  document.getElementById('date-picker').value = localDate;

  if (adminPin) {
    showDashboard();
  }
});

// Admin PIN Authentication
async function verifyAdminPin() {
  const pinInput = document.getElementById('admin-pin-input');
  const alertBox = document.getElementById('login-alert');
  const pin = pinInput.value.trim();

  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_pin: pin })
    });

    const data = await res.json();
    if (!res.ok) {
      alertBox.textContent = data.error || 'Invalid Admin PIN';
      alertBox.style.display = 'block';
      return;
    }

    adminPin = pin;
    sessionStorage.setItem('admin_pin', pin);
    alertBox.style.display = 'none';
    showDashboard();
  } catch (err) {
    alertBox.textContent = 'Server connection error.';
    alertBox.style.display = 'block';
  }
}

function showDashboard() {
  document.getElementById('admin-login-card').style.display = 'none';
  document.getElementById('admin-dashboard').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-block';
  loadAttendanceData();
  loadStaffDirectory();
  loadSettings();

  // Auto-refresh every 20 seconds for live roster updates
  setInterval(() => {
    if (currentTab === 'feed' || currentTab === 'absent') {
      loadAttendanceData(true);
    }
  }, 20000);
}

function logoutAdmin() {
  sessionStorage.removeItem('admin_pin');
  adminPin = '';
  document.getElementById('admin-dashboard').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('admin-login-card').style.display = 'block';
}

// Load Attendance & Stats for selected date
async function loadAttendanceData(silent = false) {
  let dateVal = document.getElementById('date-picker').value;
  if (!dateVal) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    dateVal = `${y}-${m}-${d}`;
    document.getElementById('date-picker').value = dateVal;
  }

  try {
    const res = await fetch(`/api/attendance/by_date?date=${encodeURIComponent(dateVal)}`);
    const data = await res.json();

    if (data.company_name) {
      document.getElementById('admin-header-title').textContent = `${data.company_name} - IT Admin`;
    }

    // Update Stats
    document.getElementById('stat-total').textContent = data.stats.total_staff;
    document.getElementById('stat-present').textContent = data.stats.checked_in;
    document.getElementById('stat-ontime').textContent = data.stats.on_time;
    document.getElementById('stat-late').textContent = data.stats.late;
    document.getElementById('stat-absent').textContent = data.stats.absent;
    document.getElementById('absent-badge-count').textContent = data.stats.absent;

    // Render Attendance Feed
    renderAttendanceFeed(data.attended);

    // Render Absent Roster
    renderAbsentTable(data.absent);
  } catch (err) {
    if (!silent) console.error('Error loading attendance:', err);
  }
}

function renderAttendanceFeed(attended) {
  const feed = document.getElementById('attendance-feed');
  const emptyMsg = document.getElementById('no-attendance-msg');

  feed.innerHTML = '';
  if (!attended || attended.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  attended.forEach(item => {
    const card = document.createElement('div');
    card.className = 'staff-card';

    const isLate = item.status === 'late';
    const badgeHtml = isLate
      ? `<span class="badge badge-warning">⚠ Late</span>`
      : `<span class="badge badge-success">✓ On Time</span>`;

    card.innerHTML = `
      <div class="staff-photo-wrapper" onclick="openPhotoModal('${item.photo_url}', '${escapeHtml(item.name)}', '${item.check_in_time}', '${item.date}')">
        <img class="staff-photo" src="${item.photo_url}" alt="${escapeHtml(item.name)}" onerror="this.src='/uploads/placeholder.png'">
        <div class="photo-zoom-hint">🔍 View Photo</div>
      </div>
      <div class="staff-card-body">
        <div>
          <div class="staff-name">${escapeHtml(item.name)}</div>
          <div class="staff-dept">${escapeHtml(item.department)} &bull; ${item.code}</div>
          ${item.notes ? `<div style="font-size: 12px; color: var(--gray-600); margin-top: 4px;">📝 ${escapeHtml(item.notes)}</div>` : ''}
        </div>
        <div class="staff-meta">
          <div>
            <div style="font-size: 11px; color: var(--gray-600);">Clock-In Time</div>
            <div style="font-weight: 700; font-size: 14px;">${item.check_in_time}</div>
          </div>
          <div>${badgeHtml}</div>
        </div>
      </div>
    `;
    feed.appendChild(card);
  });
}

function renderAbsentTable(absentList) {
  const tbody = document.getElementById('absent-table-body');
  tbody.innerHTML = '';

  if (!absentList || absentList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--success); font-weight: 600;">All active staff have clocked in today! 🎉</td></tr>`;
    return;
  }

  absentList.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.code}</strong></td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.department)}</td>
      <td>${s.expected_time}</td>
      <td><span class="badge badge-danger">Not Checked In</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Load Staff Directory
async function loadStaffDirectory() {
  try {
    const res = await fetch('/api/admin/staff', {
      headers: { 'X-Admin-Pin': adminPin }
    });
    if (!res.ok) return;

    staffDirectory = await res.json();
    const tbody = document.getElementById('staff-table-body');
    tbody.innerHTML = '';

    staffDirectory.forEach(s => {
      const tr = document.createElement('tr');
      const statusBadge = s.is_active === 1
        ? `<span class="badge badge-success">Active</span>`
        : `<span class="badge badge-gray">Inactive</span>`;

      tr.innerHTML = `
        <td><strong>${s.code}</strong></td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.department)}</td>
        <td>
          <span style="font-family: monospace; letter-spacing: 2px;">${s.pin}</span>
        </td>
        <td>${s.expected_time}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openEditStaffModal(${s.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteStaff(${s.id}, '${escapeHtml(s.name)}')">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading staff directory:', err);
  }
}

// Staff Modal & Form
function openAddStaffModal() {
  document.getElementById('staff-modal-title').textContent = 'Add New Staff Member';
  document.getElementById('staff-form').reset();
  document.getElementById('staff-form-id').value = '';
  document.getElementById('staff-active-group').style.display = 'none';
  document.getElementById('staff-form-delete').style.display = 'none';
  document.getElementById('staff-modal').style.display = 'flex';
}

function openEditStaffModal(id) {
  const staff = staffDirectory.find(s => s.id === id);
  if (!staff) return;

  document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
  document.getElementById('staff-form-id').value = staff.id;
  document.getElementById('staff-form-code').value = staff.code;
  document.getElementById('staff-form-name').value = staff.name;
  document.getElementById('staff-form-dept').value = staff.department;
  document.getElementById('staff-form-pin').value = staff.pin;
  document.getElementById('staff-form-time').value = staff.expected_time || '09:00';
  document.getElementById('staff-form-active').checked = staff.is_active === 1;
  document.getElementById('staff-active-group').style.display = 'block';
  document.getElementById('staff-form-delete').style.display = 'block';

  document.getElementById('staff-modal').style.display = 'flex';
}

function onModalDeleteClick() {
  const id = document.getElementById('staff-form-id').value;
  const name = document.getElementById('staff-form-name').value;
  if (id) {
    confirmDeleteStaff(parseInt(id), name);
  }
}

async function confirmDeleteStaff(id, name) {
  if (!confirm(`Are you sure you want to permanently remove "${name}" from the company directory?`)) {
    return;
  }

  try {
    const res = await fetch('/api/admin/staff/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pin': adminPin
      },
      body: JSON.stringify({ id: id })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to remove staff member');
      return;
    }

    closeStaffModal();
    loadStaffDirectory();
    loadAttendanceData();
  } catch (err) {
    alert('Failed to connect to server.');
  }
}

function closeStaffModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  document.getElementById('staff-modal').style.display = 'none';
}

async function submitStaffForm() {
  const id = document.getElementById('staff-form-id').value;
  const isEdit = !!id;

  const payload = {
    id: id ? parseInt(id) : undefined,
    code: document.getElementById('staff-form-code').value.trim(),
    name: document.getElementById('staff-form-name').value.trim(),
    department: document.getElementById('staff-form-dept').value.trim(),
    pin: document.getElementById('staff-form-pin').value.trim(),
    expected_time: document.getElementById('staff-form-time').value,
    is_active: document.getElementById('staff-form-active').checked
  };

  const endpoint = isEdit ? '/api/admin/staff/update' : '/api/admin/staff/add';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pin': adminPin
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to save staff member');
      return;
    }

    closeStaffModal();
    loadStaffDirectory();
    loadAttendanceData();
  } catch (err) {
    alert('Failed to connect to server.');
  }
}

// Load and Save Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'X-Admin-Pin': adminPin }
    });
    if (!res.ok) return;
    const settings = await res.json();

    if (settings.company_name) document.getElementById('setting-company-name').value = settings.company_name;
    if (settings.work_start_time) document.getElementById('setting-start-time').value = settings.work_start_time;
    if (settings.grace_period_mins) document.getElementById('setting-grace-mins').value = settings.grace_period_mins;
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings() {
  const alertEl = document.getElementById('settings-alert');
  const payload = {
    company_name: document.getElementById('setting-company-name').value.trim(),
    work_start_time: document.getElementById('setting-start-time').value,
    grace_period_mins: document.getElementById('setting-grace-mins').value
  };

  const newPin = document.getElementById('setting-admin-pin').value.trim();
  const currentPin = adminPin; // use the PIN currently stored in session for auth

  if (newPin) {
    payload.admin_pin = newPin;
  }

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Pin': currentPin
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      if (newPin) {
        adminPin = newPin;
        sessionStorage.setItem('admin_pin', newPin);
      }
      alertEl.textContent = 'Settings successfully saved!';
      alertEl.style.display = 'block';
      setTimeout(() => { alertEl.style.display = 'none'; }, 3000);
      loadAttendanceData();
    }
  } catch (err) {
    alert('Failed to update settings');
  }
}

// Photo Zoom Modal
function openPhotoModal(url, name, time, date) {
  document.getElementById('modal-img').src = url;
  document.getElementById('photo-modal-name').textContent = `${name} - Attendance Proof`;
  document.getElementById('photo-modal-meta').textContent = `Clocked in at ${time} on ${date}`;
  document.getElementById('photo-modal').style.display = 'flex';
}

function closePhotoModal(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  document.getElementById('photo-modal').style.display = 'none';
}

// Export CSV for Payroll
function exportCSV() {
  const dateVal = document.getElementById('date-picker').value;
  window.location.href = `/api/attendance/export?start_date=${dateVal}&end_date=${dateVal}`;
}

// Tabs Switching
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('section[id^="tab-"]').forEach(sec => sec.style.display = 'none');

  if (tab === 'feed') {
    document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    document.getElementById('tab-feed').style.display = 'block';
    loadAttendanceData();
  } else if (tab === 'absent') {
    document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    document.getElementById('tab-absent').style.display = 'block';
    loadAttendanceData();
  } else if (tab === 'staff') {
    document.querySelector('.tab-btn:nth-child(3)').classList.add('active');
    document.getElementById('tab-staff').style.display = 'block';
    loadStaffDirectory();
  } else if (tab === 'settings') {
    document.querySelector('.tab-btn:nth-child(4)').classList.add('active');
    document.getElementById('tab-settings').style.display = 'block';
    loadSettings();
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
