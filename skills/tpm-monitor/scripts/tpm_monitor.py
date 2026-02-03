
import json
import os
import time
import re
from datetime import datetime, timedelta

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(SKILL_ROOT, 'config.json')
DATA_FILE = os.path.join(SKILL_ROOT, 'data.json')

# Default config with current active models
DEFAULT_CONFIG = {
    "models": {
        "google/gemini-3-flash-preview": {
            "threshold_tpm": 1500,
            "alert_message": "Gemini 3 Flash TPM is getting high!"
        },
        "google/gemini-2.5-flash": {
            "threshold_tpm": 1000,
            "alert_message": "Gemini 2.5 Flash TPM limit approaching."
        },
        "anthropic/claude-3-5-sonnet-20241022": {
            "threshold_tpm": 1000,
            "alert_message": "Claude 3.5 Sonnet usage peak."
        }
    },
    "alert_interval_seconds": 60,
    "monitoring_window_minutes": 1,
    "transcript_path": "C:\\Users\\bbaxt\\.clawdbot\\agents\\main\\sessions\\7c697c3b-7e68-4a16-b235-4f7248ee9294.jsonl"
}

token_data = {} # In-memory storage for current session
last_alert_time = {} # To prevent spamming alerts

def load_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=4)
        return DEFAULT_CONFIG
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def load_data():
    global token_data
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                loaded_data = json.load(f)
                for model, entries in loaded_data.items():
                    token_data[model] = [{'timestamp': datetime.fromisoformat(entry['timestamp']), 'tokens': entry['tokens']} for entry in entries]
        except Exception:
            token_data = {}
    return token_data

def save_data():
    serializable_data = {}
    for model, entries in token_data.items():
        # Keep only the last 2 hours of data to keep data.json small
        cutoff = datetime.now() - timedelta(hours=2)
        filtered_entries = [e for e in entries if e['timestamp'] >= cutoff]
        serializable_data[model] = [{'timestamp': entry['timestamp'].isoformat(), 'tokens': entry['tokens']} for entry in filtered_entries]
    
    with open(DATA_FILE, 'w') as f:
        json.dump(serializable_data, f, indent=4)

def record_tokens(model_name: str, token_count: int, timestamp=None):
    if timestamp is None:
        timestamp = datetime.now()
    if model_name not in token_data:
        token_data[model_name] = []
    
    # Avoid duplicate entries by checking timestamp and token count
    # (Basic check: if there's an entry with same timestamp and count, skip)
    for entry in token_data[model_name]:
        if entry['timestamp'] == timestamp and entry['tokens'] == token_count:
            return

    token_data[model_name].append({'timestamp': timestamp, 'tokens': token_count})
    save_data()

def sync_from_transcript():
    config = load_config()
    transcript_path = config.get('transcript_path')
    if not transcript_path or not os.path.exists(transcript_path):
        return

    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if data.get('type') == 'message' and 'message' in data:
                        msg = data['message']
                        if 'usage' in msg and 'model' in msg:
                            model = msg['model']
                            usage = msg['usage']
                            # Some models use different usage structures
                            tokens = usage.get('totalTokens', usage.get('total', 0))
                            
                            # Use timestamp from the event
                            ts_str = data.get('timestamp')
                            if ts_str:
                                # JSONL timestamps are often ISO or ms
                                if isinstance(ts_str, int):
                                    ts = datetime.fromtimestamp(ts_str / 1000.0)
                                else:
                                    ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                                
                                record_tokens(model, tokens, ts)
                except Exception:
                    continue
    except Exception as e:
        print(f"Error syncing transcript: {e}")

def get_tpm(model_name: str, window_minutes: int) -> float:
    sync_from_transcript() # Update data before calculating
    if model_name not in token_data:
        return 0.0

    now = datetime.now()
    time_window_start = now - timedelta(minutes=window_minutes)

    total_tokens = 0
    for entry in token_data[model_name]:
        if entry['timestamp'] >= time_window_start:
            total_tokens += entry['tokens']
    
    elapsed_seconds = window_minutes * 60
    return (total_tokens / elapsed_seconds) * 60

def get_all_tpm() -> dict:
    config = load_config()
    all_tpm = {}
    
    # First, make sure we have data from all models in token_data
    sync_from_transcript()
    
    # Use models from config + any models found in data
    models_to_check = set(config['models'].keys()) | set(token_data.keys())
    
    for model_name in models_to_check:
        tpm = get_tpm(model_name, config['monitoring_window_minutes'])
        if tpm > 0 or model_name in config['models']:
            all_tpm[model_name] = round(tpm, 2)
    return all_tpm

def check_and_alert():
    config = load_config()
    all_tpm = get_all_tpm()
    current_time = time.time()
    alerts = []

    for model_name, current_tpm in all_tpm.items():
        model_config = config['models'].get(model_name)
        if not model_config: continue
        
        threshold = model_config.get('threshold_tpm')
        if threshold and current_tpm >= threshold:
            if model_name not in last_alert_time or (current_time - last_alert_time[model_name]) >= config['alert_interval_seconds']:
                alert_msg = f"TPM Alert: {model_name} is at {current_tpm:.0f} TPM (Limit: {threshold})"
                alerts.append(alert_msg)
                last_alert_time[model_name] = current_time
    
    return alerts

# Initialize
load_data()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["record", "get_all_tpm", "check_alerts", "sync"])
    parser.add_argument("--model_name")
    parser.add_argument("--token_count", type=int)

    args = parser.parse_args()

    if args.action == "record":
        record_tokens(args.model_name, args.token_count)
    elif args.action == "get_all_tpm":
        print(json.dumps(get_all_tpm()))
    elif args.action == "check_alerts":
        alerts = check_and_alert()
        if alerts:
            # Output in a format that the main agent can easily parse if needed
            print(json.dumps({"alerts": alerts}))
        else:
            print(json.dumps({"alerts": []}))
    elif args.action == "sync":
        sync_from_transcript()
        print("Transcript sync complete.")
