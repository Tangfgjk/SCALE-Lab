(function () {
  "use strict";
  var pairedSourceForms = new Set(["research-form", "member-form", "album-form", "settings-form"]);
  var selectedRequired = {
    "research-form": ["locale", "stage", "projectStatus"],
    "member-form": ["locale", "category"],
    "album-form": ["locale"],
    "settings-form": ["locale"],
    "account-create-form": ["role"]
  };
  var explanations = {
    "research-form": {
      slug: "内容的固定地址标识，创建后不能修改。",
      locale: "先保存中文版，再编辑英文版。",
      sourceUrl: "与来源说明任选一项填写，供后台核查。",
      sourceNote: "与来源链接任选一项填写，供后台核查。",
      themeNumber: "正式公开的三个研究方向分别使用 1、2、3。",
      stage: "区分已发表、已接收、出版中和预印本。",
      projectStatus: "项目进度，与网站内容的发布状态不同。",
      grantCode: "资助方分配的项目编号；没有可留空。"
    },
    "member-form": {
      slug: "成员档案的固定地址标识，创建后不能修改。",
      category: "决定成员出现在团队页的哪个分组。",
      sourceUrl: "与来源说明任选一项填写，供后台核查。",
      sourceNote: "与来源链接任选一项填写，供后台核查。",
      displayOrder: "数值越小，组内排序越靠前。"
    },
    "album-form": {
      slug: "相册的固定地址标识，创建后不能修改。",
      sourceUrl: "与来源说明任选一项填写，供后台核查。",
      sourceNote: "与来源链接任选一项填写，供后台核查。",
      activityDate: "照片对应活动的实际日期。"
    },
    "media-upload-form": {
      altZh: "描述图片内容；启用公开图片前必须补齐。",
      credit: "摄影或图片署名；启用公开图片前必须补齐。"
    },
    "settings-form": {
      heroTitleBefore: "若填写首页标题主文案，也须填写强调文字。",
      heroHighlight: "若填写强调文字，也须填写首页标题主文案。",
      newsSlugs: "留空展示全部已发布新闻；填写后仅展示所选新闻。",
      sourceUrl: "与来源说明任选一项填写，供后台核查。",
      sourceNote: "与来源链接任选一项填写，供后台核查。"
    },
    "account-create-form": { role: "内容人员可编辑和发布；管理员还可管理账号。" }
  };

  function refresh() {
    document.querySelectorAll(".workspace form label").forEach(function (label) {
      var control = label.querySelector("input[name],textarea[name],select[name]");
      if (!control || control.closest("#news-form")) return;
      var form = control.closest("form");
      if (!form) return;
      var paired = pairedSourceForms.has(form.id) && (control.name === "sourceUrl" || control.name === "sourceNote");
      var required = control.required || (selectedRequired[form.id] || []).includes(control.name);
      var badge = label.querySelector(":scope > .field-status");
      if (!badge) {
        badge = document.createElement("small");
        badge.className = "field-status";
        label.insertBefore(badge, control);
      }
      badge.textContent = paired ? "二选一必填" : required ? "必填" : "选填";
      badge.className = "field-status" + (paired ? " paired" : required ? "" : " optional");
      var note = explanations[form.id] && explanations[form.id][control.name];
      if (note && !label.querySelector(":scope > .field-guide-note")) {
        var help = document.createElement("small");
        help.className = "field-guide-note";
        help.textContent = note;
        label.insertBefore(help, control);
      }
    });
  }
  window.refreshFieldGuide = refresh;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);
  else refresh();
})();
