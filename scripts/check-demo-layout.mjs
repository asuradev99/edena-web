import assert from 'node:assert/strict';
import {openPage} from './cdp.mjs';
const page=await openPage(Number(process.argv[2]??9444));
try{
 for(const width of [1280,390]){
  await page.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  for(const name of ['text','basics','homework']){
   await page.call('Page.navigate',{url:`http://127.0.0.1:5173/${name}.html`});
   await new Promise(resolve=>setTimeout(resolve,3500));
   const layout=await page.evaluate(`(()=>{
    const overlap=[];
    for(const shell of document.querySelectorAll('.canvas-shell')){
     const canvas=shell.querySelector('canvas'),side=shell.querySelector('.canvas-sidebar');if(!canvas||!side)continue;
     const a=canvas.getBoundingClientRect(),b=side.getBoundingClientRect();
     if(Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1)overlap.push(canvas.id);
    }
    return {overlap,overflow:document.documentElement.scrollWidth-innerWidth,status:document.getElementById('status')?.textContent};
   })()`);
   assert.deepEqual(layout.overlap,[],`${name} controls overlap the graphics at ${width}px`);
   assert.ok(layout.overflow<=0,`${name} scrolls horizontally at ${width}px`);
   if(name==='text'){
    assert.match(layout.status,/mipmapped text/);
    const result=await page.evaluate(`(async()=>{
     document.getElementById('playing').checked=false;
     const select=document.getElementById('notation');
     for(let i=0;i<4;i++){select.value=String(i);select.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,150));}
     const math=document.querySelector('math'),script=math.querySelector('msub');
     return {text:math.textContent,base:script.children[0].textContent,sub:script.children[1].textContent,font:getComputedStyle(math).fontFamily};
    })()`);
    assert.equal(result.base,'𝔸');assert.equal(result.sub,'i');assert.match(result.font,/STIX Two Math/);
   }
   console.log(`${name}: reserved side column, ${width}px`);
  }
 }
}finally{await page.close();}
