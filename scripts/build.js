import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const edgeFuncDir = join(root, 'edge-functions');
const kvHelpersPath = join(edgeFuncDir, 'lib', 'kv-helpers.js');
const distDir = join(root, 'edge-functions-dist');

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

const kvHelpers = readFileSync(kvHelpersPath, 'utf-8').replace(/^export\s+\{/gm, '// export {');

const staticExtensions = ['.html', '.css', '.js', '.json', '.md', '.svg'];
const staticCopyDirs = [''];

function copyFonts() {
  const fontsDir = join(root, 'fonts');
  if (!existsSync(fontsDir)) return;
  const destFonts = join(distDir, 'fonts');
  mkdirSync(destFonts, { recursive: true });
  for (const file of readdirSync(fontsDir)) {
    if (file.endsWith('.woff2') || file.endsWith('.woff') || file.endsWith('.ttf')) {
      copyFileSync(join(fontsDir, file), join(destFonts, file));
    }
  }
}

function shouldCopyStatic(name, ext) {
  if (staticExtensions.includes(ext)) return true;
  if (name === 'LICENSE') return true;
  return false;
}

const rootEntries = readdirSync(root, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isFile() && shouldCopyStatic(entry.name, extname(entry.name))) {
    if (entry.name === 'edgeone.json') continue;
    copyFileSync(join(root, entry.name), join(distDir, entry.name));
  }
}

function processEdgeFunctions(dir, relDir) {
  const fullDir = join(edgeFuncDir, dir);
  const entries = readdirSync(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === 'lib') continue;
      processEdgeFunctions(join(dir, entry.name), join(relDir, entry.name));
    } else if (entry.name.endsWith('.js')) {
      const srcPath = join(fullDir, entry.name);
      let content = readFileSync(srcPath, 'utf-8');

      const libImportMap = {
        './lib/kv-helpers.js': true,
        '../lib/kv-helpers.js': true,
        '../../lib/kv-helpers.js': true,
      };

      for (const importPath of Object.keys(libImportMap)) {
        const regex = new RegExp(
          `import\\s*\\{[^}]*\\}\\s*from\\s*['"]${importPath.replace(/\./g, '\\.')}['"]\\s*;?\\s*\\n?`,
          'g'
        );
        if (regex.test(content)) {
          content = content.replace(regex, '');
          content = kvHelpers + '\n' + content;
          break;
        }
      }

      content = content.replace(/^export\s+\{/gm, '// export {');

      const destFullDir = join(distDir, 'edge-functions', relDir);
      mkdirSync(destFullDir, { recursive: true });
      writeFileSync(join(destFullDir, entry.name), content, 'utf-8');
    }
  }
}

processEdgeFunctions('', '');

const edgeoneConfig = {
  buildCommand: '',
  installCommand: '',
  outputDirectory: './',
  nodeVersion: '18.20.4',
  rewrites: [
    {
      source: '/admin',
      destination: '/admin.html'
    }
  ]
};
writeFileSync(join(distDir, 'edgeone.json'), JSON.stringify(edgeoneConfig, null, 2), 'utf-8');

copyFonts();

console.log('EdgeLink build complete →', distDir);
function extname(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.substring(idx) : '';
}