import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
const base=new URL('./',import.meta.url);
GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',base).href;
export async function mount(holder,url){
  holder.replaceChildren();const controls=document.createElement('div'),previous=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span'),canvas=document.createElement('canvas'),status=document.createElement('p');
  controls.className='research-pagination';previous.type=next.type='button';previous.textContent='上一页';next.textContent='下一页';status.textContent='正在加载 PDF…';status.setAttribute('role','status');controls.append(previous,count,next);holder.append(status,controls,canvas);canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.setAttribute('aria-label','PDF 页面预览');
  const task=getDocument({url,isEvalSupported:false,enableXfa:false,cMapUrl:new URL('pdf-cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('pdf-fonts/',base).href,wasmUrl:new URL('pdf-wasm/',base).href});
  let pdfDocument,page=1,rendering=false,destroyed=false;
  async function render(){if(rendering||destroyed)return;rendering=true;previous.disabled=next.disabled=true;try{const pdfPage=await pdfDocument.getPage(page),natural=pdfPage.getViewport({scale:1});let scale=Math.min(1000,Math.max(250,holder.clientWidth||800))/natural.width;scale=Math.min(scale,3500/natural.height);const viewport=pdfPage.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);if(viewport.width*viewport.height*ratio*ratio>12_000_000)throw Error('页面过大，请使用打开 PDF 阅读');canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;status.textContent='';count.textContent=page+' / '+pdfDocument.numPages;canvas.dataset.pdfRendered='true'}catch(error){if(!destroyed)status.textContent='预览暂不可用，可点击“打开 PDF”或“下载”阅读。'}finally{rendering=false;if(!destroyed){previous.disabled=page<=1;next.disabled=page>=pdfDocument.numPages}}}
  previous.onclick=()=>{if(!rendering&&page>1){page--;render()}};next.onclick=()=>{if(!rendering&&page<pdfDocument.numPages){page++;render()}};
  try{pdfDocument=await task.promise;await render()}catch{status.textContent='PDF 预览暂不可用，请使用打开或下载入口。';controls.hidden=true}
  return{destroy(){destroyed=true;task.destroy();holder.replaceChildren()}};
}
