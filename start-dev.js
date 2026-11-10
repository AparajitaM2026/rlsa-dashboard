import { spawn } from 'child_process';

console.log('\x1b[36m%s\x1b[0m', '=====================================================');
console.log('\x1b[36m%s\x1b[0m', '   Starting RLSA Records Dashboard (Backend + UI)   ');
console.log('\x1b[36m%s\x1b[0m', '=====================================================');

// Start backend server
const server = spawn('node', ['server/index.js'], { stdio: 'inherit', shell: true });

// Start vite frontend
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

function shutdown() {
  console.log('\nShutting down servers...');
  server.kill();
  vite.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
