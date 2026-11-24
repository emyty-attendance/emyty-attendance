require 'sqlite3'
require 'fileutils'
require 'digest'
require 'json'

FileUtils.mkdir_p(File.join(__dir__, 'data'))
FileUtils.mkdir_p(File.join(__dir__, 'public', 'uploads'))

DB_PATH = File.join(__dir__, 'data', 'attendance.db')

def init_db
  db = SQLite3::Database.new(DB_PATH)
  db.results_as_hash = true

  # Use WAL mode for better concurrent read/write safety
  db.execute("PRAGMA journal_mode=WAL")

  # 1. Staff table
  db.execute <<-SQL
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT DEFAULT 'General',
      pin TEXT NOT NULL,
      expected_time TEXT DEFAULT '09:00',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  SQL

  # 2. Attendance table
  db.execute <<-SQL
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      status TEXT NOT NULL, -- 'on_time', 'late'
      photo_url TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(staff_id) REFERENCES staff(id),
      UNIQUE(staff_id, date)
    );
  SQL

  # 3. Settings table
  db.execute <<-SQL
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  SQL

  # Default settings (seed only — never overwrite existing user-configured values)
  default_settings = {
    'company_name' => 'Emyty Staff Daily Attendance',
    'work_start_time' => '09:00',
    'grace_period_mins' => '10',
    'admin_pin' => '1234',
    'require_photo' => 'true'
  }

  default_settings.each do |k, v|
    existing = db.get_first_value("SELECT value FROM settings WHERE key = ?", [k])
    next if existing

    db.execute("INSERT INTO settings (key, value) VALUES (?, ?)", [k, v])
  end

  # Official Emyty Staff Roster (seed only — never delete or overwrite existing staff)
  official_staff = [
    ['EMP001', 'Mr Omovie John', 'General manager', '3333', '09:00'],
    ['EMP002', 'Mr Okiemute ovie', 'IT', '1111', '09:00'],
    ['EMP003', 'Mrs Mariam Ahmed', 'HR/PA', '2222', '09:00'],
    ['EMP004', 'Mr Harisson', 'Accountant/Finance', '5555', '09:00'],
    ['EMP005', 'Mrs Angela', 'Admin/Tendering', '4444', '09:00'],
    ['EMP006', 'Mr Akpos', 'Operations manager', '7777', '09:00'],
    ['EMP007', 'Mr Kelly', 'Safety/Hse', '8888', '09:00']
  ]

  # Insert each official staff member only if it does not already exist.
  # Existing staff added/edited via the admin portal are never touched.
  official_staff.each do |code, name, dept, pin, exp|
    existing = db.get_first_row("SELECT id FROM staff WHERE code = ?", [code])
    next if existing

    db.execute(
      "INSERT INTO staff (code, name, department, pin, expected_time, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [code, name, dept, pin, exp]
    )
  end

  db
end

if __FILE__ == $0
  init_db
  puts "Database initialized with official Emyty staff at #{DB_PATH}"
end
