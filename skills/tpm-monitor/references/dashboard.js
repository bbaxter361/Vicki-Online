document.addEventListener('DOMContentLoaded', () => {
    const tpmDataContainer = document.getElementById('tpm-data');
    const config = {}; 
    const skillPath = 'C:/Users/bbaxt/clawd/skills/tpm-monitor';

    function getPythonCommand(cmd) {
        // Use full path to python if needed, and set PYTHONPATH to include the skill scripts
        return `set PYTHONPATH=${skillPath}&& python -c "import sys; sys.path.append('${skillPath}'); ${cmd}"`;
    }

    async function fetchConfig() {
        try {
            const response = await clawdbot.exec({
                command: getPythonCommand('import json; from scripts.tpm_monitor import load_config; print(json.dumps(load_config()))'),
                pty: false,
            });
            const configOutput = JSON.parse(response.output);
            Object.assign(config, configOutput);
            console.log("Loaded config:", config);
        } catch (error) {
            console.error("Error fetching config:", error);
            tpmDataContainer.innerHTML = '<p class="loading-text" style="color: #ef4444;">Error loading configuration.</p>';
        }
    }

    async function fetchAndRenderTpm() {
        if (Object.keys(config).length === 0) {
            await fetchConfig();
        }

        try {
            const response = await clawdbot.exec({
                command: getPythonCommand('import json; from scripts.tpm_monitor import get_all_tpm; print(json.dumps(get_all_tpm()))'),
                pty: false,
            });
            const tpmData = JSON.parse(response.output);

            tpmDataContainer.innerHTML = '';

            if (Object.keys(tpmData).length === 0) {
                tpmDataContainer.innerHTML = '<p class="loading-text">No active monitoring data available.</p>';
                return;
            }

            for (const modelName in tpmData) {
                const currentTpm = tpmData[modelName];
                const modelConfig = config.models ? config.models[modelName] : null;
                const threshold = modelConfig ? modelConfig.threshold_tpm : null;
                
                const card = document.createElement('div');
                card.classList.add('model-card');

                let tpmValueClass = 'tpm-value';
                let statusClass = 'status-online';
                if (threshold !== null && currentTpm >= threshold) {
                    card.classList.add('alert');
                    tpmValueClass += ' alert';
                    statusClass = 'status-alert';
                }

                card.innerHTML = `
                    <div>
                        <span class="status-indicator ${statusClass}"></span>
                        <span class="model-name">${modelName}</span>
                    </div>
                    <span class="${tpmValueClass}">${currentTpm.toLocaleString()} TPM</span>
                `;
                tpmDataContainer.appendChild(card);
            }

            const lastUpdated = document.createElement('p');
            lastUpdated.style.textAlign = 'center';
            lastUpdated.style.color = '#64748b';
            lastUpdated.style.fontSize = '0.8rem';
            lastUpdated.style.marginTop = '20px';
            lastUpdated.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
            tpmDataContainer.appendChild(lastUpdated);

        } catch (error) {
            console.error("Error fetching or rendering TPM data:", error);
            tpmDataContainer.innerHTML = '<p class="loading-text" style="color: #ef4444;">Sync failed. Checking environment...</p>';
        }
    }

    async function checkForAlerts() {
        if (Object.keys(config).length === 0) return;
        try {
            await clawdbot.exec({
                command: getPythonCommand('from scripts.tpm_monitor import check_and_alert; check_and_alert()'),
                pty: false,
            });
        } catch (error) {
            console.error("Error checking for alerts:", error);
        }
    }

    fetchAndRenderTpm();
    setInterval(fetchAndRenderTpm, 5000);
    setInterval(checkForAlerts, (config.alert_interval_seconds || 60) * 1000);
});
