"use strict";

/* Artist-triggered sharing only. Nothing is sent until the artist chooses an app in the OS share sheet. */
const TextCopy = (() => {
  const MESSAGE = "Hi, thank you for choosing Dirtpickle. Your signed tattoo agreement and aftercare instructions are attached for your records. Mike Peterson, Tattoo Artist | Dirtpickle";
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const file = (name, b64) => new File([bytes(b64)], name, { type: "application/pdf" });
  const contractName = d => `${(d.clientSnapshot?.legalName || "client").replace(/[^a-z0-9]+/gi, "-")}-consent-${d.signedAt.slice(0, 10)}.pdf`;
  const marker = doc => DB.all("textcopy").find(r => r.docId === doc.id) || null;

  function download(name, b64) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes(b64)], { type: "application/pdf" }));
    a.download = name; a.click();
  }

  function fallback(doc, phone) {
    download(contractName(doc), doc.pdf);
    return MailerAttachments.forDoc(doc).then(attachments => {
      attachments.forEach(a => download(a.filename, a.pdfBase64));
      const separator = /iPad|iPhone|iPod/i.test(navigator.userAgent) ? "&body=" : "?body=";
      window.location.href = `sms:${encodeURIComponent(phone)}${separator}${encodeURIComponent(MESSAGE)}`;
      return { fallback: true };
    });
  }

  async function send(doc, phone = doc.copyPhone || doc.clientSnapshot?.phone || "") {
    const attachments = await MailerAttachments.forDoc(doc);
    const files = [file(contractName(doc), doc.pdf), ...attachments.map(a => file(a.filename, a.pdfBase64))];
    if (!navigator.canShare || !navigator.canShare({ files })) return fallback(doc, phone);
    try { await navigator.share({ files, text: MESSAGE, title: "Dirtpickle signed tattoo agreement" }); }
    catch (error) { if (error?.name === "AbortError") return { cancelled: true }; throw error; }
    if (!marker(doc)) await DB.put({ type: "textcopy", id: `txt-${doc.id}`, docId: doc.id, clientId: doc.clientId, sentAt: new Date().toISOString() });
    return { sent: true };
  }

  const status = doc => { const sent = marker(doc); return sent ? `Texted ${fmtDate(sent.sentAt)}` : doc.textCopy ? "Wants a text copy" : ""; };
  const badge = doc => status(doc) ? `<span class="sub" data-text-status="${esc(doc.id)}">${esc(status(doc))}</span>` : "";
  function panel(doc, phone) {
    return `<div class="card" id="textCopyBox" style="margin:14px 0 0"><strong>Text contract + aftercare</strong>
      <p class="mute" style="font-size:16px">Text to: <span id="textCopyNumber">${esc(phone || "")}</span></p>
      <label for="textCopyPhone">Phone number</label><input id="textCopyPhone" type="tel" inputmode="tel" value="${esc(Phone.format(phone || ""))}">
      <div class="actions"><button type="button" id="textCopyNumberButton">Copy number</button><button type="button" class="primary" id="textCopySend">Share PDFs to Messages</button></div>
      <p class="sub">Pick Messages and send to this number.</p><div id="textCopyMsg"></div></div>`;
  }
  function bindPanel(root, doc) {
    const phone = $("#textCopyPhone", root), number = $("#textCopyNumber", root), msg = $("#textCopyMsg", root);
    $("#textCopyBox", root).scrollIntoView({ block: "center", behavior: "smooth" });
    phone.oninput = () => { phone.value = Phone.format(phone.value); number.textContent = phone.value; };
    $("#textCopyNumberButton", root).onclick = async () => { try { await navigator.clipboard.writeText(Phone.format(phone.value)); msg.innerHTML = `<div class="banner ok">Number copied.</div>`; } catch (_) { msg.innerHTML = `<div class="banner warn">Select and copy the number above.</div>`; } };
    $("#textCopySend", root).onclick = async () => {
      if (!Phone.isValid(phone.value)) { msg.innerHTML = `<div class="banner bad">Enter a valid 10-digit phone number.</div>`; return; }
      try { const result = await send(doc, Phone.format(phone.value)); if (result.fallback) msg.innerHTML = `<div class="banner warn">The PDFs were downloaded and Messages was opened without attachments. Attach the downloaded PDFs before sending.</div>`; else if (!result.cancelled) { msg.innerHTML = `<div class="banner ok">Ready in Messages. Review and send it.</div>`; document.querySelectorAll(`[data-text-status="${CSS.escape(doc.id)}"]`).forEach(x => x.textContent = `Texted ${fmtDate(DB.get(`txt-${doc.id}`).sentAt)}`); } }
      catch (error) { msg.innerHTML = `<div class="banner bad">${esc(error.message || "Could not prepare the text copy.")}</div>`; }
    };
  }

  return { send, marker, status, badge, panel, bindPanel, MESSAGE };
})();
