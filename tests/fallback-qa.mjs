import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
// Block service workers so page.route can intercept model requests deterministically.
const context = await browser.newContext({permissions:['camera','microphone'],viewport:{width:375,height:812},acceptDownloads:true,serviceWorkers:'block'});
const page = await context.newPage();
await page.addInitScript(()=>{
  const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{
    if(options.audio && !options.video) throw new DOMException('Audio denied','NotAllowedError');
    return getMedia(options);
  };
  document.modelContext={registerTool(tool,{signal}) {window.testTools??={};window.testTools[tool.name]=tool;signal.addEventListener('abort',()=>delete window.testTools[tool.name]);}};
});
await page.route('**/models/*.task',route=>route.abort());
await page.goto('http://127.0.0.1:4173/');
const schema=await page.evaluate(()=>({schema:window.testTools.select_meme.inputSchema,annotation:window.testTools.select_meme.annotations}));
assert.equal(schema.annotation.readOnlyHint,false);assert(schema.schema.properties.meme.enum.includes('heart'));
const result=await page.evaluate(()=>window.testTools.select_meme.execute({meme:'heart'}));
assert.equal(result.meme,'heart');assert.equal(await page.getByRole('button',{name:'Heart hands — Form a heart with both hands'}).getAttribute('aria-pressed'),'true');
assert.equal(await page.evaluate(async()=>{try{await window.testTools.select_meme.execute({meme:'wrong'});return false}catch{return true}}),true);
assert.equal(await page.getByRole('button',{name:'Heart hands — Form a heart with both hands'}).getAttribute('aria-pressed'),'true');
await page.getByRole('button',{name:'Open camera',exact:true}).click();
await page.getByRole('button',{name:'Start recording',exact:true}).waitFor({timeout:60000});
await page.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:60000});
assert.equal(await page.getByRole('button',{name:'Turn mic on',exact:true}).count(),1);
await page.getByRole('button',{name:'Start recording',exact:true}).click();await page.waitForTimeout(1500);await page.getByRole('button',{name:'Stop recording',exact:true}).click();
await page.getByRole('button',{name:'Save Video',exact:true}).waitFor();
const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download video'}).click();const d=await waiting;await d.saveAs('test-results/fallback-silent.mp4');
assert.equal(await page.getByText('No sound',{exact:true}).count(),1);
console.log('PASS: microphone denied + all models unavailable still permits manual meme recording/download; WebMCP valid and invalid inputs keep UI consistent.');
await browser.close();
