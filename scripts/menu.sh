#!/usr/bin/env bash
set -euo pipefail

while true; do
  echo "Select an action:"
  echo "0) Install dependencies (apt + yarn)"
  echo "1) Run match demo"
  echo "2) Run tournament demo"
  echo "3) Read match state (uses last_match_pda.txt if empty)"
  echo "4) Verify prompt_hash + receipt_root (uses last_match_pda.txt if empty)"
  echo "5) Check champion balance (testnet) (uses last_champion_pubkey.txt if empty)"
  echo "6) Build + deploy (after .env is set)"
  echo "7) Run tests (anchor test)"
  echo "8) Confirm match verdict (uses last_match_pda.txt if empty)"
  echo "q) Quit"
  read -r -p "> " choice

  case "$choice" in
    0)
      sudo apt update
      sudo apt install -y curl build-essential pkg-config libssl-dev
      if command -v corepack >/dev/null 2>&1; then
        corepack enable
      fi
      if [[ ! -f .env && -f .env.example ]]; then
        cp .env.example .env
        echo "Created .env from .env.example"
      fi
      yarn install
      ;;
    1)
      yarn ts-node scripts/match/demo.ts
      ;;
    2)
      yarn ts-node scripts/match/tournament_demo.ts
      ;;
    3)
      read -r -p "Match PDA (enter for last): " pda
      if [[ -z "$pda" && -f last_match_pda.txt ]]; then
        pda="$(tr -d '[:space:]' < last_match_pda.txt)"
        echo "Using last_match_pda.txt: $pda"
      elif [[ -z "$pda" ]]; then
        echo "last_match_pda.txt not found. Paste a Match PDA or create the file."
        continue
      fi
      if [[ -z "$pda" || ${#pda} -lt 32 ]]; then
        echo "Invalid pubkey"
        continue
      fi
      read -r -p "Short output? [y/N]: " short
      if [[ "$short" == "y" || "$short" == "Y" ]]; then
        yarn ts-node scripts/match/read_match.ts "$pda" --short
      else
        yarn ts-node scripts/match/read_match.ts "$pda"
      fi
      ;;
    4)
      read -r -p "Match PDA (enter for last): " pda
      if [[ -z "$pda" && -f last_match_pda.txt ]]; then
        pda="$(tr -d '[:space:]' < last_match_pda.txt)"
        echo "Using last_match_pda.txt: $pda"
      elif [[ -z "$pda" ]]; then
        echo "last_match_pda.txt not found. Paste a Match PDA or create the file."
        continue
      fi
      if [[ -z "$pda" || ${#pda} -lt 32 ]]; then
        echo "Invalid pubkey"
        continue
      fi
      yarn ts-node scripts/match/verify_match_receipt.ts "$pda"
      ;;
    5)
      read -r -p "Champion pubkey (enter for last): " pubkey
      if [[ -z "$pubkey" && -f last_champion_pubkey.txt ]]; then
        pubkey="$(tr -d '[:space:]' < last_champion_pubkey.txt)"
        echo "Using last_champion_pubkey.txt: $pubkey"
      elif [[ -z "$pubkey" ]]; then
        echo "last_champion_pubkey.txt not found. Paste a pubkey or create the file."
        continue
      fi
      if [[ -z "$pubkey" || ${#pubkey} -lt 32 ]]; then
        echo "Invalid pubkey"
        continue
      fi
      solana balance "$pubkey" --url https://api.testnet.solana.com
      ;;
    6)
      anchor build
      anchor deploy --no-idl
      ;;
    7)
      anchor test
      ;;
    8)
      read -r -p "Match PDA (enter for last): " pda
      if [[ -z "$pda" && -f last_match_pda.txt ]]; then
        pda="$(tr -d '[:space:]' < last_match_pda.txt)"
        echo "Using last_match_pda.txt: $pda"
      elif [[ -z "$pda" ]]; then
        echo "last_match_pda.txt not found. Paste a Match PDA or create the file."
        continue
      fi
      if [[ -z "$pda" || ${#pda} -lt 32 ]]; then
        echo "Invalid pubkey"
        continue
      fi
      read -r -p "Human verdict [A|B|Tie] (enter to accept AI recommendation): " verdict
      if [[ -z "$verdict" ]]; then
        yarn ts-node scripts/match/confirm_match.ts "$pda"
      else
        yarn ts-node scripts/match/confirm_match.ts "$pda" "$verdict"
      fi
      ;;
    q)
      exit 0
      ;;
    *)
      echo "Unknown option"
      exit 1
      ;;
  esac
done
