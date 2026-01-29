#!/usr/bin/env bash
set -euo pipefail

while true; do
  echo "Select an action:"
  echo "1) Run match demo"
  echo "2) Run tournament demo"
  echo "3) Read match state (uses last_match_pda.txt if empty)"
  echo "4) Verify prompt_hash + receipt_root (uses last_match_pda.txt if empty)"
  echo "5) Check champion balance (devnet) (uses last_champion_pubkey.txt if empty)"
  echo "q) Quit"
  read -r -p "> " choice

  case "$choice" in
    1)
      yarn ts-node scripts/match_demo.ts
      ;;
    2)
      yarn ts-node scripts/tournament_demo.ts
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
      yarn ts-node scripts/read_match.ts "$pda"
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
      yarn ts-node scripts/verify_match_receipt.ts "$pda"
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
      solana balance "$pubkey" --url https://api.devnet.solana.com
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
