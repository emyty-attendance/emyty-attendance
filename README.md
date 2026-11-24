# Company Attendance & Photo Verification System

A lightweight, zero-dependency, self-hosted daily attendance verification system designed for IT administrators to track daily staff arrivals with photo proof from staff smartphones or tablets.

---

## 🚀 Quick Start (Running the Server)

From the project directory:
```bash
ruby server.rb
```

Once running:
* **Staff Mobile Check-In:** `http://localhost:8080/`
* **IT Admin Portal:** `http://localhost:8080/admin.html`

### 📱 Connecting From Staff Smartphones
Because the server binds to `0.0.0.0`, any device on the same office Wi-Fi network can access the portal using your computer's local IP address:
```
http://<YOUR_LOCAL_IP>:8080/
```
*(Example: `http://192.168.1.50:8080/`)*

---

## 🔑 Default Credentials

### IT Administrator
* **Master Admin PIN:** `1234`
*(You can change this anytime under the **Company & Work Settings** tab in the admin portal).*
### Sample Staff Profiles (Pre-seeded)

Staff are seeded from `database.rb` on first start and are **never deleted or overwritten** on restart. Staff added via the admin portal persist across restarts.

| Staff ID | Name | Department | Check-In PIN | Expected Shift |
|---|---|---|---|---|
| `EMP001` | Mr Omovie John | General manager | `3333` | 09:00 AM |
| `EMP002` | Mr Okiemute ovie | IT | `1111` | 09:00 AM |
| `EMP003` | Mrs Mariam Ahmed | HR/PA | `2222` | 09:00 AM |
| `EMP004` | Mr Harisson | Accountant/Finance | `5555` | 09:00 AM |
| `EMP005` | Mrs Angela | Admin/Tendering | `4444` | 09:00 AM |
| `EMP006` | Mr Akpos | Operations manager | `7777` | 09:00 AM |
| `EMP007` | Mr Kelly | Safety/Hse | `8888` | 09:00 AM |

> **Note:** The live database may already contain staff you added via the admin portal (e.g. `EMP005` IT Administrator / `EMP006` omovie John). Those records are preserved and are not reset by the seed.

---

## 🛠 Features & Capabilities

1. **Staff Selfie Check-In (`/`):**
   * Uses device front camera (`facingMode: "user"`) to snap an instant photo upon clocking in.
   * Fallback file upload in case camera permissions are restricted.
   * PIN-based identification (prevents clocking in for peers without a PIN).
   * Enforces 1 check-in per staff member per day.
   * Automatic calculation of **"On Time"** vs **"Late"** based on scheduled shift + grace period.

2. **IT Admin Dashboard (`/admin.html`):**
   * **Daily Photo Roster:** Live visual feed of employees who have arrived, their photos, and timestamps.
   * **Absentee Tracker:** Instantly lists all active employees who haven't clocked in yet today.
   * **Staff Directory & PIN Manager:** Add, edit, or deactivate staff members, set expected shift hours, and reset PINs.
   * **Payroll CSV Export:** One-click CSV download of attendance logs for any selected date.
   * **Custom Settings:** Update company name, shift start times, grace period, and admin PIN.

3. **Data Storage & Backups:**
   * **SQLite Database:** `data/attendance.db` (single-file, robust, zero configuration).
   * **Captured Photos:** Saved under `public/uploads/YYYY-MM-DD/`.
   * **Backup:** Simply copy the `data/` and `public/uploads/` folders to backup the entire system.

---

## ☁️ Deploy on Render.com

This project is configured for Render via `render.yaml` (Ruby runtime, port 10000).

1. Push this folder to a GitHub repository.
2. In Render, create a **Web Service** and connect the repo.
3. Render auto-detects `render.yaml`:
   * Runtime: Ruby
   * Build: `bundle install`
   * Start: `ruby server.rb`
   * PORT: `10000`
4. Your sites go live at:
   * **Staff Clock-In:** `https://emyty-attendance.onrender.com/`
   * **IT Admin Portal:** `https://emyty-attendance.onrender.com/admin.html`

> ⚠️ Render uses an ephemeral filesystem, so SQLite data and uploaded photos will reset on each redeploy. For production, persist `data/attendance.db` and `public/uploads/` to a Render Disk or external storage.

**Company name** (`Emyty Staff Daily Attendance`) appears on both sites and can be changed anytime from the **Company & Work Settings** tab in the admin portal (default admin PIN: `1234`).
