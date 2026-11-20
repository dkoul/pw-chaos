import { defineConfig } from 'vite';

const demoServices = [
  { name: 'Identity API', status: 'Operational', latency: 42 },
  { name: 'Metrics API', status: 'Operational', latency: 86 },
  { name: 'Billing API', status: 'Operational', latency: 118 },
  { name: 'Search API', status: 'Operational', latency: 64 }
];

export default defineConfig({
  plugins: [{
    name: 'dashboard-api',
    configureServer(server) {
      server.middlewares.use('/api/services', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(demoServices));
      });
    }
  }]
});
