(function (global) {
  "use strict";

  const allowedMarks = new Set(["bold", "italic", "underline", "strike", "code"]);
  const allowedPresets = new Set(["small", "lead", "emphasis"]);
  const allowedAlign = new Set(["left", "center", "right", "justify"]);

  function textNode(text, marks) {
    let node = document.createTextNode(String(text || ""));
    (marks || []).filter(mark => allowedMarks.has(mark.type || mark) || (mark.type === "textPreset" && allowedPresets.has(mark.attrs?.preset))).forEach(mark => {
      const type = mark.type || mark;
      const wrapper = document.createElement(type === "bold" ? "strong" : type === "italic" ? "em" : type === "underline" ? "u" : type === "strike" ? "s" : type === "textPreset" ? "span" : "code");
      if (type === "textPreset") wrapper.dataset.textPreset = mark.attrs.preset;
      wrapper.appendChild(node);
      node = wrapper;
    });
    return node;
  }

  function safeLink(href) {
    const value = String(href || "").trim();
    if (!value || /[\u0000-\u0020]/.test(value)) return null;
    if (/^\/(?![\/\\])/.test(value)) return value;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }

  function appendInline(parent, nodes) {
    (nodes || []).forEach(node => {
      if (node.type === "text") {
        let child = textNode(node.text, node.marks);
        const link = (node.marks || []).find(mark => mark.type === "link");
        if (link) {
          const href = safeLink(link.attrs?.href);
          if (href) {
            const anchor = document.createElement("a");
            anchor.href = href;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.appendChild(child);
            child = anchor;
          }
        }
        parent.appendChild(child);
      } else if (node.type === "hardBreak") parent.appendChild(document.createElement("br"));
      else if (node.content) appendInline(parent, node.content);
    });
  }

  function appendBlock(parent, node, options) {
    if (!node) return;
    const type = node.type;
    if (type === "doc") return (node.content || []).forEach(child => appendBlock(parent, child, options));
    if (type === "paragraph" || type === "heading") {
      const tag = type === "heading" ? `h${Math.min(3, Math.max(2, Number(node.attrs?.level) || 2))}` : "p";
      const element = document.createElement(tag);
      if (allowedAlign.has(node.attrs?.textAlign)) element.style.textAlign = node.attrs.textAlign;
      appendInline(element, node.content);
      parent.appendChild(element);
      return;
    }
    if (type === "bulletList" || type === "orderedList") {
      const list = document.createElement(type === "orderedList" ? "ol" : "ul");
      if(type === "orderedList" && Number.isInteger(node.attrs?.start)) list.start=node.attrs.start;
      (node.content || []).forEach(item => appendBlock(list, item, options));
      parent.appendChild(list);
      return;
    }
    if (type === "listItem") {
      const item = document.createElement("li");
      (node.content || []).forEach(child => appendBlock(item, child, options));
      parent.appendChild(item);
      return;
    }
    if (type === "blockquote") {
      const quote = document.createElement("blockquote");
      (node.content || []).forEach(child => appendBlock(quote, child, options));
      parent.appendChild(quote);
      return;
    }
    if (type === "horizontalRule") {
      parent.appendChild(document.createElement("hr"));
      return;
    }
    if(type==="codeBlock") {
      const pre=document.createElement("pre"),code=document.createElement("code");
      appendInline(code,node.content);pre.append(code);parent.append(pre);return;
    }
    if (type === "image") {
      const asset=options.media?.[node.attrs?.assetId];
      const figure = document.createElement("figure");
      const placeholder=document.createElement("div");placeholder.className="media-placeholder";
      placeholder.textContent=options.locale==="en" ? "Image unavailable" : "图片暂不可用";
      const image = document.createElement("img");
      // Only server-resolved assets are rendered. Never trust a src stored inside the document.
      if(asset?.url && /^\/api\/(?:admin\/v1|v1)\/assets\/[0-9a-f-]{36}\/file$/i.test(asset.url)) image.src = asset.url;
      image.alt = String(asset?.alt || "");
      image.loading = "lazy";
      const width = ["small", "medium", "large"].includes(node.attrs?.width) ? node.attrs.width : "large";
      image.dataset.width = width;
      if (["left", "center", "right"].includes(node.attrs?.align)) figure.dataset.align = node.attrs.align;
      if(image.getAttribute("src")) {
        image.addEventListener("error",()=>image.replaceWith(placeholder),{once:true});
        figure.appendChild(image);
        if(asset.available===false) {const warning=document.createElement("p");warning.className="media-warning";warning.textContent="待核／未获准公开：发布前请在媒体库核对";figure.append(warning);}
      } else figure.append(placeholder);
      if (node.attrs?.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = node.attrs.caption;
        figure.appendChild(caption);
      }
      if(asset?.credit) {const credit=document.createElement("small");credit.textContent=asset.credit;figure.append(credit);}
      parent.appendChild(figure);
    }
  }

  function render(container, documentValue, options = {}) {
    container.replaceChildren();
    if (options.className) container.className = options.className;
    appendBlock(container, documentValue || { type: "doc", content: [] }, options);
  }

  global.ScaleRichRenderer = { render };
})(window);
