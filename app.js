// app.js — Gerador de Orçamentos SoftPrime
// ATUALIZADO: Supabase como storage principal (sincroniza entre dispositivos)

// ========== SUPABASE CONFIG ==========
const SUPABASE_URL = "https://eyvdyhpdahkplapltaut.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dmR5aHBkYWhrcGxhcGx0YXV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzQxNTMsImV4cCI6MjA4NzYxMDE1M30.4bQ0J65OdXlpSn85uH07fLGPZCwGbTo1-WoltBLrS5Q";

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Prefer": "return=representation"
};

async function sbSelect(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { ...SB_HEADERS, "Prefer": "" }
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[Supabase] sbSelect error (${table}):`, text);
    throw new Error(text);
  }
  try { return JSON.parse(text); } catch { return []; }
}

async function sbUpsert(table, data) {
  // Garante que mandamos sempre um array — Supabase exige isso para upsert confiável
  const payload = Array.isArray(data) ? data : [data];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[Supabase] sbUpsert error (${table}):`, text);
    throw new Error(text);
  }
  try { return JSON.parse(text); } catch { return []; }
}

async function sbDelete(table, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...SB_HEADERS, "Prefer": "" }
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[Supabase] sbDelete error (${table}):`, text);
    throw new Error(text);
  }
}

// ========== STORAGE (Supabase) ==========
// store continua como cache local em memória para renders síncronos
let store = { issuers: [], clients: [], quotes: [] };

async function loadStore() {
  try {
    showLoadingOverlay(true);
    const [issuersRaw, clientsRaw, quotesRaw] = await Promise.all([
      sbSelect("issuers", "order=created_at.asc"),
      sbSelect("clients", "order=created_at.asc"),
      sbSelect("quotes",  "order=created_at.asc")
    ]);

    // Mapeia snake_case do banco → camelCase do app
    store.issuers = issuersRaw.map(r => ({
      id:        r.id,
      name:      r.name,
      cnpjCpf:   r.cnpj_cpf   || r.cnpj || "",
      address:   r.address    || "",
      phone:     r.phone      || "",
      logo:      r.logo       || null,
      createdAt: r.created_at
    }));

    store.clients = clientsRaw.map(r => ({
      id:        r.id,
      name:      r.name,
      cnpjCpf:   r.cnpj_cpf   || "",
      address:   r.address    || "",
      phone:     r.phone      || "",
      createdAt: r.created_at
    }));

    store.quotes = quotesRaw.map(r => ({
      id:        r.id,
      issuerId:  r.issuer_id,
      clientId:  r.client_id,
      numero:    r.numero,
      items:     r.items || [],
      subtotal:  r.subtotal,
      total:     r.total,
      notes:     r.notes      || "",
      createdAt: r.created_at,
      updatedAt: r.updated_at || r.created_at
    }));
  } catch (err) {
    console.error("[Supabase] loadStore error:", err);
    showNotification("Erro ao carregar dados do servidor. Verifique a conexão.", "error");
  } finally {
    showLoadingOverlay(false);
  }
}

async function saveIssuer(issuer) {
  // Mapeia camelCase → snake_case do banco
  const row = {
    id:        issuer.id,
    name:      issuer.name,
    cnpj_cpf:  issuer.cnpjCpf  || null,
    address:   issuer.address  || null,
    phone:     issuer.phone    || null,
    logo:      issuer.logo     || null
  };
  await sbUpsert("issuers", row);
}

async function saveClient(client) {
  const row = {
    id:       client.id,
    name:     client.name,
    cnpj_cpf: client.cnpjCpf || null,
    address:  client.address  || null,
    phone:    client.phone    || null
  };
  await sbUpsert("clients", row);
}

async function saveQuote(quote) {
  const row = {
    id:        quote.id,
    issuer_id: quote.issuerId,
    client_id: quote.clientId,
    numero:    quote.numero   || null,
    // items precisa ser JSON string para Supabase JSONB aceitar via REST
    items:     typeof quote.items === 'string' ? JSON.parse(quote.items) : (quote.items || []),
    subtotal:  parseFloat(quote.subtotal) || 0,
    total:     parseFloat(quote.total)    || 0,
    notes:     quote.notes    || null,
  };
  // Só inclui created_at se já existir (edição); novo registro usa o default do banco
  if (quote.createdAt) row.created_at = quote.createdAt;
  await sbUpsert("quotes", row);
}

// ========== RELOAD HELPERS (sincroniza com Supabase após cada operação) ==========
async function reloadIssuers() {
  try {
    const rows = await sbSelect("issuers", "order=created_at.asc");
    store.issuers = rows.map(r => ({
      id:        r.id,
      name:      r.name,
      cnpjCpf:   r.cnpj_cpf || r.cnpj || "",
      address:   r.address  || "",
      phone:     r.phone    || "",
      logo:      r.logo     || null,
      createdAt: r.created_at
    }));
  } catch (err) {
    console.error("[Supabase] reloadIssuers error:", err);
  }
}

async function reloadClients() {
  try {
    const rows = await sbSelect("clients", "order=created_at.asc");
    store.clients = rows.map(r => ({
      id:        r.id,
      name:      r.name,
      cnpjCpf:   r.cnpj_cpf || "",
      address:   r.address  || "",
      phone:     r.phone    || "",
      createdAt: r.created_at
    }));
  } catch (err) {
    console.error("[Supabase] reloadClients error:", err);
  }
}

async function reloadQuotes() {
  try {
    const rows = await sbSelect("quotes", "order=created_at.asc");
    store.quotes = rows.map(r => ({
      id:        r.id,
      issuerId:  r.issuer_id,
      clientId:  r.client_id,
      numero:    r.numero,
      items:     r.items     || [],
      subtotal:  r.subtotal,
      total:     r.total,
      notes:     r.notes     || "",
      createdAt: r.created_at,
      updatedAt: r.updated_at || r.created_at
    }));
  } catch (err) {
    console.error("[Supabase] reloadQuotes error:", err);
  }
}

// ========== LOADING OVERLAY ==========
function showLoadingOverlay(show) {
  let el = document.getElementById("sp-loading-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "sp-loading-overlay";
    el.innerHTML = `<div class="sp-spinner"></div><div class="sp-loading-text">Carregando dados...</div>`;
    el.style.cssText = `
      position:fixed;inset:0;z-index:99998;
      background:rgba(15,23,42,0.75);
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:16px;
    `;
    const style = document.createElement("style");
    style.textContent = `
      .sp-spinner{width:44px;height:44px;border:4px solid rgba(255,255,255,.2);
        border-top-color:#0d7de0;border-radius:50%;animation:sp-spin .8s linear infinite;}
      @keyframes sp-spin{to{transform:rotate(360deg)}}
      .sp-loading-text{color:#fff;font-size:15px;font-family:Inter,sans-serif;font-weight:500;}
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  el.style.display = show ? "flex" : "none";
}

// ========== UTILITY ==========
function uid() {
  // crypto.randomUUID() garante UUID válido para o Supabase (tipo uuid ou text)
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: gera UUID v4 manualmente
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
const money = v => Number(v||0).toFixed(2);

function computeNextQuoteNumberForIssuer(issuerId) {
  const issuerQuotes = (store.quotes || []).filter(q => q.issuerId === issuerId);
  if (!issuerQuotes.length) return 1;
  let max = 0;
  for (const q of issuerQuotes) {
    if (!q.numero) continue;
    const m = String(q.numero).match(/(\d+)(?!.*\d)/);
    if (m) { const n = parseInt(m[0], 10); if (!isNaN(n) && n > max) max = n; }
  }
  return max + 1;
}

function formatQuoteNumber(n) {
  const year = new Date().getFullYear();
  return `${year}-${String(n).padStart(4,'0')}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function escapeCsv(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/"/g, '""');
}

function formatDateISOtoLocal(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString('pt-BR');
}

function normalizeStr(str) {
  return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function filterQuotes(quotes) {
  const q = normalizeStr(searchQuery);
  if (!q) return quotes;
  return quotes.filter(quote => {
    const issuer = store.issuers.find(i => i.id === quote.issuerId) || {};
    const client = store.clients.find(c => c.id === quote.clientId) || {};
    const fields = [quote.numero||'', issuer.name||'', client.name||'', formatDateISOtoLocal(quote.createdAt), money(quote.total)];
    return fields.some(f => normalizeStr(f).includes(q));
  });
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const nt = normalizeStr(text), nq = normalizeStr(query);
  const idx = nt.indexOf(nq);
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0,idx))
    + '<mark class="search-highlight">' + escapeHtml(text.slice(idx, idx+nq.length)) + '</mark>'
    + escapeHtml(text.slice(idx+nq.length));
}

function showNotification(message, type = 'success') {
  // Remove toast anterior se existir
  const old = document.getElementById('sp-toast');
  if (old) old.remove();

  const colors = {
    success: { bg: '#16a34a', border: '#15803d' },
    error:   { bg: '#dc2626', border: '#b91c1c' },
    info:    { bg: '#0d7de0', border: '#0369a1' }
  };
  const c = colors[type] || colors.info;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

  const toast = document.createElement('div');
  toast.id = 'sp-toast';
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:99999;
    max-width:360px;min-width:220px;
    background:${c.bg};border:1.5px solid ${c.border};
    color:#fff;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:500;
    padding:14px 18px;border-radius:10px;
    box-shadow:0 4px 24px rgba(0,0,0,.25);
    display:flex;align-items:flex-start;gap:10px;
    animation:spSlideIn .25s ease;
    word-break:break-word;
  `;
  const style = document.getElementById('sp-toast-style');
  if (!style) {
    const s = document.createElement('style');
    s.id = 'sp-toast-style';
    s.textContent = '@keyframes spSlideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }
  toast.innerHTML = `<span style="font-size:18px;line-height:1;">${icon}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, type === 'error' ? 6000 : 3500);
}

// ========== DOM ELEMENTS ==========
const issuerForm       = document.getElementById("issuerForm");
const issuerList       = document.getElementById("issuerList");
const issuerName       = document.getElementById("issuerName");
const issuerCnpjCpf    = document.getElementById("issuerCnpjCpf");
const issuerAddress    = document.getElementById("issuerAddress");
const issuerPhone      = document.getElementById("issuerPhone");
const issuerSubmitBtn  = document.getElementById("issuerSubmitBtn");
const issuerCancelBtn  = document.getElementById("issuerCancelBtn");
const issuerLogoInput  = document.getElementById("issuerLogo");
const issuerLogoPreview= document.getElementById("issuerLogoPreview");
const issuerLogoImg    = document.getElementById("issuerLogoImg");
const removeLogoBtn    = document.getElementById("removeLogoBtn");

const clientForm       = document.getElementById("clientForm");
const clientList       = document.getElementById("clientList");
const clientName       = document.getElementById("clientName");
const clientCnpjCpf    = document.getElementById("clientCnpjCpf");
const clientAddress    = document.getElementById("clientAddress");
const clientPhone      = document.getElementById("clientPhone");
const clientSubmitBtn  = document.getElementById("clientSubmitBtn");
const clientCancelBtn  = document.getElementById("clientCancelBtn");

const selectIssuer     = document.getElementById("selectIssuer");
const selectClient     = document.getElementById("selectClient");
const quoteNumber      = document.getElementById("quoteNumber");
const quoteDate        = document.getElementById("quoteDate");
const notes            = document.getElementById("notes");

const itemsBody        = document.getElementById("itemsBody");
const addItemBtn       = document.getElementById("addItemBtn");
const subtotalEl       = document.getElementById("subtotal");
const grandTotalEl     = document.getElementById("grandTotal");
const saveQuoteBtn     = document.getElementById("saveQuoteBtn");
const cancelEditBtn    = document.getElementById("cancelEditBtn");
const quotesList       = document.getElementById("quotesList");
const quotesSearch     = document.getElementById("quotesSearch");
const clearSearch      = document.getElementById("clearSearch");
const filterResultsCount = document.getElementById("filterResultsCount");

const exportCsvBtn     = document.getElementById("exportCsvBtn");
const exportDocBtn     = document.getElementById("exportDocBtn");

const previewModal     = document.getElementById("previewModal");
const previewArea      = document.getElementById("previewArea");
const closePreview     = document.getElementById("closePreview");
const printBtn         = document.getElementById("printBtn");

let currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
let editingQuoteId   = null;
let editingIssuerId  = null;
let editingClientId  = null;
let lastPreviewHtml  = "";
let currentIssuerLogoDataUrl = null;
let searchQuery      = '';

// ========== RENDER ==========
function setDefaultQuoteFields() {
  if (!quoteNumber || !quoteDate) return;
  if (editingQuoteId) return;
  const selectedIssuerId = selectIssuer ? selectIssuer.value : null;
  const nextNum = selectedIssuerId ? computeNextQuoteNumberForIssuer(selectedIssuerId) : 1;
  quoteNumber.value = formatQuoteNumber(nextNum);
  quoteDate.value   = new Date().toISOString().slice(0, 10);
  if (notes) notes.value = "";
}

function renderIssuers() {
  if (!selectIssuer) return;
  if (issuerList) issuerList.innerHTML = "";
  selectIssuer.innerHTML = "<option value=''>-- selecione o emissor --</option>";

  (store.issuers || []).forEach(i => {
    if (issuerList) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          ${i.logo ? `<img src="${i.logo}" alt="Logo" style="max-height:40px;max-width:100px;margin-bottom:6px;border-radius:4px;" />` : ''}
          <strong>${escapeHtml(i.name)}</strong>
          <div class="meta">${escapeHtml(i.cnpjCpf||'')} ${i.phone ? '• '+escapeHtml(i.phone) : ''}</div>
          <div class="meta">${escapeHtml(i.address||'')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-outline edit-issuer" data-id="${i.id}">✏️ Editar</button>
          <button class="btn btn-outline del-issuer" data-id="${i.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button>
        </div>`;
      issuerList.appendChild(li);
    }
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = `${i.name}${i.cnpjCpf ? ' — '+i.cnpjCpf : ''}`;
    selectIssuer.appendChild(opt);
  });
}

function renderClients() {
  if (!selectClient) return;
  if (clientList) clientList.innerHTML = "";
  selectClient.innerHTML = "<option value=''>-- selecione o cliente --</option>";

  (store.clients || []).forEach(c => {
    if (clientList) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <div class="meta">${escapeHtml(c.cnpjCpf||'')} ${c.phone ? '• '+escapeHtml(c.phone) : ''}</div>
          <div class="meta">${escapeHtml(c.address||'')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-outline edit-client" data-id="${c.id}">✏️ Editar</button>
          <button class="btn btn-outline del-client" data-id="${c.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button>
        </div>`;
      clientList.appendChild(li);
    }
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name}${c.cnpjCpf ? ' — '+c.cnpjCpf : ''}`;
    selectClient.appendChild(opt);
  });
}

function renderQuotes() {
  if (!quotesList) return;
  quotesList.innerHTML = "";

  if (!store.quotes.length) {
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>📭 Nenhum orçamento salvo ainda</li>";
    if (filterResultsCount) { filterResultsCount.textContent = ''; filterResultsCount.className = 'filter-results-count'; }
    return;
  }

  const filtered = filterQuotes(store.quotes.slice().reverse());
  const total = store.quotes.length, shown = filtered.length;
  const isFiltering = searchQuery.length > 0;

  if (filterResultsCount) {
    if (isFiltering) {
      filterResultsCount.textContent = shown === 0
        ? 'Nenhum orçamento encontrado'
        : `Exibindo ${shown} de ${total} orçamento${total !== 1 ? 's' : ''}`;
      filterResultsCount.className = 'filter-results-count' + (shown === 0 ? ' no-results' : '');
    } else {
      filterResultsCount.textContent = '';
      filterResultsCount.className   = 'filter-results-count';
    }
  }

  if (!filtered.length) {
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>🔍 Nenhum orçamento corresponde à pesquisa</li>";
    return;
  }

  filtered.forEach(q => {
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const li = document.createElement("li");
    li.innerHTML = `
      <div style="flex:1;">
        <strong>📄 Orçamento ${highlightText(q.numero||q.id, searchQuery)}</strong>
        <div class="meta">
          <span style="color:#0d7de0;">De:</span> ${highlightText(issuer.name||'—', searchQuery)}
          <span style="margin:0 8px;">→</span>
          <span style="color:#0d7de0;">Para:</span> ${highlightText(client.name||'—', searchQuery)}
        </div>
        <div class="meta">📅 ${formatDateISOtoLocal(q.createdAt)} • 💰 R$ ${money(q.total)}</div>
      </div>
      <div class="quote-actions">
        <button class="btn btn-outline view-quote"   data-id="${q.id}">👁️ Visualizar/Imprimir</button>
        <button class="btn btn-outline export-quote" data-id="${q.id}">📄 Word</button>
        <button class="btn btn-outline export-pdf"   data-id="${q.id}">📑 PDF</button>
        <button class="btn btn-outline edit-quote"   data-id="${q.id}">✏️ Editar</button>
        <button class="btn btn-outline del-quote"    data-id="${q.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button>
      </div>`;
    quotesList.appendChild(li);
  });

  attachQuoteListListeners();
}

function renderItems(items = []) {
  if (!itemsBody) return;
  itemsBody.innerHTML = "";

  items.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td><input data-idx="${idx}" data-field="descricao"     value="${escapeHtml(it.descricao||'')}" placeholder="Descrição do item" aria-label="Descrição do item ${idx+1}" /></td>
      <td><input data-idx="${idx}" data-field="quantidade"    type="number" min="0" step="1"    value="${it.quantidade||1}"      aria-label="Quantidade do item ${idx+1}" /></td>
      <td><input data-idx="${idx}" data-field="valorUnitario" type="number" min="0" step="0.01" value="${it.valorUnitario||0}"   aria-label="Valor unitário do item ${idx+1}" /></td>
      <td class="item-total">R$ ${money((it.quantidade||1)*(it.valorUnitario||0))}</td>
      <td><button class="del-item" data-idx="${idx}" aria-label="Remover item ${idx+1}">×</button></td>`;
    itemsBody.appendChild(tr);

    tr.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", e => {
        const i = +e.target.dataset.idx, f = e.target.dataset.field;
        let val = e.target.value;
        if (["quantidade","valorUnitario"].includes(f)) val = Number(val||0);
        currentItems[i][f] = val;
        const it2 = currentItems[i];
        const td = tr.querySelector(".item-total");
        if (td) td.textContent = `R$ ${money((Number(it2.quantidade||0))*(Number(it2.valorUnitario||0)))}`;
        recalcTotals();
      });
    });

    const delBtn = tr.querySelector(".del-item");
    delBtn && delBtn.addEventListener("click", () => {
      if (currentItems.length === 1) { showNotification("Deve haver pelo menos um item", "info"); return; }
      currentItems.splice(idx, 1);
      renderItems(currentItems);
    });
  });

  recalcTotals();
}

function recalcTotals() {
  const subtotal = currentItems.reduce((s,it) => s + (Number(it.quantidade||0)*Number(it.valorUnitario||0)), 0);
  if (subtotalEl)  subtotalEl.textContent  = money(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = money(subtotal);
  return { subtotal, total: subtotal };
}

function renderAll() {
  renderIssuers(); renderClients(); renderQuotes(); renderItems(currentItems);
}

// ========== ISSUER HANDLERS ==========
if (issuerForm) {
  issuerForm.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const name    = (issuerName    && issuerName.value    || "").trim();
      const cnpjCpf = (issuerCnpjCpf && issuerCnpjCpf.value || "").trim();
      const address = (issuerAddress && issuerAddress.value  || "").trim();
      const phone   = (issuerPhone   && issuerPhone.value   || "").trim();
      if (!name) { showNotification("Preencha o nome do emissor", "error"); return; }

      if (editingIssuerId) {
        const item = store.issuers.find(x => x.id === editingIssuerId);
        if (item) {
          item.name = name; item.cnpjCpf = cnpjCpf; item.address = address; item.phone = phone;
          item.logo = currentIssuerLogoDataUrl;
          await saveIssuer(item);
          editingIssuerId = null;
          if (issuerSubmitBtn) issuerSubmitBtn.textContent = "Adicionar Emissor";
          if (issuerCancelBtn) issuerCancelBtn.style.display = "none";
          issuerForm.reset();
          currentIssuerLogoDataUrl = null;
          if (issuerLogoInput)   issuerLogoInput.value = '';
          if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
          if (issuerLogoImg)     issuerLogoImg.src = '';
          await reloadIssuers();
          renderIssuers(); renderQuotes();
          showNotification("Emissor atualizado com sucesso!", "success");
          return;
        }
      }

      const newItem = { id: uid(), name, cnpjCpf, address, phone, logo: currentIssuerLogoDataUrl || null };
      // Salva no Supabase — só atualiza o store local se não der erro
      await saveIssuer(newItem);
      store.issuers.push(newItem);
      issuerForm.reset();
      currentIssuerLogoDataUrl = null;
      if (issuerLogoInput)   issuerLogoInput.value = '';
      if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
      if (issuerLogoImg)     issuerLogoImg.src = '';
      // Recarrega do banco para garantir consistência entre dispositivos
      await reloadIssuers();
      renderIssuers(); renderQuotes();
      showNotification("Emissor adicionado com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] issuerForm:", err);
      showNotification("Erro ao salvar emissor. Tente novamente.", "error");
    }
  });
}

if (issuerList) {
  issuerList.addEventListener("click", async e => {
    try {
      if (e.target.classList.contains("del-issuer")) {
        const id = e.target.dataset.id;
        if (!confirm("❓ Excluir este emissor?")) return;
        await sbDelete("issuers", id);
        await reloadIssuers();
        renderIssuers(); renderQuotes();
        showNotification("Emissor excluído", "success");
      } else if (e.target.classList.contains("edit-issuer")) {
        const id = e.target.dataset.id;
        const it = store.issuers.find(x => x.id === id);
        if (!it) return;
        editingIssuerId = id;
        if (issuerName)    issuerName.value    = it.name    || "";
        if (issuerCnpjCpf) issuerCnpjCpf.value = it.cnpjCpf || "";
        if (issuerAddress) issuerAddress.value  = it.address || "";
        if (issuerPhone)   issuerPhone.value    = it.phone   || "";
        currentIssuerLogoDataUrl = it.logo || null;
        if (issuerLogoImg && it.logo) { issuerLogoImg.src = it.logo; if (issuerLogoPreview) issuerLogoPreview.style.display = 'block'; }
        else { if (issuerLogoPreview) issuerLogoPreview.style.display = 'none'; if (issuerLogoImg) issuerLogoImg.src = ''; }
        if (issuerLogoInput)  issuerLogoInput.value = '';
        if (issuerSubmitBtn)  issuerSubmitBtn.textContent  = "Atualizar Emissor";
        if (issuerCancelBtn)  issuerCancelBtn.style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { console.error("[ERROR] issuerList click:", err); showNotification("Erro ao processar emissor", "error"); }
  });
}

if (issuerCancelBtn) {
  issuerCancelBtn.addEventListener("click", () => {
    editingIssuerId = null; issuerForm && issuerForm.reset();
    if (issuerSubmitBtn)  issuerSubmitBtn.textContent   = "Adicionar Emissor";
    issuerCancelBtn.style.display = "none";
    currentIssuerLogoDataUrl = null;
    if (issuerLogoInput)   issuerLogoInput.value = '';
    if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
    if (issuerLogoImg)     issuerLogoImg.src = '';
  });
}

if (issuerLogoInput) {
  issuerLogoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4*1024*1024) { showNotification('Imagem muito grande. Máximo 4MB.','error'); issuerLogoInput.value=''; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      currentIssuerLogoDataUrl = ev.target.result;
      if (issuerLogoImg)     issuerLogoImg.src = currentIssuerLogoDataUrl;
      if (issuerLogoPreview) issuerLogoPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}

if (removeLogoBtn) {
  removeLogoBtn.addEventListener('click', () => {
    currentIssuerLogoDataUrl = null;
    if (issuerLogoInput)   issuerLogoInput.value = '';
    if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
    if (issuerLogoImg)     issuerLogoImg.src = '';
  });
}

// ========== CLIENT HANDLERS ==========
if (clientForm) {
  clientForm.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const name    = (clientName    && clientName.value    || "").trim();
      const cnpjCpf = (clientCnpjCpf && clientCnpjCpf.value || "").trim();
      const address = (clientAddress && clientAddress.value  || "").trim();
      const phone   = (clientPhone   && clientPhone.value   || "").trim();
      if (!name) { showNotification("Preencha o nome do cliente", "error"); return; }

      if (editingClientId) {
        const item = store.clients.find(x => x.id === editingClientId);
        if (item) {
          item.name = name; item.cnpjCpf = cnpjCpf; item.address = address; item.phone = phone;
          await saveClient(item);
          editingClientId = null;
          if (clientSubmitBtn) clientSubmitBtn.textContent = "Adicionar Cliente";
          if (clientCancelBtn) clientCancelBtn.style.display = "none";
          clientForm.reset();
          await reloadClients();
          renderClients(); renderQuotes();
          showNotification("Cliente atualizado com sucesso!", "success");
          return;
        }
      }

      const newItem = { id: uid(), name, cnpjCpf, address, phone };
      await saveClient(newItem);
      store.clients.push(newItem);
      clientForm.reset();
      // Recarrega do banco para garantir consistência entre dispositivos
      await reloadClients();
      renderClients(); renderQuotes();
      showNotification("Cliente adicionado com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] clientForm:", err);
      showNotification("Erro ao salvar cliente. Tente novamente.", "error");
    }
  });
}

if (clientList) {
  clientList.addEventListener("click", async e => {
    try {
      if (e.target.classList.contains("del-client")) {
        const id = e.target.dataset.id;
        if (!confirm("❓ Excluir este cliente?")) return;
        await sbDelete("clients", id);
        await reloadClients();
        renderClients(); renderQuotes();
        showNotification("Cliente excluído", "success");
      } else if (e.target.classList.contains("edit-client")) {
        const id = e.target.dataset.id;
        const it = store.clients.find(x => x.id === id);
        if (!it) return;
        editingClientId = id;
        if (clientName)    clientName.value    = it.name    || "";
        if (clientCnpjCpf) clientCnpjCpf.value = it.cnpjCpf || "";
        if (clientAddress) clientAddress.value  = it.address || "";
        if (clientPhone)   clientPhone.value    = it.phone   || "";
        if (clientSubmitBtn) clientSubmitBtn.textContent  = "Atualizar Cliente";
        if (clientCancelBtn) clientCancelBtn.style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { console.error("[ERROR] clientList click:", err); showNotification("Erro ao processar cliente", "error"); }
  });
}

if (clientCancelBtn) {
  clientCancelBtn.addEventListener("click", () => {
    editingClientId = null; clientForm && clientForm.reset();
    if (clientSubmitBtn) clientSubmitBtn.textContent   = "Adicionar Cliente";
    clientCancelBtn.style.display = "none";
  });
}

// ========== ITEM HANDLERS ==========
if (addItemBtn) {
  addItemBtn.addEventListener("click", e => {
    e.preventDefault();
    try {
      currentItems.push({descricao:"",quantidade:1,valorUnitario:0});
      renderItems(currentItems);
      setTimeout(() => {
        const last = currentItems.length - 1;
        const inp  = itemsBody.querySelector(`input[data-idx="${last}"][data-field="descricao"]`);
        if (inp) inp.focus();
      }, 100);
    } catch (err) { console.error("[ERROR] addItemBtn:", err); }
  });
}

// ========== QUOTE HANDLERS ==========
if (selectIssuer) {
  selectIssuer.addEventListener('change', () => { if (!editingQuoteId) setDefaultQuoteFields(); });
}

if (saveQuoteBtn) {
  saveQuoteBtn.addEventListener("click", async () => {
    try {
      const issuerId = selectIssuer && selectIssuer.value;
      const clientId = selectClient && selectClient.value;
      if (!issuerId || !clientId) { showNotification("Selecione emissor e cliente", "error"); return; }

      const validItems = currentItems.filter(it => (it.descricao||"").trim() !== "");
      if (!validItems.length) { showNotification("Adicione pelo menos um item com descrição", "error"); return; }

      const totals = recalcTotals();
      let numeroValue = (quoteNumber && quoteNumber.value || "").trim();
      if (!numeroValue) numeroValue = formatQuoteNumber(computeNextQuoteNumberForIssuer(issuerId));
      const notesVal = (notes && notes.value || "").trim();

      if (editingQuoteId) {
        const q = store.quotes.find(x => x.id === editingQuoteId);
        if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
        q.issuerId = issuerId; q.clientId = clientId; q.numero = numeroValue || null;
        q.items    = JSON.parse(JSON.stringify(validItems));
        q.subtotal = totals.subtotal; q.total = totals.total;
        q.notes    = notesVal;
        if (quoteDate && quoteDate.value) q.createdAt = new Date(quoteDate.value+'T12:00:00').toISOString();
        q.updatedAt = new Date().toISOString();
        await saveQuote(q);
        // Recarrega do banco
        await reloadQuotes();
        showNotification(`✅ Orçamento ${q.numero} atualizado!`, "success");
        endEditMode(); renderQuotes();
        currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
        renderItems(currentItems);
        return;
      }

      const q = {
        id: uid(), issuerId, clientId,
        numero: numeroValue || null,
        items:  JSON.parse(JSON.stringify(validItems)),
        subtotal: totals.subtotal, total: totals.total,
        notes:    notesVal,
        createdAt: new Date().toISOString()
      };
      await saveQuote(q);
      store.quotes.push(q);
      currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
      // Recarrega orçamentos do banco para garantir sincronia entre dispositivos
      await reloadQuotes();
      renderItems(currentItems); renderQuotes();
      setDefaultQuoteFields();
      showNotification(`✅ Orçamento ${q.numero} salvo com sucesso!`, "success");
      setTimeout(() => { quotesList && quotesList.scrollIntoView({ behavior:'smooth', block:'start' }); }, 300);
    } catch (err) {
      console.error("[ERROR] saveQuoteBtn:", err);
      showNotification("Erro ao salvar orçamento. Tente novamente.", "error");
    }
  });
}

function startEditMode(quoteId) {
  const q = store.quotes.find(x => x.id === quoteId);
  if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
  editingQuoteId = quoteId;
  if (selectIssuer) selectIssuer.value = q.issuerId || "";
  if (selectClient) selectClient.value = q.clientId || "";
  if (quoteNumber)  { quoteNumber.value = q.numero || ""; quoteNumber.removeAttribute("readonly"); }
  if (quoteDate) {
    const iso = q.createdAt || q.updatedAt || new Date().toISOString();
    quoteDate.value = iso.slice(0,10);
    quoteDate.removeAttribute('readonly');
  }
  if (notes) notes.value = q.notes || "";
  currentItems = JSON.parse(JSON.stringify(q.items || [{descricao:"",quantidade:1,valorUnitario:0}]));
  renderItems(currentItems);
  if (saveQuoteBtn)  saveQuoteBtn.textContent  = "💾 Atualizar Orçamento";
  if (cancelEditBtn) cancelEditBtn.style.display = "block";
  window.scrollTo({ top: 300, behavior: 'smooth' });
  showNotification("Modo de edição ativado. Você pode editar o número do orçamento!", "info");
}

function endEditMode() {
  editingQuoteId = null;
  if (saveQuoteBtn)  saveQuoteBtn.textContent  = "📄 Gerar Orçamento";
  if (cancelEditBtn) cancelEditBtn.style.display = "none";
  if (quoteNumber)   quoteNumber.setAttribute("readonly","true");
  setDefaultQuoteFields();
  if (notes) notes.value = "";
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", e => {
    e.preventDefault();
    if (!confirm("❓ Cancelar edição e limpar formulário?")) return;
    endEditMode();
    currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
    renderItems(currentItems);
    showNotification("Edição cancelada","info");
  });
}

function attachQuoteListListeners() {
  if (!quotesList) return;
  quotesList.querySelectorAll(".view-quote").forEach(btn   => { btn.addEventListener("click", e => openPreview(e.target.dataset.id)); });
  quotesList.querySelectorAll(".export-quote").forEach(btn => { btn.addEventListener("click", e => exportQuoteDoc(e.target.dataset.id)); });
  quotesList.querySelectorAll(".export-pdf").forEach(btn   => { btn.addEventListener("click", e => exportQuotePdf(e.target.dataset.id)); });
  quotesList.querySelectorAll(".edit-quote").forEach(btn   => { btn.addEventListener("click", e => startEditMode(e.target.dataset.id)); });
  quotesList.querySelectorAll(".del-quote").forEach(btn => {
    btn.addEventListener("click", async e => {
      const id = e.target.dataset.id;
      if (!confirm("❓ Excluir este orçamento permanentemente?")) return;
      try {
        await sbDelete("quotes", id);
        await reloadQuotes();
        renderQuotes();
        showNotification("Orçamento excluído", "success");
      } catch (err) { console.error("[ERROR] del-quote:", err); showNotification("Erro ao excluir orçamento", "error"); }
    });
  });
}

if (quotesSearch) {
  quotesSearch.addEventListener('input', () => {
    searchQuery = quotesSearch.value;
    if (clearSearch) clearSearch.style.display = searchQuery.length > 0 ? '' : 'none';
    renderQuotes();
  });
}

if (clearSearch) {
  clearSearch.addEventListener('click', () => {
    searchQuery = '';
    if (quotesSearch) quotesSearch.value = '';
    clearSearch.style.display = 'none';
    renderQuotes();
  });
}

// ========== PREVIEW / PRINT ==========
function openPreview(id) {
  const q = store.quotes.find(x => x.id === id);
  if (!q) { showNotification("Orçamento não encontrado","error"); return; }
  const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
  const client = store.clients.find(c => c.id === q.clientId) || {};
  const html = renderQuoteHtml(q, issuer, client);
  if (previewArea) previewArea.innerHTML = html;
  lastPreviewHtml = html;
  if (previewModal) previewModal.classList.remove("hidden");
}

if (closePreview) {
  closePreview.addEventListener("click", () => { if (previewModal) previewModal.classList.add("hidden"); });
}

if (printBtn) {
  printBtn.addEventListener("click", () => {
    try {
      const content = previewArea ? previewArea.innerHTML : "";
      if (!content) { showNotification("Nenhum conteúdo para imprimir.","info"); return; }
      triggerPrint(content, "Orçamento - SoftPrime");
    } catch (err) { console.error("[ERROR] printBtn:", err); showNotification("Erro ao imprimir.","error"); }
  });
}

// ========== EXPORTS ==========
if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", () => {
    try {
      if (!store.quotes.length) { showNotification("Nenhum orçamento para exportar","info"); return; }
      const rows = [];
      rows.push(["Número","Emissor","CNPJ/CPF Emissor","Cliente","CNPJ/CPF Cliente","Data","Subtotal (R$)","Total (R$)","Observações"].map(h => `"${h}"`).join(","));
      store.quotes.forEach(q => {
        const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
        const client = store.clients.find(c => c.id === q.clientId) || {};
        rows.push([q.numero||"",issuer.name||"",issuer.cnpjCpf||"",client.name||"",client.cnpjCpf||"",
          formatDateISOtoLocal(q.createdAt),money(q.subtotal||0),money(q.total||0),(q.notes||"").substring(0,100)]
          .map(v => `"${escapeCsv(v)}"`).join(","));
      });
      const blob = new Blob(["\uFEFF"+rows.join("\n")], {type:'text/csv;charset=utf-8;'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `orcamentos_softprime_${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      showNotification("✅ Excel exportado com sucesso!","success");
    } catch (err) { console.error("[ERROR] exportCsvBtn:", err); showNotification("Erro ao exportar Excel","error"); }
  });
}

if (exportDocBtn) {
  exportDocBtn.addEventListener("click", () => {
    try {
      if (!lastPreviewHtml) { showNotification("Abra um orçamento primeiro (Visualizar/Imprimir) para exportar","info"); return; }
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento - SoftPrime</title></head><body>${lastPreviewHtml}</body></html>`;
      const blob = new Blob([html], {type:"application/msword"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `orcamento_softprime_${Date.now()}.doc`; a.click();
      URL.revokeObjectURL(url);
      showNotification("✅ Word exportado com sucesso!","success");
    } catch (err) { console.error("[ERROR] exportDocBtn:", err); showNotification("Erro ao exportar Word","error"); }
  });
}

// ========== RENDER HTML DO ORÇAMENTO ==========
function renderQuoteHtml(q, issuer, client) {
  const dateOnly  = formatDateISOtoLocal(q.createdAt);
  const logoHtml  = issuer.logo
    ? `<div style="text-align:center;margin-bottom:20px;"><img src="${issuer.logo}" alt="Logo" style="max-height:100px;max-width:260px;object-fit:contain;" /></div>`
    : '';

  const issuerBlock = `
    <div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">EMISSOR</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(issuer.name||'—')}</div>
    ${issuer.cnpjCpf ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</div>` : ''}
    ${issuer.address ? `<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(issuer.address)}</div>` : ''}
    ${issuer.phone   ? `<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(issuer.phone)}</div>` : ''}`;

  const clientBlock = `
    <div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">DESTINATÁRIO</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(client.name||'—')}</div>
    ${client.cnpjCpf ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</div>` : ''}
    ${client.address ? `<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(client.address)}</div>` : ''}
    ${client.phone   ? `<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(client.phone)}</div>` : ''}`;

  const itemRows = q.items.map(it => `
    <tr>
      <td style="padding:10px 8px;border:1px solid #d1d5db;word-break:break-word;font-size:13px;">${escapeHtml(it.descricao||'')}</td>
      <td style="padding:10px 8px;border:1px solid #d1d5db;text-align:center;white-space:nowrap;font-size:13px;">${it.quantidade}</td>
      <td style="padding:10px 8px;border:1px solid #d1d5db;text-align:right;white-space:nowrap;font-size:13px;">R$ ${money(it.valorUnitario)}</td>
      <td style="padding:10px 8px;border:1px solid #d1d5db;text-align:right;white-space:nowrap;font-size:13px;font-weight:700;">R$ ${money((it.quantidade||0)*(it.valorUnitario||0))}</td>
    </tr>`).join('');

  const notesHtml = q.notes ? `
    <div style="margin-top:20px;padding:14px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;">
      <strong style="color:#92400e;font-size:13px;">Observações:</strong>
      <div style="margin-top:6px;color:#78350f;font-size:13px;white-space:pre-wrap;">${escapeHtml(q.notes)}</div>
    </div>` : '';

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#1a1a1a;">
      ${logoHtml}
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:24px;font-weight:800;color:#0d7de0;letter-spacing:2px;">ORÇAMENTO</div>
        <div style="font-size:17px;font-weight:600;margin-top:6px;">${escapeHtml(q.numero||q.id)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">${issuerBlock}</td>
          <td style="width:2%;"></td>
          <td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">${clientBlock}</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:0;table-layout:auto;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;word-break:break-word;">Descrição</th>
            <th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;white-space:nowrap;width:8%;">Qtd</th>
            <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;white-space:nowrap;width:20%;">Valor Unit.</th>
            <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;white-space:nowrap;width:20%;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:14px;margin-bottom:20px;table-layout:auto;">
        <tr style="background:#eef6ff;">
          <td style="padding:12px 10px;text-align:right;font-weight:700;font-size:14px;color:#0d7de0;border:2px solid #bfdbfe;">TOTAL:</td>
          <td style="padding:12px 10px;text-align:right;font-weight:800;font-size:16px;color:#0d7de0;border:2px solid #bfdbfe;white-space:nowrap;width:20%;">R$ ${money(q.total)}</td>
        </tr>
      </table>
      ${notesHtml}
      <div style="margin-top:280px;margin-bottom:30px;text-align:center;page-break-inside:avoid;">
        <div style="width:55%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div>
        <div style="font-weight:700;font-size:13px;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
      </div>
      <div style="position:fixed;bottom:16px;left:0;right:0;text-align:center;font-size:10px;color:#9ca3af;">
        Orçamento gerado em: ${escapeHtml(dateOnly)}
      </div>
    </div>`;
}

// ========== EXPORT QUOTE DOC ==========
function exportQuoteDoc(quoteId) {
  try {
    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification("Orçamento não encontrado","error"); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const dateOnly = formatDateISOtoLocal(q.createdAt);
    const moneyFmt = v => parseFloat(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    const logoHtml = issuer.logo ? `<p style="text-align:center;margin-bottom:12px;"><img src="${issuer.logo}" style="max-height:100px;max-width:260px;" /></p>` : '';
    const itemRows = (q.items||[]).map(it => `
      <tr>
        <td style="border:1px solid #ccc;padding:8px 10px;font-size:11pt;">${escapeHtml(it.descricao||'')}</td>
        <td style="border:1px solid #ccc;padding:8px 10px;text-align:center;font-size:11pt;">${it.quantidade}</td>
        <td style="border:1px solid #ccc;padding:8px 10px;text-align:right;font-size:11pt;">R$ ${moneyFmt(it.valorUnitario)}</td>
        <td style="border:1px solid #ccc;padding:8px 10px;text-align:right;font-size:11pt;font-weight:bold;">R$ ${moneyFmt((it.quantidade||0)*(it.valorUnitario||0))}</td>
      </tr>`).join('');
    const notesHtml = q.notes ? `<p style="margin-top:20px;padding:10px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:10pt;"><strong>Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g,'<br/>')}</p>` : '';

    const doc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Orçamento ${escapeHtml(q.numero||q.id)}</title>
<style>
  @page{margin:2.5cm;size:A4 portrait}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:0;padding:0}
  p{margin:0 0 4px 0;padding:0}
  .titulo{font-size:18pt;color:#0d7de0;text-align:center;font-weight:bold;letter-spacing:2px;margin:8px 0 2px 0}
  .numero{font-size:13pt;text-align:center;font-weight:normal;margin:0 0 20px 0}
  table.layout{width:100%;border-collapse:collapse;margin-bottom:20px}
  table.layout td{vertical-align:top}
  .box{padding:10px 14px;border:1pt solid #e0e0e0;background:#f9fafb}
  .label{font-size:9pt;color:#0d7de0;font-weight:bold;letter-spacing:1px;margin-bottom:5px;display:block}
  .name{font-size:12pt;font-weight:bold;margin-bottom:3px;display:block}
  .cnpj{font-size:9pt;color:#6b7280;margin:2px 0;display:block}
  .info{font-size:9pt;color:#555;margin:1px 0;display:block}
  table.items{width:100%;border-collapse:collapse;margin-top:10px}
  table.items th{background:#f2f2f2;border:1pt solid #ccc;padding:7px 10px;font-size:10pt;font-weight:bold}
  table.items td{border:1pt solid #ccc;padding:7px 10px;font-size:10pt}
  table.total-sep{width:100%;border-collapse:collapse;margin-top:14px;margin-bottom:10px}
  table.total-sep td{border:2pt solid #93c5fd;padding:9px 10px;background:#eef6ff}
  .total-label{text-align:right;font-weight:bold;color:#0d7de0;font-size:11pt}
  .total-value{text-align:right;font-weight:bold;color:#0d7de0;font-size:12pt;white-space:nowrap;width:22%}
  .sig-block{text-align:center;margin-top:160px;margin-bottom:40px}
  .footer{text-align:center;font-size:9pt;color:#888;margin-top:16px}
  @media screen and (max-width:600px){
    table.layout tr,table.layout td{display:block;width:100%!important}
    table.layout td:nth-child(2){display:none}
    table.items,table.total-sep{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
    .sig-block{margin-top:60px}
  }
</style>
</head><body>
  ${logoHtml}
  <p class="titulo">ORÇAMENTO</p>
  <p class="numero">${escapeHtml(q.numero||'')}</p>
  <table class="layout">
    <tr>
      <td style="width:49%;" class="box">
        <span class="label">EMISSOR</span>
        <span class="name">${escapeHtml(issuer.name||'—')}</span>
        ${issuer.cnpjCpf ? `<span class="cnpj">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</span>` : ''}
        ${issuer.address ? `<span class="info">${escapeHtml(issuer.address)}</span>` : ''}
        ${issuer.phone   ? `<span class="info">Tel: ${escapeHtml(issuer.phone)}</span>` : ''}
      </td>
      <td style="width:2%;"></td>
      <td style="width:49%;" class="box">
        <span class="label">DESTINATÁRIO</span>
        <span class="name">${escapeHtml(client.name||'—')}</span>
        ${client.cnpjCpf ? `<span class="cnpj">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</span>` : ''}
        ${client.address ? `<span class="info">${escapeHtml(client.address)}</span>` : ''}
        ${client.phone   ? `<span class="info">Tel: ${escapeHtml(client.phone)}</span>` : ''}
      </td>
    </tr>
  </table>
  <table class="items">
    <thead><tr>
      <th style="text-align:left;width:55%;">Descrição</th>
      <th style="text-align:center;width:10%;">Qtd</th>
      <th style="text-align:right;width:17%;">Valor Unit.</th>
      <th style="text-align:right;width:18%;">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table class="total-sep">
    <tr>
      <td class="total-label">TOTAL:</td>
      <td class="total-value">R$ ${moneyFmt(q.total||0)}</td>
    </tr>
  </table>
  ${notesHtml}
  <div class="sig-block">
    <div style="width:55%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div>
    <p style="font-weight:700;font-size:10pt;margin-top:8px;">${escapeHtml(issuer.name||'')}</p>
  </div>
  <p class="footer">Orçamento gerado em: ${dateOnly}</p>
</body></html>`;

    const blob = new Blob(['\ufeff'+doc], {type:"application/msword;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `orcamento_${q.numero||q.id}.doc`; a.click();
    URL.revokeObjectURL(url);
    showNotification("✅ Word exportado!","success");
  } catch (err) { console.error("[ERROR] exportQuoteDoc:", err); showNotification("Erro ao exportar documento","error"); }
}

// ========== PRINT ==========
function getPrintCss() {
  return `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:24px;max-width:780px;margin:0 auto;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}table{border-collapse:collapse;width:100%}img{max-width:100%;height:auto;display:block}@media print{body{padding:0}@page{margin:1.5cm;size:A4 portrait}}`;
}

function triggerPrint(bodyHtml, title) {
  const css = getPrintCss();
  const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title||'Orçamento - SoftPrime'}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`;
  try {
    let iframe = document.getElementById('_softprime_print_frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = '_softprime_print_frame';
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
    }
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(fullHtml); doc.close();
    const imgs = Array.from(doc.images);
    const pending = imgs.filter(i => !i.complete);
    const doprint = () => { iframe.contentWindow.focus(); iframe.contentWindow.print(); };
    if (!pending.length) { setTimeout(doprint, 400); return; }
    let done = 0;
    pending.forEach(img => {
      img.addEventListener('load',  () => { done++; if (done===pending.length) setTimeout(doprint,300); });
      img.addEventListener('error', () => { done++; if (done===pending.length) setTimeout(doprint,300); });
    });
  } catch(e) {
    try {
      const blob = new Blob([fullHtml],{type:'text/html;charset=utf-8'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),15000);
    } catch(e2){ showNotification("Não foi possível abrir a impressão.","error"); }
  }
}

function exportQuotePdf(quoteId) {
  try {
    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification("Orçamento não encontrado","error"); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const html = renderQuoteHtml(q, issuer, client);
    triggerPrint(html, `Orçamento ${escapeHtml(q.numero||q.id)}`);
  } catch (err) { console.error("[ERROR] exportQuotePdf:", err); showNotification("Erro ao exportar PDF","error"); }
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  await loadStore();
  renderAll();
  setDefaultQuoteFields();
  console.log("✅ SoftPrime Gerador de Orçamentos iniciado com Supabase!");
});
