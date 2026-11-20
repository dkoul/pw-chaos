import './style.css';

type Service = { name: string; status: string; latency: number };

function render() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main class="shell">
      <header>
        <div><span class="eyebrow">NORTHSTAR / PLATFORM</span><h1>Operations dashboard</h1>
        <p>Live service health across your platform.</p></div>
        <span class="pill"><i></i> Monitoring active</span>
      </header>
      <section class="summary">
        <article><span>Services</span><strong>04</strong><small>All monitored</small></article>
        <article><span>Requests / min</span><strong>12.8k</strong><small>+4.2% vs last hour</small></article>
        <article><span>Availability</span><strong>99.98%</strong><small>Last 30 days</small></article>
      </section>
      <section class="panel">
        <div class="panel-head"><div><span class="eyebrow">INFRASTRUCTURE</span><h2>Service health</h2></div>
        <button id="refresh">Refresh status</button></div>
        <div id="notice" role="status" aria-live="polite"></div>
        <div class="service-list" id="services"></div>
      </section>
      <footer>Northstar Operations <span>Demo environment · Data is simulated</span></footer>
    </main>`;

  const list = document.querySelector<HTMLDivElement>('#services')!;
  const notice = document.querySelector<HTMLDivElement>('#notice')!;

  async function load() {
    notice.textContent = 'Refreshing service status…';
    try {
      const response = await fetch('/api/services');
      if (!response.ok) throw new Error(`Service returned ${response.status}`);
      const data = await response.json() as Service[];
      list.innerHTML = data.map(service => `
        <div class="service">
          <div class="service-name"><i class="${service.status === 'Operational' ? 'good' : 'bad'}"></i>
            <strong>${service.name}</strong></div>
          <span class="status ${service.status === 'Operational' ? 'ok' : 'error'}">${service.status}</span>
          <span class="latency">${service.latency} ms</span>
        </div>`).join('');
      notice.textContent = '';
    } catch {
      notice.textContent = 'Unable to refresh service health. Please try again.';
      list.innerHTML = '<div class="empty">Service data is temporarily unavailable.</div>';
    }
  }
  document.querySelector('#refresh')!.addEventListener('click', load);
  void load();
}
render();
