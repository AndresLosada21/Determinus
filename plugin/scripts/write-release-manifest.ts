import {readdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files:Record<string,string>={};
function visit(dir:string){for(const e of readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git'].includes(e.name)||e.name.endsWith('.log')||e.name==='release-manifest.json'||e.name==='EM-VALIDACAO.txt')continue;const p=join(dir,e.name);if(lstatSync(p).isSymbolicLink())throw Error('Symlink in release: '+p);if(e.isDirectory())visit(p);else files[relative(root,p).replace(/\\/g,'/')]=createHash('sha256').update(readFileSync(p)).digest('hex');}}
visit(root);const pkg=JSON.parse(readFileSync(join(root,'plugin/package.json'),'utf8'));
if(pkg.version!=='3.0.4')throw Error('Update the release version consistently before packaging');
writeFileSync(join(root,'release-manifest.json'),JSON.stringify({version:pkg.version,files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))},null,2)+'\n');
console.log('Release manifest: '+Object.keys(files).length+' files');
