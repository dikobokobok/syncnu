const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const installersDir = path.join(rootDir, 'installers');

console.log('1. Building Tauri Desktop app...');
try {
  execSync('npm run tauri build --workspace=app/desktop', { stdio: 'inherit', cwd: rootDir });
} catch (error) {
  console.error('Error building Tauri desktop app:', error.message);
  process.exit(1);
}

console.log('2. Ensuring installers directory exists...');
if (!fs.existsSync(installersDir)) {
  fs.mkdirSync(installersDir, { recursive: true });
}

// Default Tauri build output directories for Windows bundle target
const bundleDir = path.join(rootDir, 'app', 'desktop', 'src-tauri', 'target', 'release', 'bundle');
const nsisSrc = path.join(bundleDir, 'nsis', 'Syncnu_1.14.1_x64-setup.exe');
const msiSrc = path.join(bundleDir, 'msi', 'Syncnu_1.14.1_x64_en-US.msi');

const nsisDest = path.join(installersDir, 'Syncnu_1.14.1_x64-setup.exe');
const msiDest = path.join(installersDir, 'Syncnu_1.14.1_x64_en-US.msi');

console.log('3. Deleting existing installers if present...');
if (fs.existsSync(nsisDest)) {
  try {
    fs.unlinkSync(nsisDest);
    console.log(`Deleted existing NSIS setup: ${nsisDest}`);
  } catch (err) {
    console.log(`Could not delete existing NSIS setup: ${err.message}`);
  }
}
if (fs.existsSync(msiDest)) {
  try {
    fs.unlinkSync(msiDest);
    console.log(`Deleted existing MSI installer: ${msiDest}`);
  } catch (err) {
    console.log(`Could not delete existing MSI installer: ${err.message}`);
  }
}

console.log('4. Copying installers to destination...');
let copiedCount = 0;

if (fs.existsSync(nsisSrc)) {
  fs.copyFileSync(nsisSrc, nsisDest);
  console.log(`Copied NSIS setup to: ${nsisDest}`);
  copiedCount++;
} else {
  console.log(`Warning: NSIS installer not found at ${nsisSrc}`);
}

if (fs.existsSync(msiSrc)) {
  fs.copyFileSync(msiSrc, msiDest);
  console.log(`Copied MSI installer to: ${msiDest}`);
  copiedCount++;
} else {
  console.log(`Warning: MSI installer not found at ${msiSrc}`);
}

if (copiedCount > 0) {
  console.log('Desktop installer build and copy completed successfully!');
} else {
  console.error('Error: No installer files found in Tauri target directory.');
  process.exit(1);
}
