"use strict";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = message => Object.assign(new Error(message), { status:400, code:"INVALID_RICH_TEXT" });
const blocks = ["paragraph","heading","bulletList","orderedList","blockquote","horizontalRule","image","codeBlock"];
function richTextOf(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { throw invalid("正文 JSON 无效"); } }
  if (!value || value.type !== "doc" || (value.schemaVersion !== undefined && value.schemaVersion !== 1)) throw invalid("正文版本或根节点无效");
  if (Buffer.byteLength(JSON.stringify(value)) > 500000) throw invalid("正文 JSON 不能超过 500 KB");
  let count=0, textLength=0, imageCount=0;
  function walk(node, parent, depth) {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth>20 || ++count>5000) throw invalid("正文节点或层级超出限制");
    const type=node.type, attrs=node.attrs || {};
    const allowed=parent===null ? ["doc"] : ["paragraph","heading","codeBlock"].includes(parent) ? ["text","hardBreak"] :
      ["bulletList","orderedList"].includes(parent) ? ["listItem"] : blocks;
    if (!allowed.includes(type)) throw invalid("正文包含不支持的节点或嵌套：" + type);
    const result={type};
    if (type==="text") {
      if (typeof node.text!=="string" || !node.text || node.content) throw invalid("文本节点无效");
      textLength+=node.text.length;
      if (textLength>30000) throw invalid("正文最多 30000 字");
      result.text=node.text;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length>7) throw invalid("文字格式无效");
        result.marks=node.marks.map(mark=>{
          if (!mark || !["bold","italic","underline","strike","code","link","textPreset"].includes(mark.type)) throw invalid("不支持的文字格式");
          if (mark.type==="textPreset") {
            const preset=mark.attrs?.preset;
            if (!["small","lead","emphasis"].includes(preset)) throw invalid("文字档位无效");
            return {type:"textPreset",attrs:{preset}};
          }
          if (mark.type!=="link") return {type:mark.type};
          const href=mark.attrs?.href;
          if (typeof href!=="string" || href.length>2000 || !href.trim() || /[\u0000-\u0020]/.test(href)) throw invalid("链接地址无效");
          const url=new URL(href,"https://scale.invalid");
          if (!["http:","https:"].includes(url.protocol) || (!/^https?:\/\//i.test(href) && !/^\/(?!\/)/.test(href))) throw invalid("链接只支持 http(s) 或本站路径");
          return {type:"link",attrs:{href,target:"_blank",rel:"noopener noreferrer"}};
        });
      }
    } else if (type==="image") {
      if (++imageCount>50 || !uuid.test(attrs.assetId || "") || attrs.src !== undefined || node.content) throw invalid("图片必须引用媒体库资产，每篇最多 50 张");
      if (!["small","medium","large"].includes(attrs.width || "large") || !["left","center","right"].includes(attrs.align || "center")) throw invalid("图片尺寸或对齐无效");
      if (typeof (attrs.caption || "")!=="string" || (attrs.caption || "").length>500) throw invalid("图注最多 500 字");
      result.attrs={assetId:attrs.assetId.toLowerCase(),caption:attrs.caption || "",width:attrs.width || "large",align:attrs.align || "center"};
    } else if (["hardBreak","horizontalRule"].includes(type)) {
      if (node.content) throw invalid("分隔节点不能有子内容");
    } else {
      if (node.content!==undefined && !Array.isArray(node.content)) throw invalid("子节点须为数组");
      result.content=(node.content || []).map(child=>walk(child,type,depth+1));
      if (["doc","bulletList","orderedList","listItem","blockquote"].includes(type) && !result.content.length) throw invalid("正文结构不能为空");
      if (type==="listItem" && result.content[0]?.type!=="paragraph") throw invalid("列表项须以段落开始");
      if (type==="heading") {
        if (![2,3].includes(attrs.level)) throw invalid("标题只支持二级和三级");
        result.attrs={level:attrs.level};
      }
      if (["heading","paragraph"].includes(type) && attrs.textAlign) {
        if (!["left","center","right","justify"].includes(attrs.textAlign)) throw invalid("段落对齐无效");
        result.attrs={...result.attrs,textAlign:attrs.textAlign};
      }
      if (type==="orderedList") {
        const start=attrs.start ?? 1;
        if (!Number.isInteger(start) || start<1 || start>10000) throw invalid("列表起始编号无效");
        result.attrs={start};
      }
    }
    return result;
  }
  return {...walk(value,null,0),schemaVersion:1};
}
function plainTextOf(doc) {
  function text(node) {
    if (node.type==="text") return node.text;
    if (node.type==="hardBreak") return "\n";
    if (node.type==="image") return "";
    return (node.content || []).map(text).join(["paragraph","heading","codeBlock"].includes(node.type) ? "" : "\n\n");
  }
  return doc ? text(doc).trim() : "";
}
function imageIds(doc) {
  const ids=[];
  function walk(node) { if(node.type==="image") ids.push(node.attrs.assetId); (node.content || []).forEach(walk); }
  if(doc) walk(doc);
  return ids;
}
module.exports={richTextOf,plainTextOf,imageIds,uuid};
