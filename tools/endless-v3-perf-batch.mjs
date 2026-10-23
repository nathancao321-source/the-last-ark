import {spawn} from 'node:child_process';
for(const seed of [20261017,7,424242])for(const version of (process.argv[2]==='v3-only'?[3]:[2,3])){
 await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['tools/endless-v3-qa.mjs','flight',String(version),String(seed),'30'],{stdio:'inherit',env:process.env});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(`QA exit ${code}`)));});
}
