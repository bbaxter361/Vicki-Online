# TPM Monitor Skill

This skill provides real-time monitoring of Tokens Per Minute (TPM) for configured LLM models, along with a dashboard and an alerting system.

## Features

*   **Real-time TPM Tracking:** Monitors token usage for each configured LLM model.
*   **Dashboard UI:** Displays current TPM and historical trends via a Canvas UI.
*   **Configurable Alerts:** Triggers proactive alerts when TPM usage approaches or exceeds defined thresholds.

## Installation

1.  Place this `tpm-monitor` directory into your Clawdbot skills folder (e.g., `C:\Users\bbaxt\clawd\skills\`).
2.  (Optional) Configure model names and thresholds in `config.json` (will be created on first run or can be manually created).

## Usage

Once installed, the skill will start monitoring. You can access the dashboard by running:

```bash
/canvas present --url clawdbot://skill/tpm-monitor/references/dashboard.html
```

To simulate LLM calls and generate token usage data, you can use the `exec` tool to call the skill's internal functions:

```bash
/exec skill tpm-monitor simulate_llm_call --model_name "gemini-pro" --prompt "Hello world"
```

The skill will automatically send alerts to your main session if TPM thresholds are exceeded.

## Configuration

The skill uses a `config.json` file for configuration. An example `config.json` might look like this:

```json
{
    "models": {
        "gemini-pro": {
            "threshold_tpm": 1000,
            "alert_message": "Gemini Pro TPM is high!"
        },
        "claude-3-opus": {
            "threshold_tpm": 1500,
            "alert_message": "Claude 3 Opus TPM nearing limit!"
        }
    },
    "alert_interval_seconds": 60,
    "monitoring_window_minutes": 1
}
```

*   `models`: A dictionary where keys are model names.
    *   `threshold_tpm`: The TPM value at which an alert will be triggered for this model.
    *   `alert_message`: The custom message to include in the alert.
*   `alert_interval_seconds`: How often (in seconds) the skill checks for threshold breaches and sends alerts.
*   `monitoring_window_minutes`: The time window (in minutes) over which TPM is calculated.
