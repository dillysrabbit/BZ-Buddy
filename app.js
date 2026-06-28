/* ============================================================
   BZ-Buddy — BZ-Werte Tracker für den Rabbit r1
   Bewohner:innen verwalten + Blutzuckerwerte und i.E. dokumentieren.
   Daten werden lokal (localStorage) gespeichert -> offline-fähig.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Persistenz ---------- */
  const DB_KEY = "bzbuddy.v1";

  const defaultDB = () => ({
    residents: [], // {id, name, room, note, createdAt}
    readings: [],  // {id, residentId, ts, bz, insulin, ctx, note, createdAt}
    settings: { unit: "mgdl" }, // "mgdl" | "mmol"
  });

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return defaultDB();
      const parsed = JSON.parse(raw);
      const d = defaultDB();
      return {
        residents: Array.isArray(parsed.residents) ? parsed.residents : d.residents,
        readings: Array.isArray(parsed.readings) ? parsed.readings : d.readings,
        settings: Object.assign(d.settings, parsed.settings || {}),
      };
    } catch (e) {
      console.warn("DB load failed, resetting", e);
      return defaultDB();
    }
  }

  function save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      toast("Speichern fehlgeschlagen");
      console.error(e);
    }
  }

  /* ---------- Helfer ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  const MMOL_FACTOR = 18.0182; // mg/dl -> mmol/l divide by this
  const unitLabel = () => (db.settings.unit === "mmol" ? "mmol/L" : "mg/dL");

  // gespeichert wird IMMER in mg/dl; Anzeige/Eingabe je nach Einheit
  function toDisplay(mgdl) {
    if (mgdl == null) return null;
    return db.settings.unit === "mmol"
      ? Math.round((mgdl / MMOL_FACTOR) * 10) / 10
      : Math.round(mgdl);
  }
  function fromDisplay(val) {
    const n = parseFloat(String(val).replace(",", "."));
    if (isNaN(n)) return null;
    return db.settings.unit === "mmol" ? n * MMOL_FACTOR : n;
  }

  // Kategorie/Farbe anhand mg/dl
  function bzClass(mgdl) {
    if (mgdl < 70) return "bz-low";
    if (mgdl <= 180) return "bz-normal";
    if (mgdl <= 250) return "bz-high";
    return "bz-vhigh";
  }

  // Meta-Infos je Kategorie: Symbol (zusätzlich zur Farbe, für Rot-Grün-Schwäche),
  // Klartext-Label (für aria/title) und Farbe. Eine zentrale Quelle.
  const BZ_META = {
    "bz-low":   { ico: "▼",  label: "Hypo",      color: "#C0392B" },
    "bz-normal":{ ico: "●",  label: "Normal",    color: "#5F7D3B" },
    "bz-high":  { ico: "▲",  label: "Hoch",      color: "#C8862E" },
    "bz-vhigh": { ico: "▲▲", label: "Sehr hoch", color: "#9E2B25" },
  };
  function bzMeta(mgdl) {
    const cls = bzClass(mgdl);
    return Object.assign({ cls }, BZ_META[cls]);
  }

  // Strukturierter Messkontext (statt Freitext) – wichtig für die Auswertung
  const BZ_CONTEXTS = ["Nüchtern", "Vor dem Essen", "Nach dem Essen", "Vor dem Schlafen"];

  // Mini-Verlaufsgrafik (SVG, kein Build). Erwartet Werte neueste-zuerst.
  function sparklineSvg(list) {
    if (list.length < 2) return "";
    const data = list.slice(0, 20).reverse(); // chronologisch, max. 20
    const vals = data.map((d) => d.bz);
    const W = 300, H = 70, padX = 6, padY = 8;
    const lo = Math.min(70, Math.min.apply(null, vals)) - 10;
    const hi = Math.max(180, Math.max.apply(null, vals)) + 10;
    const span = Math.max(1, hi - lo);
    const x = (i) => padX + (i / (data.length - 1)) * (W - 2 * padX);
    const y = (v) => H - padY - ((v - lo) / span) * (H - 2 * padY);
    const bandTop = y(180), bandBot = y(70);
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.bz).toFixed(1)}`).join(" ");
    const dots = data.map((d, i) => {
      const m = bzMeta(d.bz);
      const r = i === data.length - 1 ? 3.2 : 2.2;
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(d.bz).toFixed(1)}" r="${r}" fill="${m.color}"/>`;
    }).join("");
    return `
      <div class="section-title">Verlauf · letzte ${data.length}</div>
      <div class="card">
        <svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <rect x="0" y="${bandTop.toFixed(1)}" width="${W}" height="${Math.max(0, bandBot - bandTop).toFixed(1)}" fill="rgba(95,125,59,.14)"/>
          <line x1="0" y1="${bandTop.toFixed(1)}" x2="${W}" y2="${bandTop.toFixed(1)}" stroke="#C7C3BA" stroke-width="0.75"/>
          <line x1="0" y1="${bandBot.toFixed(1)}" x2="${W}" y2="${bandBot.toFixed(1)}" stroke="#C7C3BA" stroke-width="0.75"/>
          <polyline points="${pts}" fill="none" stroke="#8A867E" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}
        </svg>
      </div>`;
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    const day = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }
  function relDay(ts) {
    const d = new Date(ts), now = new Date();
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((nn - dd) / 86400000);
    if (diff === 0) return "Heute";
    if (diff === 1) return "Gestern";
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  // Wert eines datetime-local Inputs <-> Timestamp
  function tsToInput(ts) {
    const d = new Date(ts - d_tzOffset(ts));
    return d.toISOString().slice(0, 16);
  }
  function d_tzOffset(ts) {
    return new Date(ts).getTimezoneOffset() * 60000;
  }
  function inputToTs(val) {
    const t = new Date(val).getTime();
    return isNaN(t) ? Date.now() : t;
  }

  /* ---------- Daten-Operationen ---------- */
  const residentById = (id) => db.residents.find((r) => r.id === id);
  const readingsFor = (id) =>
    db.readings.filter((r) => r.residentId === id).sort((a, b) => b.ts - a.ts);
  const lastReading = (id) => readingsFor(id)[0] || null;

  /* ---------- UI-Grundgerüst ---------- */
  const viewEl = $("#view");
  const titleEl = $("#title");
  const backBtn = $("#backBtn");
  const settingsBtn = $("#settingsBtn");
  const fab = $("#fab");

  let currentView = { name: "list", id: null };
  let fabHandler = null;

  function setFab(visible, handler) {
    fab.hidden = !visible;
    fabHandler = handler || null;
  }
  fab.addEventListener("click", () => fabHandler && fabHandler());

  backBtn.addEventListener("click", goBack);
  settingsBtn.addEventListener("click", () => navigate("settings"));

  function navigate(name, id) {
    currentView = { name, id: id || null };
    render();
    viewEl.scrollTop = 0;
  }

  function goBack() {
    const n = currentView.name;
    if (n === "resident" || n === "addResident" || n === "settings") navigate("list");
    else if (n === "reading") navigate("resident", currentView.residentId);
    else navigate("list");
  }

  /* ---------- Router ---------- */
  function render() {
    const { name } = currentView;
    backBtn.hidden = name === "list";
    settingsBtn.hidden = name !== "list";

    switch (name) {
      case "list": return renderList();
      case "addResident": return renderResidentForm(currentView.id);
      case "resident": return renderResident(currentView.id);
      case "reading": return renderReadingForm(currentView.id);
      case "settings": return renderSettings();
      default: return renderList();
    }
  }

  /* ---------- View: Bewohner:innen-Liste ---------- */
  function renderList() {
    titleEl.textContent = "Bewohner:innen";
    setFab(true, () => navigate("addResident"));

    const residents = db.residents
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "de"));

    if (residents.length === 0) {
      viewEl.innerHTML = `
        <div class="empty">
          <div class="big"><svg width="44" height="44" viewBox="0 0 26 26" fill="none" stroke="#8A867E" stroke-width="1.6"><circle cx="13" cy="9" r="4.2"/><path d="M5 21.5 a8 8 0 0 1 16 0"/></svg></div>
          <div>Noch keine Bewohner:innen.</div>
          <div class="sub">Tippe auf <b>+</b>, um jemanden anzulegen.</div>
        </div>`;
      return;
    }

    viewEl.innerHTML = residents.map((r) => {
      const last = lastReading(r.id);
      let lastHtml = `<span class="sub">Noch kein Wert</span>`;
      if (last) {
        const m = bzMeta(last.bz);
        lastHtml = `<span class="sub">Zuletzt: </span>
          <span class="sub" style="color:${m.color};font-weight:700" title="${m.label}">${m.ico} ${toDisplay(last.bz)} ${unitLabel()}</span>
          <span class="sub"> · ${relDay(last.ts)}</span>`;
      }
      return `
      <div class="card tap" data-res="${r.id}">
        <div class="row">
          <div class="grow">
            <div class="name ellipsis">${esc(r.name)}</div>
            <div class="ellipsis">${r.room ? `<span class="sub">Zi. ${esc(r.room)} · </span>` : ""}${lastHtml}</div>
          </div>
          <span class="chev">›</span>
        </div>
      </div>`;
    }).join("");

    viewEl.querySelectorAll("[data-res]").forEach((el) =>
      el.addEventListener("click", () => navigate("resident", el.dataset.res))
    );
  }

  /* ---------- View: Bewohner:in anlegen/bearbeiten ---------- */
  function renderResidentForm(editId) {
    const editing = editId ? residentById(editId) : null;
    titleEl.textContent = editing ? "Bearbeiten" : "Neue:r Bewohner:in";
    setFab(false);

    viewEl.innerHTML = `
      <label class="field">
        <span class="lab">Name *</span>
        <input id="f-name" type="text" autocomplete="off" placeholder="Vor- und Nachname"
          value="${editing ? esc(editing.name) : ""}" />
      </label>
      <label class="field">
        <span class="lab">Zimmer</span>
        <input id="f-room" type="text" autocomplete="off" placeholder="z.B. 12a"
          value="${editing ? esc(editing.room || "") : ""}" />
      </label>
      <label class="field">
        <span class="lab">Notiz</span>
        <textarea id="f-note" placeholder="z.B. Diabetes Typ 2, Insulinschema …">${editing ? esc(editing.note || "") : ""}</textarea>
      </label>
      <button class="btn btn-primary" id="f-save">${editing ? "Speichern" : "Anlegen"}</button>
      ${editing ? `<button class="btn btn-danger" id="f-del">Bewohner:in löschen</button>` : ""}
    `;

    $("#f-name").focus();

    $("#f-save").addEventListener("click", () => {
      const name = $("#f-name").value.trim();
      if (!name) { toast("Bitte Name eingeben"); $("#f-name").focus(); return; }
      const room = $("#f-room").value.trim();
      const note = $("#f-note").value.trim();

      if (editing) {
        editing.name = name; editing.room = room; editing.note = note;
        save(); toast("Gespeichert");
        navigate("resident", editing.id);
      } else {
        const r = { id: uid(), name, room, note, createdAt: Date.now() };
        db.residents.push(r); save(); toast("Angelegt");
        navigate("resident", r.id);
      }
    });

    if (editing) {
      $("#f-del").addEventListener("click", () => {
        if (!confirm(`„${editing.name}" und ALLE zugehörigen Werte löschen?`)) return;
        db.readings = db.readings.filter((x) => x.residentId !== editing.id);
        db.residents = db.residents.filter((x) => x.id !== editing.id);
        save(); toast("Gelöscht"); navigate("list");
      });
    }
  }

  /* ---------- View: Bewohner:in-Detail ---------- */
  function renderResident(id) {
    const r = residentById(id);
    if (!r) return navigate("list");

    titleEl.textContent = r.name;
    setFab(true, () => navigate("reading", { residentId: id }));

    const list = readingsFor(id);

    // Statistik
    let statsHtml = "";
    if (list.length) {
      const last = list[0];
      const lm = bzMeta(last.bz);
      const weekAgo = Date.now() - 7 * 86400000;
      const recent = list.filter((x) => x.ts >= weekAgo);
      const avg7 = recent.length
        ? Math.round(recent.reduce((s, x) => s + x.bz, 0) / recent.length)
        : null;
      statsHtml = `
        <div class="stats">
          <div class="stat"><div class="v" style="color:${lm.color}" title="${lm.label}"><span style="font-size:.6em;vertical-align:middle">${lm.ico}</span> ${toDisplay(last.bz)}</div><div class="l">Letzter</div></div>
          <div class="stat"><div class="v">${avg7 == null ? "–" : toDisplay(avg7)}</div><div class="l">Ø 7 Tage</div></div>
          <div class="stat"><div class="v">${list.length}</div><div class="l">Messungen</div></div>
        </div>`;
    }

    const headerCard = `
      <div class="card tap" id="res-edit">
        <div class="row row-between">
          <div class="grow">
            <div class="name ellipsis">${esc(r.name)}</div>
            <div class="sub ellipsis">${r.room ? `Zimmer ${esc(r.room)}` : "Kein Zimmer"}${r.note ? " · " + esc(r.note) : ""}</div>
          </div>
          <span class="chev">✎</span>
        </div>
      </div>`;

    let body;
    if (list.length === 0) {
      body = `<div class="empty">
          <div class="big"><svg width="48" height="34" viewBox="0 0 48 26" fill="none" stroke="#8A867E" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M3 14 h9 l4 -9 5 17 4 -11 3 6 h12"/></svg></div>
          <div>Noch keine BZ-Werte.</div>
          <div class="sub">Tippe auf <b>+</b> für einen neuen Eintrag.</div>
        </div>`;
    } else {
      // nach Tag gruppieren
      let html = "";
      let lastDay = null;
      list.forEach((x) => {
        const day = relDay(x.ts);
        if (day !== lastDay) {
          html += `<div class="section-title">${day}</div>`;
          lastDay = day;
        }
        const time = new Date(x.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const m = bzMeta(x.bz);
        html += `
          <div class="card tap" data-reading="${x.id}">
            <div class="reading">
              <div class="bz-badge ${m.cls}" title="${m.label}" aria-label="${m.label}: ${toDisplay(x.bz)} ${unitLabel()}"><span class="bz-ico" aria-hidden="true">${m.ico}</span>${toDisplay(x.bz)}<span class="unit">${unitLabel()}</span></div>
              <div class="grow">
                <div class="sub">${time} Uhr${x.ctx ? ` · <span class="tag">${esc(x.ctx)}</span>` : ""}</div>
                ${x.note ? `<div class="ellipsis sub">${esc(x.note)}</div>` : ""}
              </div>
              ${x.insulin != null && x.insulin !== "" ? `<div class="ins">${x.insulin}<small> i.E.</small></div>` : ""}
            </div>
          </div>`;
      });
      body = html;
    }

    viewEl.innerHTML = headerCard + statsHtml + sparklineSvg(list) + body;

    $("#res-edit").addEventListener("click", () => navigate("addResident", id));
    viewEl.querySelectorAll("[data-reading]").forEach((el) =>
      el.addEventListener("click", () =>
        navigate("reading", { residentId: id, readingId: el.dataset.reading })
      )
    );
  }

  function cssVarForBz(mgdl) {
    return bzMeta(mgdl).color;
  }

  /* ---------- View: BZ-Wert erfassen/bearbeiten ---------- */
  function renderReadingForm(ctx) {
    const id = ctx.residentId;
    const r = residentById(id);
    if (!r) return navigate("list");

    const editing = ctx.readingId ? db.readings.find((x) => x.id === ctx.readingId) : null;
    titleEl.textContent = editing ? "Wert bearbeiten" : "Neuer BZ-Wert";
    // wir brauchen residentId beim goBack:
    currentView.residentId = id;
    setFab(false);

    const tsVal = editing ? tsToInput(editing.ts) : tsToInput(Date.now());
    const bzVal = editing ? toDisplay(editing.bz) : "";
    const insVal = editing && editing.insulin != null ? editing.insulin : "";

    viewEl.innerHTML = `
      <div class="sub" style="margin:0 2px 10px">${esc(r.name)}${r.room ? " · Zi. " + esc(r.room) : ""}</div>

      <label class="field">
        <span class="lab">Blutzucker (${unitLabel()}) *</span>
        <input id="f-bz" type="number" inputmode="decimal" step="${db.settings.unit === "mmol" ? "0.1" : "1"}"
          placeholder="${db.settings.unit === "mmol" ? "z.B. 6.5" : "z.B. 120"}" value="${bzVal}" />
      </label>

      <label class="field">
        <span class="lab">Insulin (i.E.)</span>
        <input id="f-ins" type="number" inputmode="decimal" step="0.5" min="0" placeholder="z.B. 8" value="${insVal}" />
        <div class="chips" id="ins-chips">
          ${[0, 2, 4, 6, 8, 10, 12, 14].map((n) => `<span class="chip" data-ins="${n}">${n}</span>`).join("")}
        </div>
      </label>

      <label class="field">
        <span class="lab">Kontext</span>
        <div class="chips" id="ctx-chips">
          ${BZ_CONTEXTS.map((c) => `<span class="chip${editing && editing.ctx === c ? " sel" : ""}" data-ctx="${esc(c)}">${esc(c)}</span>`).join("")}
        </div>
      </label>

      <label class="field">
        <span class="lab">Zeitpunkt</span>
        <input id="f-ts" type="datetime-local" value="${tsVal}" />
      </label>

      <label class="field">
        <span class="lab">Notiz</span>
        <textarea id="f-note" placeholder="z.B. nüchtern, nach dem Essen …">${editing ? esc(editing.note || "") : ""}</textarea>
      </label>

      <button class="btn btn-primary" id="f-save">${editing ? "Speichern" : "Eintragen"}</button>
      ${editing ? `<button class="btn btn-danger" id="f-del">Eintrag löschen</button>` : ""}
    `;

    const bzInput = $("#f-bz");
    bzInput.focus();

    // Schnellauswahl Insulin
    $("#ins-chips").querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => { $("#f-ins").value = c.dataset.ins; })
    );

    // Kontext: Einfachauswahl (erneutes Tippen hebt die Auswahl auf)
    let selCtx = editing && editing.ctx ? editing.ctx : null;
    const ctxChips = $("#ctx-chips").querySelectorAll(".chip");
    ctxChips.forEach((c) =>
      c.addEventListener("click", () => {
        selCtx = selCtx === c.dataset.ctx ? null : c.dataset.ctx;
        ctxChips.forEach((o) => o.classList.toggle("sel", o.dataset.ctx === selCtx));
      })
    );

    $("#f-save").addEventListener("click", () => {
      const mgdl = fromDisplay(bzInput.value);
      if (mgdl == null || mgdl <= 0) { toast("Bitte gültigen BZ-Wert eingeben"); bzInput.focus(); return; }

      const insRaw = $("#f-ins").value.trim();
      const insulin = insRaw === "" ? null : parseFloat(insRaw.replace(",", "."));
      const ts = inputToTs($("#f-ts").value);
      const note = $("#f-note").value.trim();

      if (editing) {
        editing.bz = mgdl;
        editing.insulin = insulin;
        editing.ctx = selCtx;
        editing.ts = ts;
        editing.note = note;
        save(); toast("Gespeichert");
      } else {
        db.readings.push({
          id: uid(), residentId: id, bz: mgdl, insulin, ctx: selCtx, ts, note, createdAt: Date.now(),
        });
        save(); toast("Eingetragen");
      }
      navigate("resident", id);
    });

    if (editing) {
      $("#f-del").addEventListener("click", () => {
        if (!confirm("Diesen Eintrag löschen?")) return;
        db.readings = db.readings.filter((x) => x.id !== editing.id);
        save(); toast("Gelöscht"); navigate("resident", id);
      });
    }
  }

  /* ---------- View: Einstellungen ---------- */
  function renderSettings() {
    titleEl.textContent = "Einstellungen";
    setFab(false);

    const resCount = db.residents.length;
    const readCount = db.readings.length;

    viewEl.innerHTML = `
      <div class="card" style="padding:0">
        <div class="set-row">
          <div>
            <div style="font-weight:600">Einheit</div>
            <div class="sub">Anzeige der Blutzuckerwerte</div>
          </div>
          <select id="s-unit" style="width:auto">
            <option value="mgdl" ${db.settings.unit === "mgdl" ? "selected" : ""}>mg/dL</option>
            <option value="mmol" ${db.settings.unit === "mmol" ? "selected" : ""}>mmol/L</option>
          </select>
        </div>
      </div>

      <div class="section-title">Daten</div>
      <div class="card">
        <div class="sub">${resCount} Bewohner:in(nen) · ${readCount} Messung(en)</div>
        <div class="sub" style="margin-top:4px">Alles wird lokal auf dem Gerät gespeichert.</div>
      </div>
      <button class="btn btn-ghost" id="s-export">Daten exportieren (JSON)</button>
      <button class="btn btn-danger" id="s-reset">Alle Daten löschen</button>

      <div class="section-title">Farbskala (mg/dL)</div>
      <div class="card">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="bz-badge bz-low" style="min-width:auto;padding:4px 8px" title="Hypo">▼ &lt; 70</span>
          <span class="bz-badge bz-normal" style="min-width:auto;padding:4px 8px" title="Normal">● 70–180</span>
          <span class="bz-badge bz-high" style="min-width:auto;padding:4px 8px" title="Hoch">▲ 181–250</span>
          <span class="bz-badge bz-vhigh" style="min-width:auto;padding:4px 8px" title="Sehr hoch">▲▲ &gt; 250</span>
        </div>
      </div>

      <div class="sub" style="text-align:center;margin-top:18px">BZ-Buddy · für Rabbit r1</div>
    `;

    $("#s-unit").addEventListener("change", (e) => {
      db.settings.unit = e.target.value; save(); toast("Einheit: " + unitLabel());
    });

    $("#s-export").addEventListener("click", exportData);

    $("#s-reset").addEventListener("click", () => {
      if (!confirm("Wirklich ALLE Bewohner:innen und Werte löschen?")) return;
      if (!confirm("Letzte Warnung: Das kann nicht rückgängig gemacht werden.")) return;
      db = defaultDB(); save(); toast("Alle Daten gelöscht"); navigate("list");
    });
  }

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bz-buddy-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Export erstellt");
    } catch (e) {
      // Fallback: in Zwischenablage
      try {
        navigator.clipboard.writeText(JSON.stringify(db));
        toast("In Zwischenablage kopiert");
      } catch (_) { toast("Export nicht möglich"); }
    }
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  const toastEl = $("#toast");
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove("fade");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add("fade");
      setTimeout(() => { toastEl.hidden = true; }, 250);
    }, 1600);
  }

  /* ---------- Rabbit r1 Hardware (Progressive Enhancement) ---------- */
  // Scrollrad: scrollt die Ansicht; Seitentaste: zurück.
  function bindR1Hardware() {
    const scrollStep = 60;
    window.addEventListener("scrollUp", () => { viewEl.scrollTop -= scrollStep; });
    window.addEventListener("scrollDown", () => { viewEl.scrollTop += scrollStep; });
    // Seitentaste (PTT) als "Zurück", wenn nicht auf der Startliste
    window.addEventListener("sideClick", () => {
      if (currentView.name !== "list") goBack();
    });
    // Tastatur-Fallback (Test im Browser)
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && currentView.name !== "list") goBack();
    });
  }

  /* ---------- Start ---------- */
  bindR1Hardware();
  navigate("list");
})();
