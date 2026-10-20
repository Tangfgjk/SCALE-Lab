async (page) => {
  const origin=new URL(page.url()).origin;
  const assetId='00000000-0000-4000-8000-000000000001',slug='smoke-browser-activity';
  const image={id:assetId,url:'/api/v1/assets/'+assetId+'/file',alt:'测试图片',caption:'测试图注'};
  const richText={type:'doc',schemaVersion:1,content:[{type:'paragraph',content:[{type:'text',text:'完整活动正文'}]},{type:'image',attrs:{assetId,caption:'测试图注',width:'medium',align:'center'}}]};
  const activity={slug,title:'隔离活动界面测试',summary:'活动概览摘要',body:'完整活动正文',category:'activity',activityDate:'2026-10-20',happenedAt:'2026-10-20',location:'本地测试',cover:image,images:[image],media:{[assetId]:image},richText};
  const routes=[
    ['**/api/v1/activities?locale=*',route=>route.fulfill({json:{data:[activity]}})],
    ['**/api/v1/news/'+slug+'?locale=*',route=>route.fulfill({json:{data:activity}})],
    ['**/api/v1/assets/'+assetId+'/file',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#317b83"/></svg>'})]
  ];
  for(const [pattern,handler] of routes) await page.route(pattern,handler);
  const checks=[];
  try {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      await page.goto(origin+'/culture.html');
      const link=page.locator('#activity-gallery a').filter({hasText:'阅读完整活动图文'});
      await link.waitFor();
      if(await page.locator('#activity-gallery .activity-record').count()!==1) throw new Error('Activity record missing');
      if(await page.locator('#activity-gallery img').count()!==1) throw new Error('Gallery image missing');
      await link.click();await page.locator('#news-article:not([hidden])').waitFor();
      const info=await page.evaluate(()=>({width:innerWidth,body:document.querySelector('#news-article').textContent,
        back:document.querySelector('.news-back').getAttribute('href'),current:document.querySelector('.nav [aria-current="page"]').getAttribute('href'),
        overflow:document.documentElement.scrollWidth>innerWidth,images:document.querySelectorAll('#news-article img').length}));
      if(!info.body.includes('完整活动正文') || !info.body.includes('活动日期：2026-10-20 · 本地测试') || info.back!=='culture.html#activity-gallery' || info.current!=='culture.html' || info.overflow || info.images!==1) throw new Error(JSON.stringify(info));
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      await page.waitForFunction(()=>!document.querySelector('#back-to-top').hidden);
      await page.locator('#back-to-top').focus();await page.keyboard.press('Enter');
      await page.waitForFunction(()=>scrollY===0 && document.querySelector('#back-to-top').hidden);
      checks.push({...info,backToTop:true});
    }
  } finally {
    for(const [pattern,handler] of routes) await page.unroute(pattern,handler);
    await page.emulateMedia({reducedMotion:null});
    await page.goto(origin+'/admin/');
  }
  return checks;
}
