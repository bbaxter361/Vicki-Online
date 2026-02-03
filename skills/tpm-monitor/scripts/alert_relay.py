
import subprocess
import json
import os

# Path to the tpm_monitor.py script
MONITOR_SCRIPT = r"C:\Users\bbaxt\clawd\skills\tpm-monitor\scripts\tpm_monitor.py"
SKILL_ROOT = r"C:\Users\bbaxt\clawd\skills\tpm-monitor"

def run_check():
    try:
        # Run the check_alerts action
        env = os.environ.copy()
        env["PYTHONPATH"] = SKILL_ROOT
        result = subprocess.run(
            ["python", MONITOR_SCRIPT, "check_alerts"],
            capture_output=True,
            text=True,
            env=env
        )
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            alerts = data.get("alerts", [])
            if alerts:
                for alert in alerts:
                    # Send Signal message via Clawdbot CLI or similar
                    # Since I don't have direct tool access in a standalone script,
                    # I will print it as a system event trigger.
                    print(f"TPM_ALERT_TRIGGERED: {alert}")
    except Exception as e:
        print(f"Error in alert relay: {e}")

if __name__ == "__main__":
    run_check()
