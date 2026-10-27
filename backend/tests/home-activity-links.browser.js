async (page) => {
  const origin=new URL(page.url()).origin;
  const image={id:'00000000-0000-4000-8000-000000000001',url:'/assets/images/scale-lab-logo.png',alt:'测试活动封面'};
  const rows=[
    {slug:'smoke-older',title:'较早的活动',activityDate:'2023-01-01',cover:image,images:[image]},
    {slug:'smoke-newest',title:'最新无封面活动',activityDate:'2026-10-20',cover:null,images:[]},
    {slug:'smoke-third',title:'第三新的活动',activityDate:'2025-01-01',cover:image,images:[image]},
    {slug:'smoke-second',title:'第二新的活动',activityDate:'2026-01-01',cover:image,images:[image]}
  ];
  const pattern='**/api/v1/activities?locale=*';
  const handler=route=>route.fulfill({json:{data:rows}});
  await page.route(pattern,handler);
  try {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});await page.goto(origin+'/');
      await page.locator('#gallery .shot').first().waitFor();
      const links=await page.locator('#gallery a.shot').evaluateAll(nodes=>nodes.map(node=>({slug:new URL(node.href).searchParams.get('slug'),lang:new URL(node.href).searchParams.get('lang')})));
      if(JSON.stringify(links)!==JSON.stringify(['smoke-newest','smoke-second','smoke-third'].map(slug=>({slug,lang:'zh'})))) throw new Error('Home must contain exactly the newest three linked activities: '+JSON.stringify(links));
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Horizontal page overflow');
    }
    return 'PASS: latest 3 by date, clickable full cards, missing-cover activity retained, correct detail links, desktop/mobile';
  } finally {
    await page.unroute(pattern,handler);await page.goto(origin+'/');
  }
}
