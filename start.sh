#!/bin/bash
# Emyty Staff Daily Attendance - Start Script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Starting Attendance Server..."
ruby server.rb &
SERVER_PID=$!
echo $SERVER_PID > server.pid

echo "Starting ngrok tunnel (https://predator-untying-curler.ngrok-free.dev)..."
./ngrok http 8080 --url=https://predator-untying-curler.ngrok-free.dev --config=./ngrok.yml --log=stdout > ngrok.log 2>&1 &
NGROK_PID=$!
echo $NGROK_PID > ngrok.pid

echo "=========================================================="
echo " Emyty Attendance is RUNNING!"
echo " Public URL:  https://predator-untying-curler.ngrok-free.dev/"
echo " Admin URL:   https://predator-untying-curler.ngrok-free.dev/admin.html"
echo " Local URL:   http://localhost:8080/"
echo ""
echo " Render.com deploy:  https://emyty-attendance.onrender.com/  (after you push this repo to Render)"
echo " Render Admin:       https://emyty-attendance.onrender.com/admin.html"
echo "=========================================================="
