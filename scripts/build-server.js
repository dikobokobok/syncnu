const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// The Go source is in server/etc/, this script lives in scripts/
const serverDir = path.join(__dirname, '..', 'server', 'etc');
const isWindows = process.platform === 'win32';
const outputName = isWindows ? 'dist/server.exe' : 'dist/server';

// Ensure dist directory exists
const distDir = path.join(serverDir, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log(`Building Go backend for ${process.platform}...`);
execSync(`go build -o ${outputName} .`, { stdio: 'inherit', cwd: serverDir });
console.log(`Build complete: ${outputName}`);
