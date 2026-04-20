import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nextDir = path.join(root, '.next');
const standaloneDir = path.join(nextDir, 'standalone');
const standaloneNextDir = path.join(standaloneDir, '.next');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirContents(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    return;
  }

  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(standaloneDir)) {
  process.exit(0);
}

ensureDir(standaloneNextDir);

copyIfExists(path.join(nextDir, 'routes-manifest.json'), path.join(standaloneNextDir, 'routes-manifest.json'));
copyIfExists(path.join(nextDir, 'required-server-files.json'), path.join(standaloneNextDir, 'required-server-files.json'));
copyIfExists(path.join(nextDir, 'build-manifest.json'), path.join(standaloneNextDir, 'build-manifest.json'));

copyDirContents(path.join(nextDir, 'server'), path.join(standaloneNextDir, 'server'));
copyDirContents(path.join(nextDir, 'static'), path.join(standaloneNextDir, 'static'));
