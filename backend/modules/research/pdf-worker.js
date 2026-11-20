"use strict";
const {parentPort,workerData}=require('node:worker_threads');
const {PDFDocument,PDFDict,PDFArray,PDFName,PDFRef,PDFString,PDFHexString}=require('pdf-lib');
(async()=>{
  const pdf=await PDFDocument.load(workerData,{ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true});
  if(pdf.isEncrypted)throw Error('不接受加密 PDF');
  const pages=pdf.getPageCount();if(pages<1||pages>2000)throw Error('PDF 页数须为 1–2000');
  const blocked=new Set(['JavaScript','JS','OpenAction','AA','Launch','EmbeddedFiles','RichMedia','XFA','AcroForm','SubmitForm','ImportData']);
  const seen=new Set();let visits=0;
  function visit(obj){
    if(++visits>200000)throw Error('PDF 结构过于复杂');
    if(!obj||seen.has(obj))return;seen.add(obj);
    if(obj instanceof PDFRef){visit(pdf.context.lookup(obj));return}
    if(obj instanceof PDFDict){const uri=pdf.context.lookup(obj.get(PDFName.of('URI')));if(uri){if(!(uri instanceof PDFString||uri instanceof PDFHexString)||!/^https?:\/\/|^mailto:/i.test(uri.decodeText().trim()))throw Error('PDF 含不支持的链接协议')}}
    if(obj instanceof PDFDict)for(const [key,value] of obj.entries()){if(blocked.has(key.decodeText()))throw Error('PDF 包含脚本、表单或附件等主动内容，请上传普通静态 PDF');if(value instanceof PDFName&&blocked.has(value.decodeText()))throw Error('PDF 包含不支持的主动内容');visit(value)}
    if(obj instanceof PDFArray)for(let i=0;i<obj.size();i++)visit(obj.get(i));
    if(obj.dict)visit(obj.dict);
  }
  for(const [,obj] of pdf.context.enumerateIndirectObjects())visit(obj);
  parentPort.postMessage({pages});
})().catch(error=>parentPort.postMessage({error:error.message}));
