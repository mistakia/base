#!/usr/bin/env bash
#
# Job wrapper for external cron commands
# Reports execution results to the job tracker API
#
# Usage: job-wrapper.sh <job_id> <command> [args...]
#
# Environment variables:
#   JOB_API_URL       - Job tracker API endpoint (required)
#   JOB_API_KEY       - API key for authentication (required)
#   JOB_PROJECT       - Project name (optional)
#   JOB_SCHEDULE      - Cron expression or interval (optional)
#   JOB_SCHEDULE_TYPE - Schedule type: expr or every (optional)
#
# The wrapper exits with the original command's exit code.
# Reporting failures are silent and never affect the wrapped command.

set -o pipefail

job_id="$1"
shift

if [ -z "$job_id" ] || [ $# -eq 0 ]; then
  echo "Usage: job-wrapper.sh <job_id> <command> [args...]" >&2
  exit 1
fi

if [ -z "$JOB_API_URL" ] || [ -z "$JOB_API_KEY" ]; then
  # Run command without reporting if API not configured
  exec "$@"
fi

# Capture start time in milliseconds
start_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')

# Execute the command, capturing stderr
stderr_file=$(mktemp)
"$@" 2> >(tee "$stderr_file" >&2)
exit_code=$?

# Calculate duration
end_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
duration_ms=$((end_ms - start_ms))

# Determine success
if [ "$exit_code" -eq 0 ]; then
  success=true
  reason=null
else
  success=false
  # Capture last 500 chars of stderr
  stderr_content=$(tail -c 500 "$stderr_file" 2>/dev/null || echo "")
  # Escape for JSON
  reason=$(printf '%s' "$stderr_content" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')
fi
rm -f "$stderr_file"

# Build JSON payload
json_body="{\"job_id\":\"${job_id}\",\"success\":${success},\"duration_ms\":${duration_ms},\"exit_code\":${exit_code}"

if [ "$reason" != "null" ]; then
  json_body="${json_body},\"reason\":${reason}"
fi

if [ -n "$JOB_PROJECT" ]; then
  json_body="${json_body},\"project\":\"${JOB_PROJECT}\""
fi

json_body="${json_body},\"server\":\"$(hostname)\""

if [ -n "$JOB_SCHEDULE" ]; then
  json_body="${json_body},\"schedule\":\"${JOB_SCHEDULE}\""
fi

if [ -n "$JOB_SCHEDULE_TYPE" ]; then
  json_body="${json_body},\"schedule_type\":\"${JOB_SCHEDULE_TYPE}\""
fi

json_body="${json_body}}"

# Report to API (fire-and-forget, 10s timeout)
curl -s -S --max-time 10 \
  -X POST "${JOB_API_URL}/api/jobs/report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JOB_API_KEY}" \
  -d "$json_body" \
  >/dev/null 2>&1 || true

exit "$exit_code"
