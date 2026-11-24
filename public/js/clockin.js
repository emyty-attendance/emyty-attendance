// Clock-In Logic & Webcam Handling

let mediaStream = null;
let capturedPhotoBase64 = null;

// Digital Live Clock
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const clockEl = document.getElementById('live-clock');
  if (clockEl) clockEl.textContent = timeStr;
}
setInterval(updateClock, 1000);
updateClock();

// Load Active Staff into Dropdown
async function loadStaffList() {
  try {
    const res = await fetch('/api/staff/list');
    const staff = await res.json();
    const select = document.getElementById('staff-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Choose your profile --</option>';
    
    staff.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.department}) - ${s.code}`;
      select.appendChild(opt);
    });

    if (currentVal) {
      select.value = currentVal;
    }
  } catch (err) {
    showAlert('Failed to connect to attendance server. Please ensure the server is running.', 'danger');
  }
}

// Initialize Camera (Prefers front-facing selfie camera)
async function startCamera() {
  const video = document.getElementById('webcam');
  const overlay = document.getElementById('camera-overlay');
  const placeholder = document.getElementById('camera-placeholder');

  try {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user', // Front camera on mobile phones
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    video.srcObject = mediaStream;
    video.style.display = 'block';
    placeholder.style.display = 'none';
    overlay.style.display = 'flex';
  } catch (err) {
    console.warn('Camera access denied or unavailable:', err);
    placeholder.innerHTML = `
      <div style="font-size: 13px; color: #ef4444; margin-bottom: 8px;">
        Camera access blocked or not supported on this browser.
      </div>
      <label class="btn btn-primary btn-sm" style="cursor: pointer;">
        Take / Upload Photo
        <input type="file" accept="image/*" capture="user" style="display: none;" onchange="handleFallbackPhoto(event)">
      </label>
    `;
    overlay.style.display = 'none';
  }
}

// Capture current frame from video stream to base64
function capturePhoto() {
  if (capturedPhotoBase64) {
    return capturedPhotoBase64;
  }

  const video = document.getElementById('webcam');
  const canvas = document.getElementById('snapshot-canvas');

  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  // Mirror effect to match selfie preview
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.85);
}

// Fallback file handler (for mobile devices where camera permissions fail)
function handleFallbackPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    capturedPhotoBase64 = e.target.result;
    showAlert('Photo selected from device!', 'success');
  };
  reader.readAsDataURL(file);
}

// Form Submission
async function submitClockIn() {
  hideAlert();
  const staffSelect = document.getElementById('staff-select');
  const pinInput = document.getElementById('pin-input');
  const notesInput = document.getElementById('notes-input');
  const submitBtn = document.getElementById('submit-btn');

  const staffId = staffSelect.value;
  const pin = pinInput.value.trim();

  if (!staffId) {
    showAlert('Please select your name from the list.', 'danger');
    return;
  }

  if (!pin) {
    showAlert('Please enter your 4-digit PIN.', 'danger');
    return;
  }

  // Snap photo
  let photoData = capturePhoto();
  if (!photoData) {
    showAlert('Photo capture required to prove attendance. Please allow camera or upload a selfie.', 'danger');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Verifying & Saving...';

  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: staffId,
        pin: pin,
        photo_base64: photoData,
        notes: notesInput.value.trim()
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.error || 'Clock-in failed.', 'danger');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Snap Photo & Clock In';
      return;
    }

    // Success Screen
    showSuccess(data);
  } catch (err) {
    showAlert('Network error communicating with attendance server.', 'danger');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Snap Photo & Clock In';
  }
}

function showSuccess(data) {
  document.getElementById('clockin-card').style.display = 'none';
  const successScreen = document.getElementById('success-screen');
  successScreen.style.display = 'block';

  document.getElementById('conf-photo').src = data.photo_url || '';
  document.getElementById('conf-name').textContent = data.staff_name;
  document.getElementById('conf-time').textContent = `Clocked in at ${data.check_in_time} on ${data.date}`;

  const statusBadge = document.getElementById('conf-status');
  if (data.status === 'on_time') {
    statusBadge.className = 'badge badge-success';
    statusBadge.textContent = '✓ On Time';
  } else {
    statusBadge.className = 'badge badge-warning';
    statusBadge.textContent = `⚠ Late (+${data.diff_mins} mins)`;
  }
}

function resetForm() {
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('clockin-card').style.display = 'block';
  document.getElementById('checkin-form').reset();
  document.getElementById('submit-btn').disabled = false;
  document.getElementById('submit-btn').innerHTML = 'Snap Photo & Clock In';
  capturedPhotoBase64 = null;
  hideAlert();
}

function showAlert(msg, type = 'danger') {
  const box = document.getElementById('alert-box');
  box.className = `alert alert-${type}`;
  box.textContent = msg;
  box.style.display = 'block';
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  box.style.display = 'none';
}

function onStaffChange() {
  hideAlert();
}

// Initial bootstrap
window.addEventListener('DOMContentLoaded', () => {
  loadStaffList();
  startCamera();
});

// Auto-refresh staff list when user switches back to this tab or focuses the select
window.addEventListener('focus', () => {
  loadStaffList();
});
document.getElementById('staff-select')?.addEventListener('focus', () => {
  loadStaffList();
});

// Stop camera when leaving the page
window.addEventListener('beforeunload', () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
});
