import { Editor, Mark, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const renderer = window.ScaleRichRenderer;
const textPresets = new Set(["small", "lead", "emphasis"]);
const TextPreset = Mark.create({
  name:"textPreset",
  addAttributes(){return {preset:{default:"small"}};},
  parseHTML(){return [{tag:"span[data-text-preset]",getAttrs:element=>{
    const preset=element.getAttribute("data-text-preset");
    return textPresets.has(preset) ? {preset} : false;
  }}];},
  renderHTML({mark}){return ["span",{"data-text-preset":textPresets.has(mark.attrs.preset) ? mark.attrs.preset : "small"},0];}
});
const MediaImage = Node.create({
  name:"image",group:"block",atom:true,draggable:false,
  // A drag beginning on a picture should extend the document selection rather
  // than start native image dragging. Cut/paste can still move image blocks.
  addProseMirrorPlugins(){return [new Plugin({props:{decorations(state){
    const {from,to,empty}=state.selection;
    if(empty) return DecorationSet.empty;
    const decorations=[];
    state.doc.nodesBetween(from,to,(node,pos)=>{
      if(node.type.name==='image') decorations.push(Decoration.node(pos,pos+node.nodeSize,{class:'rich-image-in-selection'}));
    });
    return DecorationSet.create(state.doc,decorations);
  }}})];},
  addAttributes(){return {assetId:{default:null},caption:{default:""},width:{default:"large"},align:{default:"center"}};},
  // Only our own internal figures can be pasted; arbitrary image URLs never become assets.
  parseHTML(){return [{tag:"figure[data-asset-id]",getAttrs:el=>{
    const id=el.getAttribute("data-asset-id");
    const width=el.querySelector('img')?.getAttribute('data-width'),align=el.getAttribute('data-align');
    return /^[0-9a-f-]{36}$/i.test(id || "") ? {
      assetId:id,caption:el.hasAttribute('data-caption') ? el.getAttribute('data-caption') : el.querySelector("figcaption")?.textContent || "",
      width:['small','medium','large'].includes(width) ? width : 'large',
      align:['left','center','right'].includes(align) ? align : 'center'
    } : false;
  }}];},
  renderHTML({node}){
    const a=node.attrs;
    return ["figure",{"data-asset-id":a.assetId,"data-align":a.align,"data-caption":a.caption},
      ["img",{draggable:"false",src:"/api/admin/v1/assets/"+encodeURIComponent(a.assetId)+"/file","data-width":a.width,alt:a.caption || "媒体库图片"}],
      ["figcaption",{},a.caption || "选中图片后点击「图片设置」调整图注、宽度和对齐"]];
  }
});

function imageSettings(attrs) {
  return new Promise(resolve=>{
    const dialog=document.createElement("dialog");dialog.className="media-picker";
    dialog.innerHTML='<h2>图片设置</h2><form class="fields"><label>图注<input name="caption" maxlength="500"></label><label>宽度<select name="width"><option value="small">小图（48%）</option><option value="medium">中图（72%）</option><option value="large">通栏（100%）</option></select></label><label>对齐<select name="align"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><button type="submit">应用</button><button type="button" data-cancel>取消</button></form>';
    const form=dialog.querySelector("form");let result=null;
    ["caption","width","align"].forEach(k=>form.elements[k].value=attrs[k]);
    form.onsubmit=e=>{e.preventDefault();result=Object.fromEntries(new FormData(form));dialog.close();};
    dialog.querySelector("[data-cancel]").onclick=()=>dialog.close();
    dialog.onclose=()=>{dialog.remove();resolve(result);};
    document.body.append(dialog);dialog.showModal();
  });
}

function legacyDocument(body) {
  const text = String(body || "");
  const blocks = text.split(/\r?\n{2,}/).map(value => value.trim()).filter(Boolean);
  return {
    type: "doc",
    content: (blocks.length ? blocks : [""]).map(value => ({
      type: "paragraph",
      content: value ? [{ type: "text", text: value }] : []
    }))
  };
}

function safeHref(value) {
  const href = String(value || "").trim();
  if (!href || /[\u0000-\u0020]/.test(href)) return null;
  // Keep site links relative so moving from localhost to the public domain does not change their destination.
  if (/^\/(?![\/\\])/.test(href)) return href;
  try {
    const url = new URL(href);
    if (["http:", "https:"].includes(url.protocol)) return url.href;
  } catch (_) { /* invalid links are omitted */ }
  return null;
}

function createToolbar(root, editor, controller) {
  root.replaceChildren();
  const button = (label, title, command, attributes = {}) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "rich-tool";
    node.textContent = label;
    node.title = title;
    node.setAttribute("aria-label", title);
    Object.entries(attributes).forEach(([key, value]) => node.dataset[key] = value);
    node.addEventListener("mousedown", event => event.preventDefault());
    node.addEventListener("click", () => command());
    root.appendChild(node);
    return node;
  };
  const separator = () => {
    const node = document.createElement("span");
    node.className = "rich-tool-separator";
    node.setAttribute("aria-hidden", "true");
    root.appendChild(node);
  };
  const update = () => {
    root.querySelectorAll(".rich-tool[data-active]").forEach(node => node.removeAttribute("data-active"));
    root.querySelectorAll("[data-mark]").forEach(node => {
      if (editor.isActive(node.dataset.mark)) node.dataset.active = "true";
    });
    root.querySelectorAll("[data-preset]").forEach(node => {
      if (editor.isActive("textPreset", {preset:node.dataset.preset})) node.dataset.active = "true";
    });
  };

  button("全选图文", "选中整篇文字和图片（Ctrl+A / ⌘A）", () => editor.chain().focus().selectAll().run());
  button("B", "粗体（Ctrl+B）", () => editor.chain().focus().toggleBold().run(), { mark: "bold" });
  button("I", "斜体（Ctrl+I）", () => editor.chain().focus().toggleItalic().run(), { mark: "italic" });
  button("U", "下划线", () => editor.chain().focus().toggleUnderline().run(), { mark: "underline" });
  button("S", "删除线", () => editor.chain().focus().toggleStrike().run(), { mark: "strike" });
  button("Code", "行内代码", () => editor.chain().focus().toggleCode().run(), { mark: "code" });
  separator();
  button("正文", "正文段落", () => editor.chain().focus().setParagraph().run());
  button("H2", "二级标题", () => editor.chain().focus().toggleHeading({ level: 2 }).run());
  button("H3", "三级标题", () => editor.chain().focus().toggleHeading({ level: 3 }).run());
  separator();
  button("标准字", "恢复正文标准字号", () => editor.chain().focus().unsetMark("textPreset").run());
  button("小字", "使用主题小字号", () => editor.chain().focus().setMark("textPreset", {preset:"small"}).run(), {preset:"small"});
  button("导语", "使用主题导语字号", () => editor.chain().focus().setMark("textPreset", {preset:"lead"}).run(), {preset:"lead"});
  button("强调", "使用主题强调文字", () => editor.chain().focus().setMark("textPreset", {preset:"emphasis"}).run(), {preset:"emphasis"});
  separator();
  button("• 列表", "无序列表", () => editor.chain().focus().toggleBulletList().run());
  button("1. 列表", "有序列表", () => editor.chain().focus().toggleOrderedList().run());
  button("引用", "引用块", () => editor.chain().focus().toggleBlockquote().run());
  button("分隔线", "插入分隔线", () => editor.chain().focus().setHorizontalRule().run());
  separator();
  button("左对齐", "左对齐", () => editor.chain().focus().setTextAlign("left").run());
  button("居中", "居中对齐", () => editor.chain().focus().setTextAlign("center").run());
  button("右对齐", "右对齐", () => editor.chain().focus().setTextAlign("right").run());
  button("两端", "两端对齐", () => editor.chain().focus().setTextAlign("justify").run());
  button("链接", "插入或编辑链接", () => {
    const current = editor.getAttributes("link").href || "";
    const value = window.prompt("请输入 http(s) 链接或本站路径（如 /people.html）", current);
    if (value === null) return;
    if (!value.trim()) return editor.chain().focus().unsetLink().run();
    const href = safeHref(value);
    if (!href) return window.alert("链接必须是 http(s) 地址或本站路径。");
    editor.chain().focus().setLink({ href, target: "_blank", rel: "noopener noreferrer" }).run();
  });
  button("插入图片","从媒体库插入图片",async()=>{
    const asset=await window.ScaleMedia.pick();
    if(!asset || editor.isDestroyed) return;
    controller.options.media[asset.id]={...asset,url:"/api/admin/v1/assets/"+asset.id+"/file",alt:asset.altZh,available:asset.status==="active" && asset.copyright && asset.people};
    editor.chain().focus().insertContent({type:"image",attrs:{assetId:asset.id,caption:"",width:"large",align:"center"}}).run();
  });
  button("图片设置","先选中正文中的图片，再调整图注、宽度和对齐",async()=>{
    if(!editor.isActive("image")) return window.alert("请先点击正文中的图片。");
    const position=editor.state.selection.from,assetId=editor.getAttributes("image").assetId;
    const result=await imageSettings(editor.getAttributes("image"));
    if(result && !editor.isDestroyed && editor.state.doc.nodeAt(position)?.attrs.assetId===assetId)
      editor.chain().focus().setNodeSelection(position).updateAttributes("image",result).run();
  });
  button("撤销", "撤销（Ctrl+Z）", () => editor.chain().focus().undo().run());
  button("重做", "重做（Ctrl+Shift+Z）", () => editor.chain().focus().redo().run());
  editor.on("selectionUpdate", update);
  editor.on("transaction", update);
  update();
}

class RichEditorController {
  constructor(options) {
    this.options = options;
    this.options.media ||= {};
    this.root = options.root;
    this.preview = options.preview;
    this.toolbar = options.toolbar;
    this.editor = new Editor({
      element: options.element,
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] } }),
        Underline,
        TextPreset,
        MediaImage,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Link.configure({
          openOnClick: false,
          protocols: ["http", "https"],
          validate: href => Boolean(safeHref(href))
        })
      ],
      content: options.value || legacyDocument(options.body),
      onUpdate: ({ editor }) => {
        this.render();
        options.onChange?.(this.getJSON(), this.getText());
      }
    });
    createToolbar(this.toolbar, this.editor,this);
    this.render();
  }

  getJSON() { return {...this.editor.getJSON(),schemaVersion:1}; }
  getText() { return this.editor.getText({ blockSeparator: "\n\n" }); }
  setJSON(value, fallbackBody = "") {
    this.editor.commands.setContent(value || legacyDocument(fallbackBody), false);
    this.render();
  }
  render() {
    if (!this.preview || !renderer) return;
    renderer.render(this.preview, this.getJSON(), { className: "rich-document-preview",media:this.options.media });
  }
  destroy() { this.editor.destroy(); }
}

window.ScaleRichEditor = {
  create(options) { return new RichEditorController(options); },
  legacyDocument
};
