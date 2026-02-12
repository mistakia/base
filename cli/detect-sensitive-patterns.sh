#!/bin/bash
# Detect sensitive patterns in files (PII, secrets, credentials)

# Process each file passed as argument or from stdin
if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  # Compatible alternative to mapfile for older bash versions
  FILES=()
  while IFS= read -r line; do
    FILES+=("$line")
  done
fi

for FILE in "${FILES[@]}"; do
  if [ ! -f "$FILE" ]; then
    continue
  fi
  
  # IP Address patterns (IPv4)
  grep -nE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:IP_ADDRESS"
  done
  
  # Email patterns
  grep -niE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:EMAIL"
  done
  
  # Phone number patterns (US format)
  grep -nE '\b(\+?1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:PHONE"
  done
  
  # Social Security Number patterns
  grep -nE '\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:SSN"
  done
  
  # API Key patterns (common formats)
  grep -niE '(api[_-]?key|apikey|api_secret|access[_-]?token)[[:space:]]*[=:][[:space:]]*["\047]?[A-Za-z0-9_\-]{20,}["\047]?' "$FILE" | while read -r line; do
    echo "$FILE:$line:API_KEY"
  done
  
  # AWS Key patterns
  grep -nE 'AKIA[0-9A-Z]{16}' "$FILE" | while read -r line; do
    echo "$FILE:$line:AWS_ACCESS_KEY"
  done
  
  # Private key headers
  grep -n 'BEGIN.*PRIVATE KEY' "$FILE" | while read -r line; do
    echo "$FILE:$line:PRIVATE_KEY"
  done
  
  # Password patterns in configs/code
  grep -niE '(password|passwd|pwd|pass)[[:space:]]*[=:][[:space:]]*["\047]?[^"\047\n]{4,}["\047]?' "$FILE" | while read -r line; do
    echo "$FILE:$line:PASSWORD"
  done
  
  # Database connection strings
  grep -niE '(mongodb|postgres|postgresql|mysql|redis|mssql|oracle):\/\/[^[:space:]]+' "$FILE" | while read -r line; do
    echo "$FILE:$line:DB_CONNECTION"
  done
  
  # JWT tokens
  grep -nE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "$FILE" | while read -r line; do
    echo "$FILE:$line:JWT_TOKEN"
  done
  
  # GitHub/GitLab tokens
  grep -niE '(gh[ps]_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9\-]{20})' "$FILE" | while read -r line; do
    echo "$FILE:$line:GIT_TOKEN"
  done
  
  # Credit card patterns (basic)
  grep -nE '\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:CREDIT_CARD"
  done
  
  # Personal names from known list (from guideline)
  grep -niE '\b(kia|rahimian|erin|sutliff|arrin|kia2882|tintmail\.com|t3rr0r|tintmail)\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:PERSONAL_NAME"
  done
  
  # Physical addresses (basic pattern for street addresses)
  grep -niE '\b[0-9]{1,5}\s+[A-Za-z\s]{2,30}(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl)\b' "$FILE" | while read -r line; do
    echo "$FILE:$line:PHYSICAL_ADDRESS"
  done
  
  # Encrypted placeholder pattern
  grep -n 'ENCRYPTED|' "$FILE" | while read -r line; do
    echo "$FILE:$line:ENCRYPTED_VALUE"
  done
done | sort -u  # Remove duplicates