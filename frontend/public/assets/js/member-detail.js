(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const slug = new URLSearchParams(location.search).get("slug") || "";
  let sequence = 0;
  function renderDetails(text) {
    const root = $("member-detail-content"), toc = $("member-detail-toc"); root.replaceChildren(); toc.replaceChildren();
    let section = root, list = null, index = 0;
    for (const line of text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
      if (line.startsWith("## ")) {
        section = document.createElement("section"); section.id = "profile-section-" + index++; section.className = "member-profile-section";
        const title = document.createElement("h2"); title.textContent = line.slice(3); section.append(title); root.append(section);
        const link = document.createElement("a"); link.href = "#" + section.id; link.textContent = title.textContent; toc.append(link); list = null;
      } else if (line.startsWith("- ")) {
        if (!list) { list = document.createElement("ul"); section.append(list); }
        const item = document.createElement("li"); item.textContent = line.slice(2); list.append(item);
      } else { list = null; const p = document.createElement("p"); p.textContent = line; section.append(p); }
    }
    toc.hidden = !toc.childElementCount;
  }
  async function load() {
    const request = ++sequence, en = document.documentElement.lang === "en";
    $("member-detail").hidden = true; $("member-detail-status").hidden = false;
    $("member-detail-status").textContent = en ? "Loading profile…" : "正在加载成员资料…";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { $("member-detail-status").textContent = en ? "Invalid profile link." : "成员链接无效。"; return; }
    try {
      const response = await fetch("/api/v1/members/" + encodeURIComponent(slug) + "?locale=" + (en ? "en" : "zh"));
      if (request !== sequence) return;
      if (response.status === 404) { $("member-detail-status").textContent = en ? "This profile is not available in English or has been withdrawn." : "该成员资料尚未发布或已撤回。"; return; }
      if (!response.ok) throw new Error();
      const { data: member } = await response.json(); if (request !== sequence) return;
      $("member-detail-name").textContent = member.nameZh + (member.nameEn ? " · " + member.nameEn : "");
      $("member-detail-role").textContent = member.role; $("member-detail-bio").textContent = member.bio;
      const photo = $("member-detail-photo"); photo.hidden = !member.photo;
      if (member.photo) { photo.src = member.photo; photo.alt = member.nameZh; } else photo.removeAttribute("src");
      $("member-detail-interests").replaceChildren();
      for (const interest of member.interests || []) { const tag = document.createElement("span"); tag.className = "advisor-honor"; tag.textContent = interest; $("member-detail-interests").append(tag); }
      renderDetails(member.profileDetails || "");
      document.title = member.nameZh + " · SCALE Lab";
      $("member-detail-status").hidden = true; $("member-detail").hidden = false;
    } catch (_) { if (request === sequence) $("member-detail-status").textContent = en ? "Profile unavailable. Please try again." : "成员资料暂时无法加载，请稍后重试。"; }
  }
  document.addEventListener("scale-lab-language-change", load);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
