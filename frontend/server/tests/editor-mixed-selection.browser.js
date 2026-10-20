async (page) => {
  const fixtureURL='**/api/admin/v1/assets/00000000-0000-4000-8000-000000000001/file';
  await page.route(fixtureURL, route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>'}));
  const result = await page.evaluate(() => {
    const holder=document.createElement('section');holder.id='mixed-selection-test';
    const toolbar=document.createElement('div'),surface=document.createElement('div');surface.className='rich-editor-surface';holder.append(toolbar,surface);document.body.append(holder);
    const c=ScaleRichEditor.create({element:surface,toolbar,value:{type:'doc',content:[
      {type:'paragraph',content:[{type:'text',text:'图片之前的文字'}]},
      {type:'image',attrs:{assetId:'00000000-0000-4000-8000-000000000001',caption:'',width:'medium',align:'left'}},
      {type:'paragraph',content:[{type:'text',text:'图片之后的文字'}]}
    ]}});
    const original=JSON.stringify(c.getJSON());
    c.editor.commands.setTextSelection({from:1,to:c.editor.state.doc.content.size-1});
    const hasImage=c.editor.state.selection.content().content.toJSON().some(n=>n.type==='image');
    const highlighted=!!surface.querySelector('.rich-image-in-selection');
    const notDraggable=!surface.querySelector('figure').draggable && !surface.querySelector('img').draggable;
    c.editor.chain().focus().deleteSelection().run();
    const deleted=!c.getText() && !surface.querySelector('figure');
    c.editor.commands.undo();const restored=original===JSON.stringify(c.getJSON());
    const select=[...toolbar.querySelectorAll('button')].find(b=>b.textContent==='全选图文');
    if(select) select.click();
    const all=!!select && c.editor.state.selection.from===0 && c.editor.state.selection.to===c.editor.state.doc.content.size;
    const slice=c.editor.state.selection.content();
    const serialized=c.editor.view.serializeForClipboard(slice);
    const clipboard=!!serialized.dom.querySelector('figure[data-asset-id]') && serialized.dom.textContent.includes('图片之前的文字') && serialized.dom.textContent.includes('图片之后的文字');
    c.editor.commands.setContent(serialized.dom.innerHTML);
    const pasted=c.getJSON().content.find(n=>n.type==='image');
    const pasteLayout=pasted.attrs.width==='medium' && pasted.attrs.align==='left' && pasted.attrs.caption==='';
    c.destroy();holder.remove();
    return {hasImage,highlighted,notDraggable,deleted,restored,all,clipboard,pasteLayout};
  });
  await page.waitForTimeout(150);
  await page.unroute(fixtureURL);
  if(Object.values(result).some(value=>!value)) throw new Error('Mixed selection regression: '+JSON.stringify(result));
  return result;
}
