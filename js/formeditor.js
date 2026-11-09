"use strict";
/* Consent form editor. Saving always creates a NEW template version; earlier versions are kept, and
   every signed form already holds its own copy of the wording it was signed with. */
const FormEditor = (() => {
  let E = null; // working copy
  const TYPES = { yesno: "Yes / No", check: "Checkbox (must agree)", text: "Short answer", choice: "Choose one" };
  const rid = () => "q" + Math.random().toString(36).slice(2, 8);

  function qRow(si, qi, q, last) {
    return `<div class="card" style="margin:10px 0;padding:12px" data-si="${si}" data-qi="${qi}">
      <input data-f="label" value="${esc(q.label)}" placeholder="Question or statement">
      ${q.type === "choice" ? `<textarea data-f="options" rows="3" placeholder="One choice per line" style="margin-top:8px">${esc((q.options || []).join("\n"))}</textarea>` : ""}
      <div class="actions" style="margin-top:10px;align-items:center">
        <select data-f="type" style="width:auto">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${q.type === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <label style="display:flex;gap:8px;align-items:center;margin:0;color:var(--fg)"><input type="checkbox" data-f="required" style="width:24px;height:24px" ${q.required ? "checked" : ""}> Required</label>
        ${q.type === "yesno" ? `<input data-f="detail" style="flex:1;min-width:180px" value="${esc(q.detail || "")}" placeholder="Ask for details if Yes (prompt text, optional)">` : ""}
        <button class="small" data-ed="up" ${qi === 0 ? "disabled" : ""}>↑</button><button class="small" data-ed="down" ${last ? "disabled" : ""}>↓</button>
        <button class="small danger" data-ed="delq">Remove</button></div></div>`;
  }
  const html = () => `${bar("Edit consent form", { back: "settings" })}
    <div class="banner warn" style="font-weight:400">Saving creates version ${nextVersion()}. Forms already signed keep the exact wording they were signed with.</div>
    <label for="e_name">Form name (for your reference)</label><input id="e_name" value="${esc(E.name)}">
    <label for="e_title">Title printed on the form</label><input id="e_title" value="${esc(E.title)}">
    <label for="e_priv">Privacy notice shown first to the client</label><textarea id="e_priv" rows="4">${esc(E.privacy || "")}</textarea>
    ${E.sections.map((s, si) => `<div class="card" data-sec="${si}"><label style="margin-top:0">Section heading</label>
      <input data-f="heading" value="${esc(s.heading)}">
      <label>Text shown before the questions (one paragraph per line; start a line with "- " for a bullet or "# " for a sub-heading)</label>
      <textarea data-f="body" rows="5">${esc((s.body || []).join("\n"))}</textarea>
      <label style="display:flex;gap:10px;align-items:center;color:var(--fg)"><input type="checkbox" data-f="initials" style="width:24px;height:24px" ${s.initials ? "checked" : ""}> Ask the client for initials in this section</label>
      ${s.questions.map((q, qi) => qRow(si, qi, q, qi === s.questions.length - 1)).join("")}
      <div class="actions"><button class="small" data-ed="addq" data-si="${si}">+ Add question</button><button class="small danger" data-ed="delsec" data-si="${si}">Remove section</button></div></div>`).join("")}
    <div class="actions"><button data-ed="addsec">+ Add section</button></div>
    <label for="e_agree">Agreement text (one paragraph per line)</label><textarea id="e_agree" rows="8">${esc(E.agreement.join("\n"))}</textarea>
    <div id="e_msg"></div>
    <div class="actions"><button class="primary" id="e_save">Save as new version</button><button class="ghost" data-go="settings">Cancel</button></div>`;
  const nextVersion = () => Math.max(0, ...DB.all("template").filter(t => t.key === E.key).map(t => t.version)) + 1;

  function collect(root) {
    E.name = $("#e_name", root).value; E.title = $("#e_title", root).value; E.privacy = $("#e_priv", root).value;
    E.agreement = $("#e_agree", root).value.split("\n").map(s => s.trim()).filter(Boolean);
    root.querySelectorAll("[data-sec]").forEach(secEl => {
      const s = E.sections[+secEl.dataset.sec];
      s.heading = secEl.querySelector('[data-f="heading"]').value;
      s.body = secEl.querySelector('[data-f="body"]').value.split("\n").map(x => x.trim()).filter(Boolean);
      s.initials = secEl.querySelector('[data-f="initials"]').checked;
      secEl.querySelectorAll("[data-qi]").forEach(qEl => {
        const q = s.questions[+qEl.dataset.qi], g = f => qEl.querySelector(`[data-f="${f}"]`);
        q.label = g("label").value; q.type = g("type").value; q.required = g("required").checked;
        if (q.type === "choice") q.options = (g("options") ? g("options").value : (q.options || []).join("\n")).split("\n").map(x => x.trim()).filter(Boolean); else delete q.options;
        if (q.type === "yesno") q.detail = (g("detail") ? g("detail").value.trim() : q.detail) || undefined; else delete q.detail;
      });
    });
  }
  const rerender = () => { $("#app").innerHTML = html(); screens.formEditor.bind($("#app")); };

  screens.formEditor = {
    html() {
      const t = Consent.activeTemplate();
      E = JSON.parse(JSON.stringify(t));
      E.privacy = E.privacy || Consent.defaultPrivacy;
      return html();
    },
    bind(root) {
      root.onchange = e => { if (e.target.dataset.f === "type") { collect(root); rerender(); } };
      root.onclick = async e => {
        const b = e.target.closest("[data-ed]");
        if (b) {
          collect(root);
          const si = +(b.dataset.si ?? b.closest("[data-si]")?.dataset.si ?? -1), qEl = b.closest("[data-qi]"), qi = qEl ? +qEl.dataset.qi : -1;
          const a = b.dataset.ed;
          if (a === "addsec") E.sections.push({ heading: "New section", questions: [] });
          else if (a === "delsec") { if (!confirm("Remove this whole section?")) return; E.sections.splice(si, 1); }
          else if (a === "addq") E.sections[si].questions.push({ id: rid(), type: "yesno", label: "", required: true });
          else if (a === "delq") E.sections[si].questions.splice(qi, 1);
          else if (a === "up" || a === "down") { const arr = E.sections[si].questions, j = a === "up" ? qi - 1 : qi + 1; [arr[qi], arr[j]] = [arr[j], arr[qi]]; }
          rerender(); return;
        }
        if (e.target.id === "e_save") {
          collect(root);
          const empty = E.sections.some(s => s.questions.some(q => !q.label.trim()));
          const none = !E.sections.some(s => s.questions.length);
          const badChoice = E.sections.some(s => s.questions.some(q => q.type === "choice" && (q.options || []).length < 2));
          if (empty || none || badChoice || !E.agreement.length || !E.title.trim()) {
            $("#e_msg", root).innerHTML = `<div class="banner bad">${badChoice ? "A choose-one question needs at least two choices." : none ? "Add at least one question." : empty ? "Every question needs text." : !E.title.trim() ? "Add a title." : "Add the agreement text."}</div>`; return;
          }
          const v = nextVersion();
          await DB.put({ ...E, type: "template", id: `tpl-${E.key}-v${v}`, version: v, createdAt: new Date().toISOString() });
          go("settings");
        }
      };
    }
  };
  return {};
})();
