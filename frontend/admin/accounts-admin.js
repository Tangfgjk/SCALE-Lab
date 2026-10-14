(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var api = window.scaleAdmin.api, esc = window.scaleAdmin.escapeHtml;
  function message(id, value, error) { var node = $(id); node.textContent = value; node.classList.toggle("error", !!error); }
  async function list() {
    if (window.scaleAdmin.currentUser?.role !== "admin") return;
    try {
      var users = await api("/api/admin/v1/users");
      var root = $("accounts-list"); root.replaceChildren();
      users.forEach(function (user) {
        var row = document.createElement("div"); row.className = "list-row";
        row.innerHTML = '<div><strong>' + esc(user.displayName) + '</strong><small>' + esc(user.login || "学校身份") + ' · ' + (user.role === "admin" ? "管理员" : "内容人员") + ' · ' + (user.isActive ? "已启用" : "已停用") + '</small></div>';
        var button = document.createElement("button"); button.type = "button"; button.textContent = "编辑";
        button.addEventListener("click", function () { editor(row, user, button); });
        row.appendChild(button); root.appendChild(row);
      });
      if (!users.length) root.innerHTML = '<div class="empty">暂无账号</div>';
      var actor = $("audit-actor"), selected = actor.value;
      actor.innerHTML = '<option value="">全部人员</option>' + users.map(function (user) { return '<option value="' + esc(user.id) + '">' + esc(user.displayName) + ' · ' + esc(user.login || "学校身份") + '</option>'; }).join("");
      actor.value = selected;
    } catch (error) { $("accounts-list").textContent = error.message; }
  }
  function editor(row, user, button) {
    var prior = row.querySelector(".account-inline-editor");
    if (prior) { prior.remove(); button.textContent = "编辑"; return; }
    button.textContent = "收起";
    var panel = document.createElement("div"); panel.className = "account-inline-editor";
    panel.innerHTML = '<label>显示名<input name="displayName" maxlength="100" value="' + esc(user.displayName) + '"></label>' +
      '<label>角色<select name="role"><option value="content_manager">内容人员</option><option value="admin">管理员</option></select></label>' +
      '<label><input name="isActive" type="checkbox"> 启用账号</label>' +
      '<div class="editor-actions"><button type="button" data-save>保存账号</button></div>' +
      '<label>重置密码 <small>12–128 个字符；重置后该账号所有会话失效</small><input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label>' +
      '<div class="editor-actions"><button type="button" data-reset>重置密码</button></div><p class="message" role="status"></p>';
    panel.querySelector('[name="role"]').value = user.role;
    panel.querySelector('[name="isActive"]').checked = user.isActive;
    if (user.id === window.scaleAdmin.currentUser?.id) { panel.querySelector('[name="role"]').disabled = true; panel.querySelector('[name="isActive"]').disabled = true; }
    panel.querySelector("[data-save]").addEventListener("click", async function () {
      try {
        await api("/api/admin/v1/users/" + user.id, { method: "PATCH", body: JSON.stringify({ displayName: panel.querySelector('[name="displayName"]').value,
          role: panel.querySelector('[name="role"]').value, isActive: panel.querySelector('[name="isActive"]').checked }) });
        await list();
      } catch (error) { panel.querySelector(".message").textContent = error.message; panel.querySelector(".message").classList.add("error"); }
    });
    panel.querySelector("[data-reset]").addEventListener("click", async function () {
      try {
        await api("/api/admin/v1/users/" + user.id + "/reset-password", { method: "POST", body: JSON.stringify({ password: panel.querySelector('[name="password"]').value }) });
        panel.querySelector('[name="password"]').value = "";
        panel.querySelector(".message").textContent = "密码已更新，旧会话已失效。";
        panel.querySelector(".message").classList.remove("error");
      } catch (error) { panel.querySelector(".message").textContent = error.message; panel.querySelector(".message").classList.add("error"); }
    });
    row.appendChild(panel);
  }
  $("account-create-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
      var values = Object.fromEntries(new FormData(event.target).entries());
      await api("/api/admin/v1/users", { method: "POST", body: JSON.stringify(values) });
      event.target.reset(); await list(); message("account-create-message", "账号已创建。请通过可信渠道告知使用者初始密码。", false);
    } catch (error) { message("account-create-message", error.message, true); }
  });
  $("own-password-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    try {
      var values = Object.fromEntries(new FormData(event.target).entries());
      await api("/api/admin/v1/me/password", { method: "POST", body: JSON.stringify(values) });
      event.target.reset(); message("own-password-message", "密码已更新，其他会话已退出。", false);
    } catch (error) { message("own-password-message", error.message, true); }
  });
  $("accounts-refresh").addEventListener("click", list);
  window.accountsAdmin = { show: list };
})();
