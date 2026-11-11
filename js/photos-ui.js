"use strict";

const PhotosUI = (() => {
  const label = kind => Photos.KINDS[kind] || Photos.KINDS.finished;
  const thumb = photo => `<button class="photo-thumb" type="button" data-photo-id="${esc(photo.id)}" title="Open photo">
    <img src="${photo.image}" alt="${esc(label(photo.kind))}"><span>${esc(label(photo.kind))}</span></button>`;
  const stripItem = photo => `<button class="photo-strip-item" type="button" data-go="session" data-id="${esc(photo.sessionId)}" title="${esc(label(photo.kind))}">
    <img src="${photo.image}" alt="${esc(label(photo.kind))}"></button>`;

  function sessionSection(session) {
    const photos = Photos.bySession(session.id);
    const options = Photos.kindValues().map(kind => `<option value="${kind}">${esc(label(kind))}</option>`).join("");
    return `<section class="card photos" data-photo-session="${esc(session.id)}"><strong>Photos</strong>
      <div class="actions"><select id="photoKind">${options}</select>
        <label class="btn primary">Add photo<input id="photoFiles" type="file" accept="image/*" capture="environment" multiple hidden></label></div>
      <div id="photoMsg"></div><div class="photo-grid">${photos.map(thumb).join("") || '<span class="mute">No photos for this session yet.</span>'}</div>
      <div id="photoViewer"></div></section>`;
  }

  function profileStrip(clientId) {
    const photos = Photos.byClient(clientId).slice(0, 6);
    if (!photos.length) return "";
    return `<div class="card"><strong>Session photos</strong><div class="photo-strip">${photos.map(stripItem).join("")}</div></div>`;
  }

  function viewer(photo) {
    return `<div class="photo-viewer" data-viewer="${esc(photo.id)}"><div class="photo-viewer-card">
      <img src="${photo.image}" alt="${esc(label(photo.kind))}"><div class="sub">${esc(label(photo.kind))} · ${esc(fmtDate(photo.createdAt))}</div>
      <label for="photoNote">Note</label><textarea id="photoNote" rows="3">${esc(photo.note)}</textarea>
      <div class="actions"><button class="primary" id="photoNoteSave">Save note</button><a class="btn" href="${photo.image}" download="tattoo-photo.jpg">Download</a><button class="danger" id="photoDelete">Delete</button><button id="photoClose">Close</button></div>
    </div></div>`;
  }

  function bindSession(root, sessionId) {
    const section = root.querySelector("[data-photo-session]");
    if (!section) return;
    const msg = (text, cls = "warn") => { $("#photoMsg", section).innerHTML = text ? `<div class="banner ${cls}">${esc(text)}</div>` : ""; };
    const rerender = () => go("session", { id: sessionId });
    $("#photoFiles", section).onchange = async event => {
      const files = [...event.target.files];
      if (!files.length) return;
      const kind = $("#photoKind", section).value;
      try {
        for (const file of files) await Photos.add(DB.get(sessionId), file, kind);
        rerender();
      } catch (error) { msg(error.message, "bad"); }
    };
    section.onclick = async event => {
      const tile = event.target.closest("[data-photo-id]");
      if (tile) {
        event.preventDefault();
        const photo = DB.get(tile.dataset.photoId);
        if (photo) $("#photoViewer", section).innerHTML = viewer(photo);
        return;
      }
      if (event.target.closest("#photoClose")) { $("#photoViewer", section).innerHTML = ""; return; }
      const save = event.target.closest("#photoNoteSave");
      if (save) {
        const photo = DB.get(section.querySelector("[data-viewer]").dataset.viewer);
        await Photos.update(photo, $("#photoNote", section).value);
        rerender();
        return;
      }
      if (event.target.closest("#photoDelete")) {
        const viewerBox = section.querySelector("[data-viewer]");
        if (viewerBox && confirm("Delete this photo?")) { await Photos.remove(viewerBox.dataset.viewer); rerender(); }
      }
    };
  }

  return { sessionSection, profileStrip, bindSession };
})();
