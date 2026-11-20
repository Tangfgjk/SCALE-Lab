(function(global){
  'use strict';
  const sharedBase=new URL('./',document.currentScript.src);
  const size=bytes=>bytes<1024*1024?Math.max(1,Math.ceil(bytes/1024))+' KB':(bytes/1024/1024).toFixed(2)+' MB';
  const types={paper:'论文',patent:'专利',software:'软件著作权'};
  function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e}
  function citation(item){return[item.authors,item.title,item.venue,item.metadata?.patentNumber||item.metadata?.registrationNumber,item.year,item.doi?'https://doi.org/'+item.doi:''].filter(Boolean).join('. ')+'.'}
  function render(container,item,options={}){
    container.querySelectorAll('[data-pdf-preview]').forEach(d=>d._destroyPDF?.());
    container.replaceChildren();container.classList.add('research-article');
    container.append(node('p',types[item.achievementType]||(item.projectStatus?'科研项目':'研究方向'),'eyebrow'),node('h1',item.title));
    container.append(node('p',[item.authors,item.venue,item.year].filter(Boolean).join(' · '),'research-meta'));
    if(item.summary)container.append(node('p',item.summary,'research-abstract'));
    const data=item.metadata||{},fields=item.projectStatus?{grantCode:'项目编号',fundingType:'资助类别',role:'承担角色',projectStatus:'项目状态',startsOn:'开始日期',endsOn:'结束日期'}:item.achievementType==='patent'?{patentType:'专利类型',patentStatus:'专利状态',applicationNumber:'申请号',patentNumber:'专利号',appliedOn:'申请日期',grantedOn:'授权日期'}:item.achievementType==='software'?{softwareVersion:'软件版本',registrationNumber:'登记号',registeredOn:'登记日期'}:{doi:'DOI',stage:'发表阶段'};
    const labels={unspecified:'来源未注明',planned:'计划中',ongoing:'在研',completed:'已结题',invention:'发明专利',utility:'实用新型',design:'外观设计',applied:'已申请',published:item.achievementType==='patent'?'已公开':'已发表',granted:'已授权',expired:'已失效',accepted:'已接收',in_press:'出版中',preprint:'预印本'};
    const dl=node('dl',undefined,'achievement-facts');for(const [key,label] of Object.entries(fields)){const value=data[key]||item[key];if(value)dl.append(node('dt',label),node('dd',labels[value]||value))}if(dl.childElementCount)container.append(dl);
    const imageIds=new Set();function visit(n){if(n?.type==='image')imageIds.add(n.attrs?.assetId);(n?.content||[]).forEach(visit)}visit(item.richText);
    if(item.cover&&!imageIds.has(item.cover.id)){const img=node('img');img.src=item.cover.url;img.alt=item.cover.alt||item.title;img.className='achievement-cover';container.append(img)}
    const body=node('div',undefined,'research-body');if(item.richText&&global.ScaleRichRenderer)global.ScaleRichRenderer.render(body,item.richText,{media:item.media||{},locale:options.locale||'zh'});else for(const text of (item.body||'').split(/\n\s*\n/).filter(Boolean))body.append(node('p',text));container.append(body);
    for(const area of item.areas||[]){body.append(node('h2',area.title));const ul=node('ul');for(const text of area.items||[])ul.append(node('li',text));body.append(ul)}
    if(data.keywords?.length)container.append(node('p','关键词：'+data.keywords.join(' · '),'research-keywords'));
    if(item.externalUrl||item.doi){const a=node('a',item.doi?'论文 DOI / 原文 ↗':'查看原始资料 ↗','text-link');a.href=item.externalUrl||(item.doi?'https://doi.org/'+item.doi:'');a.target='_blank';a.rel='noopener noreferrer';container.append(a)}
    for(const [key,label] of [['codeUrl','代码仓库 ↗'],['demoUrl','系统演示 ↗']])if(data[key]){const a=node('a',label,'text-link');a.href=data[key];a.target='_blank';a.rel='noopener noreferrer';container.append(a)}
    const attachments=node('section',undefined,'achievement-attachments');
    if(item.documents?.length){attachments.append(node('h2','PDF 附件'));for(const d of item.documents){const row=node('div',undefined,'attachment-row');row.append(node('strong',d.label||d.displayName),node('small',`${d.pages} 页 · ${size(d.bytes)}${options.admin&&!d.isPublic?' · 仅后台':''}`));const open=node('a','打开 PDF ↗');open.href=d.url;open.target='_blank';open.rel='noopener noreferrer';const download=node('a','下载');download.href=d.url+(d.url.includes('?')?'&':'?')+'download=1';download.download=(d.displayName||d.label||'document')+'.pdf';row.append(open,download);if(!options.admin){const details=node('details'),preview=node('div');details.dataset.pdfPreview='true';details.append(node('summary','在线预览'),preview);let viewer=null,token=0;details._destroyPDF=()=>{token++;viewer?.destroy();viewer=null;preview.replaceChildren()};details.ontoggle=async()=>{if(!details.open){details._destroyPDF();return}const seq=++token;preview.textContent='正在准备 PDF 预览…';try{const module=await import(new URL('pdf-viewer.mjs',sharedBase).href);if(!details.open||seq!==token)return;const result=await module.mount(preview,d.url);if(!details.open||seq!==token){result.destroy();return}viewer=result}catch{preview.textContent='预览暂不可用，请使用打开或下载入口。'}};row.append(details)}attachments.append(row)}container.append(attachments)}
    if(item.links?.length){const section=node('section',undefined,'achievement-relations');section.append(node('h2','相关研究与团队'));for(const link of item.links){if(link.published===false){section.append(node('span',link.title+'（未公开，仅后台）'));continue}const a=node('a',link.title);a.href=link.type==='member'?'member.html?slug='+encodeURIComponent(link.slug):'research-item.html?kind='+(link.type==='publication'?'publications':link.type==='direction'?'research-directions':'projects')+'&slug='+encodeURIComponent(link.slug);section.append(a)}container.append(section)}
  }
  global.ScaleResearchArticle={render,citation,types};
})(window);
