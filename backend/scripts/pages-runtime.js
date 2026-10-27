/* Copied into the static export only; never loaded by the dynamic website. */
(function(){
  'use strict';
  const nativeFetch=window.fetch.bind(window),base=new URL('./',document.currentScript.src);
  const snapshot=nativeFetch(new URL('snapshot-data.json',base)).then(r=>{if(!r.ok)throw Error('Snapshot unavailable');return r.json()});
  function localize(value){
    if(typeof value==='string'&&/^media\//.test(value))return new URL(value,base).href;
    if(Array.isArray(value))return value.map(localize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,localize(v)]));
    return value;
  }
  window.fetch=async function(input,options){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
    if((options?.method||input.method||'GET')!=='GET')return new Response('{}',{status:405});
    const locale=url.searchParams.get('locale')==='en'?'en':'zh';
    const item=(await snapshot)[url.pathname+'?locale='+locale];
    if(!item)return new Response(JSON.stringify({error:{message:'内容尚未发布'}}),{status:404});
    let body=localize(item.body);
    if(/^\/api\/v1\/(news|activities)$/.test(url.pathname)&&item.status===200){
      const all=body.data,page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||10);
      const q=(url.searchParams.get('q')||'').trim().toLowerCase(),year=url.searchParams.get('year')||'';
      if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100||(year&&!/^\d{4}$/.test(year))||q.length>200)return new Response('{}',{status:400});
      const date=x=>x.happenedAt||x.activityDate||'';
      const filtered=all.filter(x=>(!year||date(x).startsWith(year))&&(!q||(x.title+' '+x.summary).toLowerCase().includes(q)));
      body={data:filtered.slice((page-1)*pageSize,page*pageSize),meta:{total:filtered.length,page,pageSize,pages:Math.ceil(filtered.length/pageSize),years:[...new Set(all.map(x=>date(x).slice(0,4)).filter(Boolean))].sort().reverse()}};
      if(url.searchParams.get('view')==='overview')body.data=body.data.map(({images,...rest})=>rest);
    }
    return new Response(JSON.stringify(body),{status:item.status,headers:{'Content-Type':'application/json'}});
  };
})();
