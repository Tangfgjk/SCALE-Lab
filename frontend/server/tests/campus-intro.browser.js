async (page) => {
  const browser=page.context().browser(),base='http://127.0.0.1:3004',key='scale-lab-intro-seen';
  const results=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  async function scenario(name,options,run){
    const context=await browser.newContext(options),p=await context.newPage();let count=0;
    context.on('request',r=>{if(r.url().includes('/assets/media/campus-intro.mp4'))count++;});
    try{await run(context,p,()=>count);results.push('PASS '+name);}finally{await context.close();}
  }
  async function clean(p){
    await p.waitForSelector('.campus-intro',{state:'detached'});
    assert(await p.evaluate(()=>!document.documentElement.classList.contains('intro-pending') && !document.querySelector('main').inert && document.body.style.overflow!=='hidden'),'Overlay left the page blocked');
  }
  await scenario('normal finish, refresh, new tab, stored browser profile and navigation',{viewport:{width:1440,height:900}},async(c,p,count)=>{
    await p.goto(base+'/');await p.waitForFunction(()=>document.documentElement.dataset.campusIntroState==='playing');
    const facts=await p.locator('.campus-intro video').evaluate(v=>({muted:v.muted,loop:v.loop,duration:v.duration}));
    assert(facts.muted&&!facts.loop&&facts.duration>4&&facts.duration<5,'Wrong video playback properties');
    await clean(p);assert(await p.evaluate(()=>document.documentElement.dataset.campusIntroState==='ended'),'Intro did not finish naturally');
    await p.reload();assert(await p.locator('.campus-intro').count()===0,'Refresh replayed intro');
    const tab=await c.newPage();await tab.goto(base+'/index.html');assert(await tab.locator('.campus-intro').count()===0,'New tab replayed intro');
    assert(count()===1,'Returning visitor downloaded video');
    const state=await c.storageState(),reopened=await browser.newContext({storageState:state});
    try{const next=await reopened.newPage();let requests=0;next.on('request',r=>{if(r.url().includes('campus-intro.mp4'))requests++;});await next.goto(base+'/');assert(await next.locator('.campus-intro').count()===0&&requests===0,'Stored profile replayed intro');}finally{await reopened.close();}
    await p.bringToFront();await p.locator('.nav a[href="people.html"]').click();await p.waitForURL('**/people.html');await p.goBack();await clean(p);assert(count()===1,'History replayed intro');
  });
  await scenario('mobile skip button and focus/scroll restoration',{viewport:{width:390,height:844}},async(c,p)=>{
    await p.goto(base+'/');await p.locator('.campus-intro').waitFor();
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile intro overflow');
    await p.waitForFunction(()=>document.querySelector('.campus-intro video')?.currentTime>2.5);
    await p.screenshot({path:'C:/Users/21709/Desktop/SCALE-Lab/SCALE Lab/frontend/server/storage/import-reports/campus-intro-mobile-20261021.png'});
    await p.getByRole('button',{name:'跳过，进入首页'}).click();await clean(p);
    assert(await p.evaluate(k=>localStorage.getItem(k)==='1',key),'Skip not remembered');
  });
  await scenario('Escape skip',{},async(c,p)=>{await p.goto(base+'/');await p.locator('.campus-intro').waitFor();await p.keyboard.press('Escape');await clean(p);assert(await p.evaluate(()=>document.documentElement.dataset.campusIntroState==='skipped'),'Escape did not skip');});
  await scenario('reduced motion downloads nothing',{reducedMotion:'reduce'},async(c,p,count)=>{await p.goto(base+'/');await clean(p);assert(count()===0,'Reduced motion downloaded intro');});
  await scenario('detail entry suppresses later homepage intro',{},async(c,p,count)=>{await p.goto(base+'/news.html?slug=graduation-photo-20260608');await p.goto(base+'/');await clean(p);assert(count()===0,'Detail entry interrupted later home');});
  await scenario('storage unavailable degrades to home',{},async(c,p,count)=>{await c.addInitScript(()=>{Storage.prototype.getItem=function(){throw new Error('storage disabled');};Storage.prototype.setItem=function(){throw new Error('storage disabled');};});await p.goto(base+'/');await clean(p);assert(count()===0,'No-storage visitor downloaded intro');});
  await scenario('lock unavailable degrades to home',{},async(c,p,count)=>{await c.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));await p.goto(base+'/');await clean(p);assert(count()===0,'No-lock visitor downloaded intro');});
  await scenario('media failure does not block home',{},async(c,p)=>{await c.route('**/assets/media/campus-intro.mp4',r=>r.abort());await p.goto(base+'/');await clean(p);assert(await p.evaluate(()=>['media-error','autoplay-blocked'].includes(document.documentElement.dataset.campusIntroState)),'Media failure not handled');});
  await scenario('slow first frame exits within startup budget',{},async(c,p)=>{await c.route('**/assets/media/campus-intro.mp4',async r=>{await new Promise(resolve=>setTimeout(resolve,1600));await r.abort().catch(()=>{});});await p.goto(base+'/',{waitUntil:'domcontentloaded'});await clean(p);assert(await p.evaluate(()=>document.documentElement.dataset.campusIntroState==='slow-start'),'Slow media not skipped');});
  await scenario('blocked autoplay does not block home',{},async(c,p)=>{await c.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('blocked','NotAllowedError'));};});await p.goto(base+'/');await clean(p);assert(await p.evaluate(()=>document.documentElement.dataset.campusIntroState==='autoplay-blocked'),'Autoplay rejection not handled');});
  await scenario('late intro script does not block DOM or appear over an already loaded page',{},async(c,p,count)=>{
    await c.route('**/assets/js/first-visit.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.fulfill({response:await route.fetch()});});
    await p.goto(base+'/',{waitUntil:'domcontentloaded'});
    assert(await p.evaluate(()=>performance.now()<1500),'Intro script blocked DOMContentLoaded');
    await p.waitForFunction(k=>localStorage.getItem(k)==='1',key);await clean(p);assert(count()===0,'Late intro interrupted the loaded page');
  });
  await scenario('stalled playback has a hard timeout',{},async(c,p)=>{await c.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){queueMicrotask(()=>this.dispatchEvent(new Event('playing')));return Promise.resolve();};});await p.goto(base+'/',{waitUntil:'domcontentloaded'});await clean(p);assert(await p.evaluate(()=>document.documentElement.dataset.campusIntroState==='timeout'),'Hard timeout did not release home');});
  await scenario('two simultaneous tabs download at most once',{},async(c,p,count)=>{
    await c.addInitScript(()=>{Object.defineProperty(document,'hidden',{get:()=>false});});
    const other=await c.newPage();await Promise.all([p.goto(base+'/'),other.goto(base+'/')]);
    const overlays=(await p.locator('.campus-intro').count())+(await other.locator('.campus-intro').count());
    assert(overlays<=1&&count()===1,'Concurrent tabs duplicated video');
    for(const tab of [p,other]){if(await tab.locator('.campus-intro-skip').count())await tab.locator('.campus-intro-skip').click();await clean(tab);}
  });
  return results;
}
