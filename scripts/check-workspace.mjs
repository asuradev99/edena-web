// Browser integration: node scripts/check-workspace.mjs [CDP port].
import assert from 'node:assert/strict';
import {openPage} from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await page.call('Page.navigate',{url:'http://127.0.0.1:5173/index.html'});await wait(4000);
 for(const id of ['tight-binding:tb-canvas','basics:secant-canvas','academy:plotframe-canvas','text:text-canvas','homework:critical-canvas']){
  await page.evaluate(`location.hash=${JSON.stringify(encodeURIComponent(id))}`);await wait(2500);
  const result=await page.evaluate(`(()=>{
   const doc=document.getElementById('workspace').contentDocument;
   const canvases=[...doc.querySelectorAll('canvas')].filter(c=>c.getBoundingClientRect().width>20&&c.getBoundingClientRect().height>20);
   const canvas=canvases[0],a=canvas?.getBoundingClientRect(),side=doc.querySelector('.project-active>.canvas-sidebar')?.getBoundingClientRect();
   return {count:canvases.length,id:canvas?.id,width:canvas?.width,overlap:a&&side?Math.min(a.right,side.right)-Math.max(a.left,side.left):0,status:doc.getElementById('status')?.textContent,textWidths:[...doc.querySelectorAll('.edena-text-measurement>span')].map(n=>n.getBoundingClientRect().width)};
  })()`);
  assert.equal(result.count,1,`${id}: one visible canvas`);assert.equal(result.id,id.split(':')[1]);assert.ok(result.width>20);assert.ok(result.overlap<=1);
  if(id.startsWith('tight-binding'))assert.match(result.status,/grid/);
  if(id.startsWith('text:'))assert.ok(result.textWidths.length>=3&&result.textWidths.every(w=>w>0),'world text retains its measurement layout in the workspace');
  console.log(id,result);
 }
 await page.evaluate(`location.hash='tight-binding:tb-canvas'`);await wait(2500);
 const modes=await page.evaluate(`(async()=>{
  const doc=document.getElementById('workspace').contentDocument,select=doc.getElementById('view');
  const counts=[];for(const mode of ['bands','dispersion','fermi','bz','lattice','dos']){select.value=mode;select.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,300));counts.push({mode,status:doc.getElementById('status').getAttribute('role'),labels:doc.querySelectorAll('#tb-labels span').length});}
  doc.getElementById('sweep').click();const before=doc.getElementById('mu').value;await new Promise(r=>setTimeout(r,700));const after=doc.getElementById('mu').value;doc.getElementById('sweep').click();return {counts,before,after};
 })()`);
 assert.ok(modes.counts.every(s=>s.status!=='alert'));assert.notEqual(modes.before,modes.after);
 console.log('PASS: project switching, reserved controls, all tight-binding views and Fermi evolution');
}finally{await page.close();}
