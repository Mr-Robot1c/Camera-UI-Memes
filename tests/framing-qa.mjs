import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'test-reports/triage/1'; await mkdir(out,{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage({viewport:{width:375,height:812}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const source=document.createElement('canvas'); source.width=640; source.height=480;
 const paint=()=>{const c=source.getContext('2d'),w=source.width,h=source.height;c.fillStyle='#505050';c.fillRect(0,0,w,h);c.fillStyle='#ff0000';c.fillRect(0,0,w*.08,h);c.fillStyle='#0000ff';c.fillRect(w*.92,0,w*.08,h);c.fillStyle='#00ff00';c.fillRect(0,0,w,h*.08);c.fillStyle='#ffff00';c.fillRect(0,h*.92,w,h*.08);requestAnimationFrame(paint);};paint();
 window.qaSource=source;
 navigator.mediaDevices.getUserMedia=async constraints=>{if(!constraints.video)throw new DOMException('test silent','NotAllowedError');return source.captureStream(24);};
});
await page.goto(process.env.QA_URL||'http://127.0.0.1:4175/');
await page.getByRole('button',{name:'Open camera',exact:true}).click();
await page.getByRole('button',{name:'Start recording',exact:true}).waitFor({timeout:60000});
const sample=()=>page.locator('.camera-canvas').evaluate(c=>{const x=c.getContext('2d'),w=c.width,h=c.height;const p=(a,b)=>Array.from(x.getImageData(Math.floor(a*w),Math.floor(b*h),1,1).data).slice(0,3);return {w,h,left:p(.04,.5),right:p(.96,.5),top:p(.5,.04),bottom:p(.5,.96)};});
const edges=s=>{assert.deepEqual(s.left,[0,0,255],'mirrored right edge visible');assert.deepEqual(s.right,[255,0,0],'mirrored left edge visible');assert.deepEqual(s.top,[0,255,0],'top edge visible');assert.deepEqual(s.bottom,[255,255,0],'bottom edge visible');};
await page.waitForTimeout(500);const initial=await sample();edges(initial);
await page.evaluate(()=>{qaSource.width=480;qaSource.height=640;});
await page.waitForTimeout(1200);const portrait=await sample();
await page.screenshot({path:`${out}/framing-portrait.png`,fullPage:true});
const results={initial,portrait,errors};await writeFile(`${out}/framing-result.json`,JSON.stringify(results,null,2));
try {
 edges(portrait); assert.ok(Math.abs(portrait.w/portrait.h-.75)<.002,'canvas follows delayed portrait dimensions');
 for(const [w,h] of [[375,812],[428,926],[320,568]]){await page.setViewportSize({width:w,height:h});const box=await page.locator('.viewfinder').boundingBox();assert.ok(Math.abs(box.width/box.height-.75)<.01,'portrait stage ratio');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/framing-${w}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Zoom',exact:true}).click();await page.waitForTimeout(250);const zoomed=await sample();assert.notDeepEqual(zoomed.left,portrait.left,'deliberate zoom crops edges');
 await page.getByRole('button',{name:'Zoom',exact:true}).click();await page.getByRole('button',{name:'Zoom',exact:true}).click();await page.waitForTimeout(250);edges(await sample());
 await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.waitForTimeout(500);const recording=await sample();edges(recording);assert.equal(recording.w,portrait.w);assert.equal(recording.h,portrait.h);
 await page.evaluate(()=>{qaSource.width=640;qaSource.height=480;});await page.waitForTimeout(700);const rotated=await sample();assert.equal(rotated.w,recording.w,'record canvas width locked');assert.equal(rotated.h,recording.h,'record canvas height locked');
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();await page.getByRole('button',{name:'Save Video',exact:true}).waitFor();
 await page.locator('.review-video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.review-video').currentTime>.2);
 const clip=await page.locator('.review-video').evaluate(v=>({w:v.videoWidth,h:v.videoHeight}));assert.equal(clip.w,recording.w);assert.equal(clip.h,recording.h);
 assert.deepEqual(errors,[]);Object.assign(results,{passed:true,recording,rotated,clip});
} catch(e){results.passed=false;results.failure=e.message;throw e;}finally{await writeFile(`${out}/framing-result.json`,JSON.stringify(results,null,2));await browser.close();}
