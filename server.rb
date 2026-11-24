require 'webrick'
require 'json'
require 'date'
require 'fileutils'
require_relative 'database'

# Patch WEBrick to avoid macOS sandbox 'sendfile' syscall restriction
module WEBrick
  class HTTPResponse
    def send_body_io(socket)
      begin
        while (chunk = @body.read(65536))
          socket.write(chunk)
        end
      rescue Errno::EPIPE, Errno::ECONNRESET
        # Client closed connection early
      ensure
        @body.close if @body.respond_to?(:close)
      end
    end
  end
end

  class AttendanceServer
    PORT = (ENV['PORT'] || 8080).to_i

    # CSV field escaping: quote fields containing comma, quote, or newline
    def self.csv_escape(val)
      s = val.to_s
      if s.include?(',') || s.include?('"') || s.include?("\n") || s.include?("\r")
        '"' + s.gsub('"', '""') + '"'
      else
        s
      end
    end

  def self.start
    db = init_db
    public_dir = File.expand_path(File.join(__dir__, 'public'))
    FileUtils.mkdir_p(File.join(public_dir, 'uploads'))

    server = WEBrick::HTTPServer.new(
      Port: PORT,
      DocumentRoot: public_dir,
      BindAddress: '0.0.0.0', # Allows local network access so staff can test from phones on Wi-Fi
      AccessLog: [],          # Reduce clutter; we can add logging if needed
      Logger: WEBrick::Log.new($stderr, WEBrick::Log::INFO)
    )

    # API Dispatcher Servlet
    server.mount_proc '/api' do |req, res|
      handle_api(req, res, db, public_dir)
    end

    # Trap exit signals to gracefully close
    trap('INT')  { server.shutdown }
    trap('TERM') { server.shutdown }

    puts "======================================================="
    puts " Attendance System running at: http://localhost:#{PORT}"
    puts " Staff Clock-In URL:         http://localhost:#{PORT}/"
    puts " IT Admin Dashboard:         http://localhost:#{PORT}/admin.html"
    puts "======================================================="

    server.start
  end

  def self.handle_api(req, res, db, public_dir)
    res['Content-Type'] = 'application/json'
    res['Access-Control-Allow-Origin'] = '*'
    res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    res['Access-Control-Allow-Headers'] = 'Content-Type, X-Admin-Pin'

    if req.request_method == 'OPTIONS'
      res.status = 200
      res.body = ''
      return
    end

    path = req.path.sub(%r{^/api/?}, '').chomp('/')

    begin
      case [req.request_method, path]
      # --- Public / Staff Endpoints ---
      when ['GET', 'staff/list']
        # Active staff list for selection dropdown (never expose PINs here)
        rows = db.execute("SELECT id, code, name, department FROM staff WHERE is_active = 1 ORDER BY name ASC")
        res.body = rows.to_json

      when ['POST', 'checkin']
        payload = JSON.parse(req.body)
        staff_id = payload['staff_id'].to_i
        pin = payload['pin'].to_s.strip
        photo_data = payload['photo_base64']
        notes = payload['notes'].to_s.strip

        staff = db.get_first_row("SELECT * FROM staff WHERE id = ? AND is_active = 1", [staff_id])
        unless staff
          res.status = 404
          res.body = { error: 'Staff member not found or inactive' }.to_json
          return
        end

        # Verify PIN
        if staff['pin'] != pin
          res.status = 401
          res.body = { error: 'Incorrect PIN code. Please try again.' }.to_json
          return
        end

        today_date = Date.today.strftime('%Y-%m-%d')
        now_time = Time.now.strftime('%H:%M:%S')

        # Check for existing check-in today
        existing = db.get_first_row(
          "SELECT id, check_in_time, status FROM attendance WHERE staff_id = ? AND date = ?",
          [staff_id, today_date]
        )
        if existing
          res.status = 409
          res.body = {
            error: "Already checked in today at #{existing['check_in_time']}",
            check_in_time: existing['check_in_time'],
            status: existing['status']
          }.to_json
          return
        end

        # Process Photo
        photo_url = ''
        if photo_data && photo_data.start_with?('data:image')
          header, base64_str = photo_data.split(',', 2)
          ext = header.include?('png') ? 'png' : 'jpg'

          date_folder = File.join(public_dir, 'uploads', today_date)
          FileUtils.mkdir_p(date_folder)

          filename = "#{staff['code']}_#{Time.now.strftime('%H%M%S')}.#{ext}"
          filepath = File.join(date_folder, filename)

          File.open(filepath, 'wb') do |f|
            f.write(base64_str.unpack1('m'))
          end
          photo_url = "/uploads/#{today_date}/#{filename}"
        else
          # Fallback avatar or placeholder if photo wasn't sent
          photo_url = "/uploads/placeholder.png"
        end

        # Calculate Status: On Time vs Late
        expected_str = staff['expected_time'] || db.get_first_value("SELECT value FROM settings WHERE key = 'work_start_time'") || '09:00'
        grace_val = db.get_first_value("SELECT value FROM settings WHERE key = 'grace_period_mins'")
        grace_mins = grace_val ? grace_val.to_i : 10

        exp_hour, exp_min = expected_str.split(':').map(&:to_i)
        expected_seconds = (exp_hour * 3600) + (exp_min * 60)
        cutoff_seconds = expected_seconds + (grace_mins * 60)
        curr_seconds = (Time.now.hour * 3600) + (Time.now.min * 60) + Time.now.sec

        status = curr_seconds <= cutoff_seconds ? 'on_time' : 'late'
        diff_mins = status == 'late' ? ((curr_seconds - expected_seconds) / 60.0).round : 0

        # Save to database
        db.execute(
          "INSERT INTO attendance (staff_id, date, check_in_time, status, photo_url, notes) VALUES (?, ?, ?, ?, ?, ?)",
          [staff_id, today_date, now_time, status, photo_url, notes]
        )

        res.body = {
          success: true,
          message: "Clock-in successful!",
          staff_name: staff['name'],
          date: today_date,
          check_in_time: now_time,
          status: status,
          diff_mins: diff_mins,
          photo_url: photo_url
        }.to_json

      # --- Live Attendance Endpoints ---
      when ['GET', 'attendance/today']
        today_date = Date.today.strftime('%Y-%m-%d')
        return_attendance_for_date(res, db, today_date)

      when ['GET', 'attendance/by_date']
        raw_date = req.query['date']
        query_date = if raw_date && !raw_date.to_s.empty?
          raw_date.to_s.dup.force_encoding('UTF-8')
        else
          Date.today.strftime('%Y-%m-%d')
        end
        return_attendance_for_date(res, db, query_date)

      when ['GET', 'attendance/export']
        # Export CSV
        res['Content-Type'] = 'text/csv'
        res['Content-Disposition'] = "attachment; filename=\"attendance_#{Date.today}.csv\""

        start_date = (req.query['start_date'] || Date.today.strftime('%Y-%m-%d')).to_s.dup.force_encoding('UTF-8')
        end_date = (req.query['end_date'] || Date.today.strftime('%Y-%m-%d')).to_s.dup.force_encoding('UTF-8')

        records = db.execute <<-SQL, [start_date, end_date]
          SELECT a.date, a.check_in_time, a.status, a.photo_url, a.notes,
                 s.code, s.name, s.department, s.expected_time
          FROM attendance a
          JOIN staff s ON a.staff_id = s.id
          WHERE a.date BETWEEN ? AND ?
          ORDER BY a.date DESC, a.check_in_time DESC
        SQL

        csv_lines = [ ['Date', 'Time', 'Staff Code', 'Staff Name', 'Department', 'Expected Time', 'Status', 'Photo URL', 'Notes'].map { |f| csv_escape(f) }.join(',') ]
        records.each do |r|
          csv_lines << [
            csv_escape(r['date']), csv_escape(r['check_in_time']), csv_escape(r['code']),
            csv_escape(r['name']), csv_escape(r['department']), csv_escape(r['expected_time']),
            csv_escape(r['status']), csv_escape(r['photo_url']), csv_escape(r['notes'])
          ].join(',')
        end
        res.body = csv_lines.join("\n")

      # --- Admin Operations (PIN Protected) ---
      when ['POST', 'admin/verify']
        payload = JSON.parse(req.body) rescue {}
        input_pin = payload['admin_pin'].to_s.strip
        stored_pin = db.get_first_value("SELECT value FROM settings WHERE key = 'admin_pin'") || '1234'

        if input_pin == stored_pin
          res.body = { success: true, token: 'auth_ok' }.to_json
        else
          res.status = 401
          res.body = { error: 'Invalid Admin PIN' }.to_json
        end

      when ['GET', 'admin/staff']
        verify_admin!(req, db)
        staff_list = db.execute("SELECT id, code, name, department, pin, expected_time, is_active, created_at FROM staff ORDER BY id ASC")
        res.body = staff_list.to_json

      when ['POST', 'admin/staff/add']
        verify_admin!(req, db)
        p = JSON.parse(req.body)
        code = p['code'].to_s.strip.upcase
        name = p['name'].to_s.strip
        dept = p['department'].to_s.strip
        pin = p['pin'].to_s.strip
        expected = p['expected_time'].to_s.strip
        expected = '09:00' if expected.empty?

        if code.empty? || name.empty? || pin.empty?
          res.status = 400
          res.body = { error: 'Code, Name, and PIN are required' }.to_json
          return
        end

        db.execute(
          "INSERT INTO staff (code, name, department, pin, expected_time) VALUES (?, ?, ?, ?, ?)",
          [code, name, dept, pin, expected]
        )
        res.body = { success: true, message: "Staff member added successfully" }.to_json

      when ['POST', 'admin/staff/update']
        verify_admin!(req, db)
        p = JSON.parse(req.body)
        id = p['id'].to_i
        name = p['name'].to_s.strip
        dept = p['department'].to_s.strip
        pin = p['pin'].to_s.strip
        expected = p['expected_time'].to_s.strip
        is_active = p['is_active'] ? 1 : 0

        db.execute <<-SQL, [name, dept, pin, expected, is_active, id]
          UPDATE staff
          SET name = ?, department = ?, pin = ?, expected_time = ?, is_active = ?
          WHERE id = ?
        SQL
        res.body = { success: true, message: "Staff updated" }.to_json

      when ['POST', 'admin/staff/delete']
        verify_admin!(req, db)
        p = JSON.parse(req.body)
        id = p['id'].to_i

        # Remove staff and clean up their attendance logs
        db.execute("DELETE FROM attendance WHERE staff_id = ?", [id])
        db.execute("DELETE FROM staff WHERE id = ?", [id])
        res.body = { success: true, message: "Staff member permanently removed" }.to_json

      when ['GET', 'admin/settings']
        verify_admin!(req, db)
        settings = {}
        db.execute("SELECT key, value FROM settings").each do |row|
          settings[row['key']] = row['value']
        end
        # Don't return raw admin_pin unless verified
        res.body = settings.to_json

      when ['POST', 'admin/settings']
        verify_admin!(req, db)
        p = JSON.parse(req.body)
        p.each do |k, v|
          db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [k, v.to_s])
        end
        res.body = { success: true, message: "Settings saved" }.to_json

      else
        res.status = 404
        res.body = { error: "Endpoint not found: #{req.request_method} #{path}" }.to_json
      end

    rescue AdminAuthError => e
      res.status = 401
      res.body = { error: e.message }.to_json
    rescue => e
      res.status = 500
      res.body = { error: e.message, backtrace: e.backtrace.first(3) }.to_json
    end
  end

  class AdminAuthError < StandardError; end

  def self.verify_admin!(req, db)
    raw_pin = req.header['x-admin-pin']&.first || req.query['admin_pin']
    pin = raw_pin.to_s.dup.force_encoding('UTF-8')
    stored_pin = db.get_first_value("SELECT value FROM settings WHERE key = 'admin_pin'") || '1234'
    raise AdminAuthError, "Unauthorized admin access: Invalid PIN" if pin != stored_pin
  end

  def self.return_attendance_for_date(res, db, date_str)
    # 1. Checked-in staff
    attended = db.execute <<-SQL, [date_str]
      SELECT a.id, a.staff_id, a.date, a.check_in_time, a.status, a.photo_url, a.notes,
             s.code, s.name, s.department, s.expected_time
      FROM attendance a
      JOIN staff s ON a.staff_id = s.id
      WHERE a.date = ?
      ORDER BY a.check_in_time DESC
    SQL

    # 2. Active staff not yet checked in
    attended_ids = attended.map { |r| r['staff_id'] }
    all_active = db.execute("SELECT id, code, name, department, expected_time FROM staff WHERE is_active = 1 ORDER BY name ASC")
    absent = all_active.reject { |s| attended_ids.include?(s['id']) }

    # Stats
    total_active = all_active.size
    checked_in_count = attended.size
    on_time_count = attended.count { |r| r['status'] == 'on_time' }
    late_count = attended.count { |r| r['status'] == 'late' }
    absent_count = absent.size

    company_name = db.get_first_value("SELECT value FROM settings WHERE key = 'company_name'") || 'Company'

    res.body = {
      date: date_str,
      company_name: company_name,
      stats: {
        total_staff: total_active,
        checked_in: checked_in_count,
        on_time: on_time_count,
        late: late_count,
        absent: absent_count
      },
      attended: attended,
      absent: absent
    }.to_json
  end
end

if __FILE__ == $0
  AttendanceServer.start
end
