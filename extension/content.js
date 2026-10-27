// Nifty Institutional OI HUD — Floating Injected Overlay
(function () {
  console.log('[Nifty OI HUD] Extension activated on:', window.location.hostname);

  // Avoid multiple injections
  if (document.getElementById('nifty-oi-hud-root')) return;

  const hud = document.createElement('div');
  hud.id = 'nifty-oi-hud-root';
  hud.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 280px;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(51, 65, 85, 0.8);
    border-radius: 16px;
    padding: 14px;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    font-size: 12px;
    z-index: 9999999;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    user-select: none;
    transition: all 0.2s ease;
  `;

  hud.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(51,65,85,0.6); padding-bottom: 8px; margin-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">⚡</span>
        <span style="font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">NIFTY OI HUD</span>
      </div>
      <span id="nifty-hud-status" style="font-size: 10px; background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; font-weight: bold;">LIVE</span>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
      <span style="color: #94a3b8;">Spot:</span>
      <span id="nifty-hud-spot" style="font-weight: bold; color: #ffffff;">Fetching...</span>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
      <span style="color: #94a3b8;">Market Bias:</span>
      <span id="nifty-hud-bias" style="font-weight: bold; color: #fbbf24;">...</span>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
      <span style="color: #94a3b8;">PCR / Max Pain:</span>
      <span id="nifty-hud-pcr" style="font-weight: bold; color: #38bdf8;">...</span>
    </div>

    <div style="background: rgba(30,41,59,0.6); border-radius: 8px; padding: 6px 8px; margin-top: 8px;">
      <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Trapped Sellers Alert</div>
      <div id="nifty-hud-trapped" style="font-size: 11px; color: #cbd5e1; font-style: italic;">Monitoring option writers...</div>
    </div>
  `;

  document.body.appendChild(hud);

  // Poll local/cloud engine
  async function fetchMetrics() {
    try {
      const res = await fetch('http://localhost:8000/api/summary');
      if (res.ok) {
        const data = await res.json();
        document.getElementById('nifty-hud-spot').innerText = data.spot ? data.spot.toFixed(2) : '--';
        
        const biasEl = document.getElementById('nifty-hud-bias');
        biasEl.innerText = data.bias || 'NEUTRAL';
        biasEl.style.color = data.bias === 'BULLISH' ? '#34d399' : (data.bias === 'BEARISH' ? '#f87171' : '#fbbf24');

        document.getElementById('nifty-hud-pcr').innerText = `${data.pcr || 1.0} | ${data.max_pain || '--'}`;

        const trappedEl = document.getElementById('nifty-hud-trapped');
        if (data.trapped_writers && data.trapped_writers.length > 0) {
          trappedEl.innerText = data.trapped_writers[0].message;
          trappedEl.style.color = '#f87171';
        } else {
          trappedEl.innerText = 'No panic detected. Rangebound.';
          trappedEl.style.color = '#94a3b8';
        }
      }
    } catch (e) {
      document.getElementById('nifty-hud-status').innerText = 'OFFLINE';
      document.getElementById('nifty-hud-status').style.background = 'rgba(239,68,68,0.2)';
      document.getElementById('nifty-hud-status').style.color = '#f87171';
    }
  }

  fetchMetrics();
  setInterval(fetchMetrics, 30000);
})();
