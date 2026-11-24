#!/bin/bash
# Emyty Staff Daily Attendance - Stop Script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -f server.pid ]; then
  kill $(cat server.pid) 2>/dev/null
  rm server.pid
fi

if [ -f ngrok.pid ]; then
  kill $(cat ngrok.pid) 2>/dev/null
  rm ngrok.pid
fi

pkill -f "ruby server.rb" 2>/dev/null
pkill -f "ngrok http" 2>/dev/null

echo "Attendance server and ngrok tunnel stopped."
