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

// 3. Prepare metadata (package.json is already the source of truth)
const metaPkg = { ...pluginPkg };
// Ensure all required citadel fields are present for the marketplace
metaPkg.citadel = metaPkg.citadel || {};
metaPkg.citadel.providesIpcs = metaPkg.citadel.providesIpcs || [];
metaPkg.citadel.permissions = metaPkg.citadel.permissions || [];
metaPkg.citadel.sidecars = metaPkg.citadel.sidecars || [];
metaPkg.citadel.capabilities = Array.from(new Set([
    ...(metaPkg.citadel.capabilities || []),
    ...(metaPkg.citadel.providesIpcs || [])
]));


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
