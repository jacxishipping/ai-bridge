const fs = require('fs');
const path = require('path');

function walk(d) {
  let r = [];
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) r = r.concat(walk(p));
    else if (p.endsWith('.d.ts')) r.push(p);
  }
  return r;
}

const baseDir = path.resolve('apps/dashboard/node_modules/@jacxishippingorg/jx-ui-react/dist-lib/types');
const files = walk(baseDir);
const result = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const rel = path.relative(baseDir, f).replace(/\\/g, '/');
  const re = /export declare const (\w+):\s*React\.FC(?:<([^>]+)>)?/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const compName = m[1];
    const propType = m[2] ? m[2].trim() : null;
    let interfaceDef = '';
    if (propType) {
      // Find interface definition in content
      const regexStr = '(?:export )?interface ' + propType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(?:extends[^{]*)?\\{([^}]*)\\}';
      const ifMatch = new RegExp(regexStr, 'm').exec(content);
      if (ifMatch) {
        interfaceDef = ifMatch[0].trim();
      } else {
        // Maybe type alias
        const typeRegex = '(?:export )?type ' + propType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=[^;]+;';
        const tMatch = new RegExp(typeRegex, 'm').exec(content);
        if (tMatch) interfaceDef = tMatch[0].trim();
        else interfaceDef = propType;
      }
    }
    result.push({
      name: compName,
      propType: propType || 'React.FC (no props)',
      file: rel,
      interfaceDef
    });
  }
}

console.log('Total exported components found:', result.length);
const withProps = result.filter(c => c.propType !== 'React.FC (no props)');
const withoutProps = result.filter(c => c.propType === 'React.FC (no props)');
console.log('Components with typed props:', withProps.length);
console.log('Components without typed props:', withoutProps.length);

fs.writeFileSync(path.join(__dirname, 'components_survey.json'), JSON.stringify({ withProps, withoutProps }, null, 2));
console.log('Saved components_survey.json');

