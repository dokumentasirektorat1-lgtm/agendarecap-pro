const fs = require('fs');
const path = require('path');

const action = process.argv[2]; // 'hide' or 'restore'
const apiDir = path.join(__dirname, '../src/app/api');

function getRouteFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getRouteFiles(filePath));
    } else if (file === 'route.ts' || file === 'route.js') {
      results.push(filePath);
    }
  });
  return results;
}

const routeFiles = getRouteFiles(apiDir);
const STATIC_FLAG = "export const dynamic = 'force-static';\n";

if (action === 'hide') {
  console.log(`[NATIVE BUILD PREP] Patching ${routeFiles.length} API routes with force-static for export...`);
  routeFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes("export const dynamic = 'force-static'")) {
      fs.writeFileSync(file, STATIC_FLAG + content, 'utf8');
    }
  });
  console.log('[NATIVE BUILD PREP] API routes patched successfully.');
} else if (action === 'restore') {
  console.log(`[NATIVE BUILD PREP] Restoring ${routeFiles.length} API routes (removing force-static)...`);
  routeFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes("export const dynamic = 'force-static';\n")) {
      content = content.replace("export const dynamic = 'force-static';\n", "");
      fs.writeFileSync(file, content, 'utf8');
    } else if (content.includes("export const dynamic = 'force-static';")) {
      content = content.replace("export const dynamic = 'force-static';", "");
      fs.writeFileSync(file, content, 'utf8');
    }
  });
  console.log('[NATIVE BUILD PREP] API routes restored successfully.');
}
