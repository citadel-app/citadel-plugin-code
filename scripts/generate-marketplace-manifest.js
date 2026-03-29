const fs = require('fs');
const path = require('path');

const pluginDir = path.resolve(__dirname, '..');
const pluginPkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
const pluginSlug = pluginPkg.name.replace('@citadel-app/', 'citadel-plugin-');
const marketplaceDir = path.resolve(pluginDir, `../citadel-marketplace/plugins/${pluginSlug}`);

console.log('[Marketplace Generator] Starting generation...');

// 1. Ensure marketplace directories exist
if (!fs.existsSync(marketplaceDir)) {
    fs.mkdirSync(marketplaceDir, { recursive: true });
}

// 2. Copy README.md
const readmePath = path.join(pluginDir, 'README.md');
if (fs.existsSync(readmePath)) {
    fs.writeFileSync(path.join(marketplaceDir, 'README.md'), fs.readFileSync(readmePath, 'utf8'));
    console.log('[Marketplace Generator] Copied README.md');
}

// 3. Extract IPC capabilities and permissions from source
const rendererIndex = path.join(pluginDir, 'src/renderer/index.ts');
let ipcs = [];
let permissions = [];

if (fs.existsSync(rendererIndex)) {
    const code = fs.readFileSync(rendererIndex, 'utf8');
    
    const ipcsMatch = code.match(/ipcs:\s*\[([\s\S]*?)\]/);
    if (ipcsMatch) {
        ipcs = ipcsMatch[1].split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean);
    }

    const permsMatch = code.match(/ipc:\s*\[([\s\S]*?)\]/);
    if (permsMatch) {
        permissions = permsMatch[1].split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean);
    }
}

// 4. Build marketplace package.json
const metaPkg = { ...pluginPkg };
metaPkg.citadel = metaPkg.citadel || {};
metaPkg.citadel.capabilities = ipcs;
metaPkg.citadel.permissions = permissions;

// Copy icon if defined
if (metaPkg.citadel.icon) {
    const iconSrc = path.join(pluginDir, metaPkg.citadel.icon);
    const iconDest = path.join(marketplaceDir, metaPkg.citadel.icon);
    if (fs.existsSync(iconSrc)) {
        const iconDir = path.dirname(iconDest);
        if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });
        fs.copyFileSync(iconSrc, iconDest);
        console.log(`[Marketplace Generator] Copied icon: ${metaPkg.citadel.icon}`);
    }
}

fs.writeFileSync(path.join(marketplaceDir, 'package.json'), JSON.stringify(metaPkg, null, 2));
console.log('[Marketplace Generator] Updated package.json');

// 5. Update versions.json
const versionPath = path.join(marketplaceDir, 'versions.json');
let versionsData = { latest: metaPkg.version, versions: {} };

if (fs.existsSync(versionPath)) {
    versionsData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
}

const currentVersion = metaPkg.version;
if (!versionsData.versions[currentVersion]) {
    versionsData.latest = currentVersion;
    
    const bundleUrl = `https://github.com/citadel-app/${pluginSlug}/releases/download/v${currentVersion}/${pluginSlug}.zip`;
    const citadelVersionRange = metaPkg.engines?.citadel || ">=1.0.0";
    
    versionsData.versions[currentVersion] = {
        bundleUrl,
        releasedAt: new Date().toISOString(),
        changelog: `Release v${currentVersion}`,
        citadelVersionRange
    };
    
    fs.writeFileSync(versionPath, JSON.stringify(versionsData, null, 2));
    console.log(`[Marketplace Generator] Added version ${currentVersion}`);
}

console.log('[Marketplace Generator] Done!');
