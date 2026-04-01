// ===== APP.JS — GERADOR DE ORÇAMENTOS SOFTPRIME (OTIMIZADO) =====
// Supabase como storage principal | Sincronização entre dispositivos
// CORREÇÃO: Formulários não redirecionam + Melhor performance

const SUPABASE_URL = "https://eyvdyhpdahkplapltaut.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dmR5aHBkYWhrcGxhcGx0YXV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzQxNTMsImV4cCI6MjA4NzYxMDE1M30.4bQ0J...";

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Prefer": "return=representation"
};

// ===== SUPABASE FUNCTIONS =====
async function sbSelect(table, query = "") {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { ...SB_HEADERS, "Prefer": "" }
    });
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`[SB] sbSelect(${table}):`, err.message);
    return [];
  }
}

async function sbUpsert(table, data) {
  try {
    const payload = Array.isArray(data) ? data : [data];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`[SB] sbUpsert(${table}):`, err.message);
    throw err;
  }
}

async function sbDelete(table, id) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { ...SB_HEADERS, "Prefer": "" }
    });
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
  } catch (err) {
    console.error(`[SB] sbDelete(${table}):`, err.message);
    throw err;
  }
}

// ===== STORAGE & UTILITIES =====
let store = { issuers: [], clients: [], quotes: [] };
let searchQuery = '';
let currentItems = [{ descricao: "", quantidade: 1, valorUnitario: 0 }];
let editingQuoteId = null, editingIssuerId = null, editingClientId = null;
let currentIssuerLogoDataUrl = null, lastPreviewHtml = "";

const money = (v) => Number(v || 0).toFixed(2);
const escapeHtml = (str) => {
  if (!str) return "";
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};
const escapeCsv = (str) => String(str || "").replace(/"/g, '""');
const formatDateISOtoLocal = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : "";
const normalizeStr = (str) => String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const uid = () => crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

function formatQuoteNumber(n) {
  const year = new Date().getFullYear();
  return `${year}-${String(n).padStart(4, '0')}`;
}

function computeNextQuoteNumberForIssuer(issuerId) {
  let max = 0;
  (store.quotes || []).filter(q => q.issuerId === issuerId).forEach(q => {
    if (!q.numero) return;
    const m = String(q.numero).match(/(\d+)(?!.*\d)/);
    if (m) { const n = parseInt(m[0], 10); if (n > max) max = n; }
  });
  return max + 1;
}

// ===== NOTIFICATIONS =====
function showNotification(message, type = 'success') {
  const old = document.getElementById('sp-toast');
  if (old) old.remove();
  
  const colors = { success: '#16a34a', error: '#dc2626', info: '#0d7de0' };
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  const bg = colors[type] || colors.info;
  
  const toast = document.createElement('div');
  toast.id = 'sp-toast';
  toast.innerHTML = `<span style="font-size:18px;">${icon}</span><span>${message}</span>`;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;background:${bg};color:#fff;padding:14px 18px;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.25);display:flex;gap:10px;align-items:flex-start;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:500;animation:slideIn .25s ease;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 6000 : 3500);
}

function showLoadingOverlay(show) {
  let el = document.getElementById("sp-loading-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "sp-loading-overlay";
    el.innerHTML = `<div class="sp-spinner"></div><div style="color:#fff;font-size:15px;font-family:Inter,sans-serif;font-weight:500;">Carregando dados...</div>`;
    el.style.cssText = `position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;`;
    document.body.appendChild(el);
  }
  el.style.display = show ? "flex" : "none";
}

// ===== LOAD & SAVE DATA =====
async function loadStore() {
  try {
    showLoadingOverlay(true);
    const [issuers, clients, quotes] = await Promise.all([
      sbSelect("issuers", "order=created_at.asc"),
      sbSelect("clients", "order=created_at.asc"),
      sbSelect("quotes", "order=created_at.asc")
    ]);
    
    store.issuers = issuers.map(r => ({
      id: r.id, name: r.name, cnpjCpf: r.cnpj_cpf || r.cnpj || "",
      address: r.address || "", phone: r.phone || "", logo: r.logo || null, createdAt: r.created_at
    }));
    
    store.clients = clients.map(r => ({
      id: r.id, name: r.name, cnpjCpf: r.cnpj_cpf || "",
      address: r.address || "", phone: r.phone || "", createdAt: r.created_at
    }));
    
    store.quotes = quotes.map(r => ({
      id: r.id, issuerId: r.issuer_id, clientId: r.client_id, numero: r.numero,
      items: r.items || [], subtotal: r.subtotal, total: r.total,
      notes: r.notes || "", createdAt: r.created_at, updatedAt: r.updated_at || r.created_at
    }));
  } catch (err) {
    console.error("[LOAD] Error:", err);
    showNotification("Erro ao carregar dados. Verifique sua conexão.", "error");
  } finally {
    showLoadingOverlay(false);
  }
}

async function saveIssuer(issuer) {
  const row = {
    id: issuer.id, name: issuer.name, cnpj_cpf: issuer.cnpjCpf || null,
    address: issuer.address || null, phone: issuer.phone || null, logo: issuer.logo || null
  };
  await sbUpsert("issuers", row);
}

async function saveClient(client) {
  const row = {
    id: client.id, name: client.name, cnpj_cpf: client.cnpjCpf || null,
    address: client.address || null, phone: client.phone || null
  };
  await sbUpsert("clients", row);
}

async function saveQuote(quote) {
  const row = {
    id: quote.id, issuer_id: quote.issuerId, client_id: quote.clientId, numero: quote.numero || null,
    items: typeof quote.items === 'string' ? JSON.parse(quote.items) : (quote.items || []),
    subtotal: parseFloat(quote.subtotal) || 0, total: parseFloat(quote.total) || 0, notes: quote.notes || null
  };
  if (quote.createdAt) row.created_at = quote.createdAt;
  await sbUpsert("quotes", row);
}

async function reloadIssuers() {
  try {
    const rows = await sbSelect("issuers", "order=created_at.asc");
    store.issuers = rows.map(r => ({
      id: r.id, name: r.name, cnpjCpf: r.cnpj_cpf || r.cnpj || "",
      address: r.address || "", phone: r.phone || "", logo: r.logo || null, createdAt: r.created_at
    }));
  } catch (err) { console.error("[RELOAD] issuers:", err); }
}

async function reloadClients() {
  try {
    const rows = await sbSelect("clients", "order=created_at.asc");
    store.clients = rows.map(r => ({
      id: r.id, name: r.name, cnpjCpf: r.cnpj_cpf || "",
      address: r.address || "", phone: r.phone || "", createdAt: r.created_at
    }));
  } catch (err) { console.error("[RELOAD] clients:", err); }
}

async function reloadQuotes() {
  try {
    const rows = await sbSelect("quotes", "order=created_at.asc");
    store.quotes = rows.map(r => ({
      id: r.id, issuerId: r.issuer_id, clientId: r.client_id, numero: r.numero,
      items: r.items || [], subtotal: r.subtotal, total: r.total,
      notes: r.notes || "", createdAt: r.created_at, updatedAt: r.updated_at || r.created_at
    }));
  } catch (err) { console.error("[RELOAD] quotes:", err); }
}

// ===== RENDER FUNCTIONS =====
function setDefaultQuoteFields() {
  const selectIssuer = document.getElementById("selectIssuer");
  const quoteNumber = document.getElementById("quoteNumber");
  const quoteDate = document.getElementById("quoteDate");
  const notes = document.getElementById("notes");
  
  if (!quoteNumber || !quoteDate || editingQuoteId) return;
  const selectedIssuerId = selectIssuer?.value;
  const nextNum = selectedIssuerId ? computeNextQuoteNumberForIssuer(selectedIssuerId) : 1;
  quoteNumber.value = formatQuoteNumber(nextNum);
  quoteDate.value = new Date().toISOString().slice(0, 10);
  if (notes) notes.value = "";
}

function renderIssuers() {
  const selectIssuer = document.getElementById("selectIssuer");
  const issuerList = document.getElementById("issuerList");
  if (!selectIssuer) return;
  
  if (issuerList) issuerList.innerHTML = "";
  selectIssuer.innerHTML = "<option value=''>-- selecione o emissor --</option>";
  
  (store.issuers || []).forEach(i => {
    if (issuerList) {
      const li = document.createElement("li");
      li.innerHTML = `<div>${i.logo ? `<img src="${i.logo}" alt="Logo" style="max-height:40px;max-width:100px;margin-bottom:6px;border-radius:4px;" />` : ''}<strong>${escapeHtml(i.name)}</strong><div class="meta">${escapeHtml(i.cnpjCpf || '')} ${i.phone ? '• ' + escapeHtml(i.phone) : ''}</div><div class="meta">${escapeHtml(i.address || '')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-outline edit-issuer" data-id="${i.id}">✏️ Editar</button><button class="btn btn-outline del-issuer" data-id="${i.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button></div>`;
      issuerList.appendChild(li);
    }
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = `${i.name}${i.cnpjCpf ? ' — ' + i.cnpjCpf : ''}`;
    selectIssuer.appendChild(opt);
  });
}

function renderClients() {
  const selectClient = document.getElementById("selectClient");
  const clientList = document.getElementById("clientList");
  if (!selectClient) return;
  
  if (clientList) clientList.innerHTML = "";
  selectClient.innerHTML = "<option value=''>-- selecione o cliente --</option>";
  
  (store.clients || []).forEach(c => {
    if (clientList) {
      const li = document.createElement("li");
      li.innerHTML = `<div><strong>${escapeHtml(c.name)}</strong><div class="meta">${escapeHtml(c.cnpjCpf || '')} ${c.phone ? '• ' + escapeHtml(c.phone) : ''}</div><div class="meta">${escapeHtml(c.address || '')}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-outline edit-client" data-id="${c.id}">✏️ Editar</button><button class="btn btn-outline del-client" data-id="${c.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button></div>`;
      clientList.appendChild(li);
    }
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name}${c.cnpjCpf ? ' — ' + c.cnpjCpf : ''}`;
    selectClient.appendChild(opt);
  });
}

function filterQuotes(quotes) {
  const q = normalizeStr(searchQuery);
  if (!q) return quotes;
  return quotes.filter(quote => {
    const issuer = store.issuers.find(i => i.id === quote.issuerId) || {};
    const client = store.clients.find(c => c.id === quote.clientId) || {};
    const fields = [quote.numero || '', issuer.name || '', client.name || '', formatDateISOtoLocal(quote.createdAt), money(quote.total)];
    return fields.some(f => normalizeStr(f).includes(q));
  });
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const nt = normalizeStr(text), nq = normalizeStr(query);
  const idx = nt.indexOf(nq);
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + '<mark style="background:#ffeb3b;">' + escapeHtml(text.slice(idx, idx + nq.length)) + '</mark>' + escapeHtml(text.slice(idx + nq.length));
}

function renderQuotes() {
  const quotesList = document.getElementById("quotesList");
  if (!quotesList) return;
  
  quotesList.innerHTML = "";
  if (!store.quotes.length) {
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>📭 Nenhum orçamento salvo ainda</li>";
    return;
  }
  
  const filtered = filterQuotes(store.quotes.slice().reverse());
  if (!filtered.length) {
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>🔍 Nenhum orçamento corresponde à pesquisa</li>";
    return;
  }
  
  filtered.forEach(q => {
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const li = document.createElement("li");
    li.innerHTML = `<div style="flex:1;"><strong>📄 Orçamento ${highlightText(q.numero || q.id, searchQuery)}</strong><div class="meta"><span style="color:#0d7de0;">De:</span> ${highlightText(issuer.name || '—', searchQuery)}<span style="margin:0 8px;">→</span><span style="color:#0d7de0;">Para:</span> ${highlightText(client.name || '—', searchQuery)}</div><div class="meta">📅 ${formatDateISOtoLocal(q.createdAt)} • 💰 R$ ${money(q.total)}</div></div><div class="quote-actions"><button class="btn btn-outline view-quote" data-id="${q.id}">👁️ Visualizar</button><button class="btn btn-outline export-quote" data-id="${q.id}">📄 Word</button><button class="btn btn-outline export-pdf" data-id="${q.id}">📑 PDF</button><button class="btn btn-outline edit-quote" data-id="${q.id}">✏️ Editar</button><button class="btn btn-outline del-quote" data-id="${q.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button></div>`;
    quotesList.appendChild(li);
  });
  
  attachQuoteListListeners();
}

function renderItems(items = []) {
  const itemsBody = document.getElementById("itemsBody");
  if (!itemsBody) return;
  itemsBody.innerHTML = "";
  
  items.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input data-idx="${idx}" data-field="descricao" value="${escapeHtml(it.descricao || '')}" placeholder="Descrição" /></td><td><input data-idx="${idx}" data-field="quantidade" type="number" min="0" step="1" value="${it.quantidade || 1}" /></td><td><input data-idx="${idx}" data-field="valorUnitario" type="number" min="0" step="0.01" value="${it.valorUnitario || 0}" /></td><td class="item-total">R$ ${money((it.quantidade || 1) * (it.valorUnitario || 0))}</td><td><button class="del-item" data-idx="${idx}">×</button></td>`;
    itemsBody.appendChild(tr);
    
    tr.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", e => {
        const i = +e.target.dataset.idx, f = e.target.dataset.field;
        let val = e.target.value;
        if (["quantidade", "valorUnitario"].includes(f)) val = Number(val || 0);
        currentItems[i][f] = val;
        tr.querySelector(".item-total").textContent = `R$ ${money((Number(currentItems[i].quantidade || 0)) * (Number(currentItems[i].valorUnitario || 0)))}`;
        recalcTotals();
      });
    });
    
    tr.querySelector(".del-item")?.addEventListener("click", () => {
      if (currentItems.length === 1) { showNotification("Deve haver pelo menos um item", "info"); return; }
      currentItems.splice(idx, 1);
      renderItems(currentItems);
    });
  });
  
  recalcTotals();
}

function recalcTotals() {
  const subtotal = currentItems.reduce((s, it) => s + (Number(it.quantidade || 0) * Number(it.valorUnitario || 0)), 0);
  const grandTotalEl = document.getElementById("grandTotal");
  if (grandTotalEl) grandTotalEl.textContent = money(subtotal);
  return { subtotal, total: subtotal };
}

function renderAll() {
  renderIssuers();
  renderClients();
  renderQuotes();
  renderItems(currentItems);
}

// ===== ISSUER HANDLERS =====
const issuerForm = document.getElementById("issuerForm");
const issuerName = document.getElementById("issuerName");
const issuerCnpjCpf = document.getElementById("issuerCnpjCpf");
const issuerAddress = document.getElementById("issuerAddress");
const issuerPhone = document.getElementById("issuerPhone");
const issuerSubmitBtn = document.getElementById("issuerSubmitBtn");
const issuerCancelBtn = document.getElementById("issuerCancelBtn");
const issuerLogoInput = document.getElementById("issuerLogo");
const issuerLogoPreview = document.getElementById("issuerLogoPreview");
const issuerLogoImg = document.getElementById("issuerLogoImg");
const removeLogoBtn = document.getElementById("removeLogoBtn");
const issuerList = document.getElementById("issuerList");

if (issuerForm) {
  issuerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const name = (issuerName?.value || "").trim();
      const cnpjCpf = (issuerCnpjCpf?.value || "").trim();
      const address = (issuerAddress?.value || "").trim();
      const phone = (issuerPhone?.value || "").trim();
      
      if (!name) { showNotification("Preencha o nome do emissor", "error"); return; }
      
      if (editingIssuerId) {
        const item = store.issuers.find(x => x.id === editingIssuerId);
        if (item) {
          item.name = name; item.cnpjCpf = cnpjCpf; item.address = address; item.phone = phone;
          item.logo = currentIssuerLogoDataUrl;
          await saveIssuer(item);
          editingIssuerId = null;
          issuerSubmitBtn.textContent = "Adicionar Emissor";
          issuerCancelBtn.style.display = "none";
          issuerForm.reset();
          currentIssuerLogoDataUrl = null;
          if (issuerLogoInput) issuerLogoInput.value = '';
          if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
          if (issuerLogoImg) issuerLogoImg.src = '';
          await reloadIssuers();
          renderIssuers();
          renderQuotes();
          showNotification("Emissor atualizado com sucesso! ✅", "success");
          return;
        }
      }
      
      const newItem = { id: uid(), name, cnpjCpf, address, phone, logo: currentIssuerLogoDataUrl || null };
      await saveIssuer(newItem);
      store.issuers.push(newItem);
      issuerForm.reset();
      currentIssuerLogoDataUrl = null;
      if (issuerLogoInput) issuerLogoInput.value = '';
      if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
      if (issuerLogoImg) issuerLogoImg.src = '';
      await reloadIssuers();
      renderIssuers();
      renderQuotes();
      showNotification("Emissor adicionado com sucesso! ✅", "success");
    } catch (err) {
      console.error("[ERROR] issuerForm:", err.message);
      showNotification(`Erro ao salvar emissor: ${err.message}`, "error");
    }
  });
}

if (issuerList) {
  issuerList.addEventListener("click", async (e) => {
    if (e.target.classList.contains("del-issuer")) {
      const id = e.target.dataset.id;
      if (!confirm("❓ Excluir este emissor?")) return;
      try {
        await sbDelete("issuers", id);
        await reloadIssuers();
        renderIssuers();
        renderQuotes();
        showNotification("Emissor excluído", "success");
      } catch (err) { showNotification("Erro ao excluir", "error"); }
    } else if (e.target.classList.contains("edit-issuer")) {
      const id = e.target.dataset.id;
      const it = store.issuers.find(x => x.id === id);
      if (!it) return;
      editingIssuerId = id;
      if (issuerName) issuerName.value = it.name || "";
      if (issuerCnpjCpf) issuerCnpjCpf.value = it.cnpjCpf || "";
      if (issuerAddress) issuerAddress.value = it.address || "";
      if (issuerPhone) issuerPhone.value = it.phone || "";
      currentIssuerLogoDataUrl = it.logo || null;
      if (issuerLogoImg && it.logo) { issuerLogoImg.src = it.logo; if (issuerLogoPreview) issuerLogoPreview.style.display = 'block'; }
      else { if (issuerLogoPreview) issuerLogoPreview.style.display = 'none'; if (issuerLogoImg) issuerLogoImg.src = ''; }
      if (issuerLogoInput) issuerLogoInput.value = '';
      issuerSubmitBtn.textContent = "Atualizar Emissor";
      issuerCancelBtn.style.display = "inline-block";
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

if (issuerCancelBtn) {
  issuerCancelBtn.addEventListener("click", () => {
    editingIssuerId = null;
    issuerForm?.reset();
    issuerSubmitBtn.textContent = "Adicionar Emissor";
    issuerCancelBtn.style.display = "none";
    currentIssuerLogoDataUrl = null;
    if (issuerLogoInput) issuerLogoInput.value = '';
    if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
    if (issuerLogoImg) issuerLogoImg.src = '';
  });
}

if (issuerLogoInput) {
  issuerLogoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { showNotification('Imagem muito grande. Máximo 4MB.', 'error'); issuerLogoInput.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      currentIssuerLogoDataUrl = ev.target.result;
      if (issuerLogoImg) issuerLogoImg.src = currentIssuerLogoDataUrl;
      if (issuerLogoPreview) issuerLogoPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}

if (removeLogoBtn) {
  removeLogoBtn.addEventListener('click', () => {
    currentIssuerLogoDataUrl = null;
    if (issuerLogoInput) issuerLogoInput.value = '';
    if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
    if (issuerLogoImg) issuerLogoImg.src = '';
  });
}

// ===== CLIENT HANDLERS =====
const clientForm = document.getElementById("clientForm");
const clientName = document.getElementById("clientName");
const clientCnpjCpf = document.getElementById("clientCnpjCpf");
const clientAddress = document.getElementById("clientAddress");
const clientPhone = document.getElementById("clientPhone");
const clientSubmitBtn = document.getElementById("clientSubmitBtn");
const clientCancelBtn = document.getElementById("clientCancelBtn");
const clientList = document.getElementById("clientList");

if (clientForm) {
  clientForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const name = (clientName?.value || "").trim();
      const cnpjCpf = (clientCnpjCpf?.value || "").trim();
      const address = (clientAddress?.value || "").trim();
      const phone = (clientPhone?.value || "").trim();
      
      if (!name) { showNotification("Preencha o nome do cliente", "error"); return; }
      
      if (editingClientId) {
        const item = store.clients.find(x => x.id === editingClientId);
        if (item) {
          item.name = name; item.cnpjCpf = cnpjCpf; item.address = address; item.phone = phone;
          await saveClient(item);
          editingClientId = null;
          clientSubmitBtn.textContent = "Adicionar Cliente";
          clientCancelBtn.style.display = "none";
          clientForm.reset();
          await reloadClients();
          renderClients();
          renderQuotes();
          showNotification("Cliente atualizado com sucesso! ✅", "success");
          return;
        }
      }
      
      const newItem = { id: uid(), name, cnpjCpf, address, phone };
      await saveClient(newItem);
      store.clients.push(newItem);
      clientForm.reset();
      await reloadClients();
      renderClients();
      renderQuotes();
      showNotification("Cliente adicionado com sucesso! ✅", "success");
    } catch (err) {
      console.error("[ERROR] clientForm:", err.message);
      showNotification(`Erro ao salvar cliente: ${err.message}`, "error");
    }
  });
}

if (clientList) {
  clientList.addEventListener("click", async (e) => {
    if (e.target.classList.contains("del-client")) {
      const id = e.target.dataset.id;
      if (!confirm("❓ Excluir este cliente?")) return;
      try {
        await sbDelete("clients", id);
        await reloadClients();
        renderClients();
        renderQuotes();
        showNotification("Cliente excluído", "success");
      } catch (err) { showNotification("Erro ao excluir", "error"); }
    } else if (e.target.classList.contains("edit-client")) {
      const id = e.target.dataset.id;
      const it = store.clients.find(x => x.id === id);
      if (!it) return;
      editingClientId = id;
      if (clientName) clientName.value = it.name || "";
      if (clientCnpjCpf) clientCnpjCpf.value = it.cnpjCpf || "";
      if (clientAddress) clientAddress.value = it.address || "";
      if (clientPhone) clientPhone.value = it.phone || "";
      clientSubmitBtn.textContent = "Atualizar Cliente";
      clientCancelBtn.style.display = "inline-block";
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

if (clientCancelBtn) {
  clientCancelBtn.addEventListener("click", () => {
    editingClientId = null;
    clientForm?.reset();
    clientSubmitBtn.textContent = "Adicionar Cliente";
    clientCancelBtn.style.display = "none";
  });
}

// ===== ITEM HANDLERS =====
const addItemBtn = document.getElementById("addItemBtn");
if (addItemBtn) {
  addItemBtn.addEventListener("click", (e) => {
    e.preventDefault();
    currentItems.push({ descricao: "", quantidade: 1, valorUnitario: 0 });
    renderItems(currentItems);
    setTimeout(() => {
      const last = currentItems.length - 1;
      const inp = document.querySelector(`input[data-idx="${last}"][data-field="descricao"]`);
      inp?.focus();
    }, 100);
  });
}

// ===== QUOTE HANDLERS =====
const selectIssuer = document.getElementById("selectIssuer");
const selectClient = document.getElementById("selectClient");
const quoteNumber = document.getElementById("quoteNumber");
const quoteDate = document.getElementById("quoteDate");
const notes = document.getElementById("notes");
const saveQuoteBtn = document.getElementById("saveQuoteBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const quotesSearch = document.getElementById("quotesSearch");
const clearSearch = document.getElementById("clearSearch");

if (selectIssuer) {
  selectIssuer.addEventListener('change', () => { if (!editingQuoteId) setDefaultQuoteFields(); });
}

if (saveQuoteBtn) {
  saveQuoteBtn.addEventListener("click", async () => {
    try {
      const issuerId = selectIssuer?.value;
      const clientId = selectClient?.value;
      if (!issuerId || !clientId) { showNotification("Selecione emissor e cliente", "error"); return; }
      
      const validItems = currentItems.filter(it => (it.descricao || "").trim() !== "");
      if (!validItems.length) { showNotification("Adicione pelo menos um item com descrição", "error"); return; }
      
      const totals = recalcTotals();
      let numeroValue = (quoteNumber?.value || "").trim();
      if (!numeroValue) numeroValue = formatQuoteNumber(computeNextQuoteNumberForIssuer(issuerId));
      const notesVal = (notes?.value || "").trim();
      
      if (editingQuoteId) {
        const q = store.quotes.find(x => x.id === editingQuoteId);
        if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
        q.issuerId = issuerId; q.clientId = clientId; q.numero = numeroValue || null;
        q.items = JSON.parse(JSON.stringify(validItems));
        q.subtotal = totals.subtotal; q.total = totals.total;
        q.notes = notesVal;
        if (quoteDate?.value) q.createdAt = new Date(quoteDate.value + 'T12:00:00').toISOString();
        q.updatedAt = new Date().toISOString();
        await saveQuote(q);
        await reloadQuotes();
        showNotification(`✅ Orçamento ${q.numero} atualizado!`, "success");
        endEditMode();
        renderQuotes();
        currentItems = [{ descricao: "", quantidade: 1, valorUnitario: 0 }];
        renderItems(currentItems);
        return;
      }
      
      const q = {
        id: uid(), issuerId, clientId, numero: numeroValue || null,
        items: JSON.parse(JSON.stringify(validItems)),
        subtotal: totals.subtotal, total: totals.total, notes: notesVal,
        createdAt: new Date().toISOString()
      };
      await saveQuote(q);
      store.quotes.push(q);
      currentItems = [{ descricao: "", quantidade: 1, valorUnitario: 0 }];
      await reloadQuotes();
      renderItems(currentItems);
      renderQuotes();
      setDefaultQuoteFields();
      showNotification(`✅ Orçamento ${q.numero} salvo com sucesso!`, "success");
    } catch (err) {
      console.error("[ERROR] saveQuoteBtn:", err.message);
      showNotification(`Erro ao salvar orçamento: ${err.message}`, "error");
    }
  });
}

function startEditMode(quoteId) {
  const q = store.quotes.find(x => x.id === quoteId);
  if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
  editingQuoteId = quoteId;
  if (selectIssuer) selectIssuer.value = q.issuerId || "";
  if (selectClient) selectClient.value = q.clientId || "";
  if (quoteNumber) { quoteNumber.value = q.numero || ""; quoteNumber.removeAttribute("readonly"); }
  if (quoteDate) {
    const iso = q.createdAt || q.updatedAt || new Date().toISOString();
    quoteDate.value = iso.slice(0, 10);
    quoteDate.removeAttribute('readonly');
  }
  if (notes) notes.value = q.notes || "";
  currentItems = JSON.parse(JSON.stringify(q.items || [{ descricao: "", quantidade: 1, valorUnitario: 0 }]));
  renderItems(currentItems);
  saveQuoteBtn.textContent = "💾 Atualizar Orçamento";
  cancelEditBtn.style.display = "block";
  window.scrollTo({ top: 300, behavior: 'smooth' });
  showNotification("Modo de edição ativado. Você pode editar o número do orçamento!", "info");
}

function endEditMode() {
  editingQuoteId = null;
  saveQuoteBtn.textContent = "📄 Gerar Orçamento";
  cancelEditBtn.style.display = "none";
  if (quoteNumber) quoteNumber.setAttribute("readonly", "true");
  setDefaultQuoteFields();
  if (notes) notes.value = "";
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!confirm("❓ Cancelar edição e limpar formulário?")) return;
    endEditMode();
    currentItems = [{ descricao: "", quantidade: 1, valorUnitario: 0 }];
    renderItems(currentItems);
    showNotification("Edição cancelada", "info");
  });
}

function attachQuoteListListeners() {
  const quotesList = document.getElementById("quotesList");
  if (!quotesList) return;
  quotesList.querySelectorAll(".view-quote").forEach(btn => { btn.addEventListener("click", e => openPreview(e.target.dataset.id)); });
  quotesList.querySelectorAll(".export-quote").forEach(btn => { btn.addEventListener("click", e => exportQuoteDoc(e.target.dataset.id)); });
  quotesList.querySelectorAll(".export-pdf").forEach(btn => { btn.addEventListener("click", e => exportQuotePdf(e.target.dataset.id)); });
  quotesList.querySelectorAll(".edit-quote").forEach(btn => { btn.addEventListener("click", e => startEditMode(e.target.dataset.id)); });
  quotesList.querySelectorAll(".del-quote").forEach(btn => {
    btn.addEventListener("click", async e => {
      const id = e.target.dataset.id;
      if (!confirm("❓ Excluir este orçamento permanentemente?")) return;
      try {
        await sbDelete("quotes", id);
        await reloadQuotes();
        renderQuotes();
        showNotification("Orçamento excluído", "success");
      } catch (err) { showNotification("Erro ao excluir", "error"); }
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

// ===== PREVIEW / EXPORT =====
const previewModal = document.getElementById("previewModal");
const previewArea = document.getElementById("previewArea");
const closePreview = document.getElementById("closePreview");
const printBtn = document.getElementById("printBtn");

function openPreview(id) {
  const q = store.quotes.find(x => x.id === id);
  if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
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
      const content = previewArea?.innerHTML || "";
      if (!content) { showNotification("Nenhum conteúdo para imprimir.", "info"); return; }
      triggerPrint(content, "Orçamento - SoftPrime");
    } catch (err) { showNotification("Erro ao imprimir.", "error"); }
  });
}

function renderQuoteHtml(q, issuer, client) {
  const dateOnly = formatDateISOtoLocal(q.createdAt);
  const logoHtml = issuer.logo ? `<div style="text-align:center;margin-bottom:20px;"><img src="${issuer.logo}" alt="Logo" style="max-height:100px;max-width:260px;object-fit:contain;" /></div>` : '';
  
  const issuerBlock = `<div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">EMISSOR</div><div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(issuer.name || '—')}</div>${issuer.cnpjCpf ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</div>` : ''}${issuer.address ? `<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(issuer.address)}</div>` : ''}${issuer.phone ? `<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(issuer.phone)}</div>` : ''}`;
  
  const clientBlock = `<div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">DESTINATÁRIO</div><div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(client.name || '—')}</div>${client.cnpjCpf ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</div>` : ''}${client.address ? `<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(client.address)}</div>` : ''}${client.phone ? `<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(client.phone)}</div>` : ''}`;
  
  const itemRows = q.items.map(it => `<tr><td style="padding:10px 8px;border:1px solid #d1d5db;word-break:break-word;font-size:13px;">${escapeHtml(it.descricao || '')}</td><td style="padding:10px 8px;border:1px solid #d1d5db;text-align:center;font-size:13px;">${it.quantidade}</td><td style="padding:10px 8px;border:1px solid #d1d5db;text-align:right;font-size:13px;">R$ ${money(it.valorUnitario)}</td><td style="padding:10px 8px;border:1px solid #d1d5db;text-align:right;font-weight:700;font-size:13px;">R$ ${money((it.quantidade || 0) * (it.valorUnitario || 0))}</td></tr>`).join('');
  
  const notesHtml = q.notes ? `<div style="margin-top:20px;padding:14px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;"><strong style="color:#92400e;font-size:13px;">Observações:</strong><div style="margin-top:6px;color:#78350f;font-size:13px;white-space:pre-wrap;">${escapeHtml(q.notes)}</div></div>` : '';
  
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#1a1a1a;">${logoHtml}<div style="text-align:center;margin-bottom:24px;"><div style="font-size:24px;font-weight:800;color:#0d7de0;letter-spacing:2px;">ORÇAMENTO</div><div style="font-size:17px;font-weight:600;margin-top:6px;">${escapeHtml(q.numero || q.id)}</div></div><table style="width:100%;border-collapse:collapse;margin-bottom:24px;"><tr><td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">${issuerBlock}</td><td style="width:2%;"></td><td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">${clientBlock}</td></tr></table><table style="width:100%;border-collapse:collapse;margin-bottom:0;"><thead><tr style="background:#f3f4f6;"><th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;">Descrição</th><th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;width:8%;">Qtd</th><th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;width:20%;">Valor Unit.</th><th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;width:20%;">Total</th></tr></thead><tbody>${itemRows}</tbody></table><table style="width:100%;border-collapse:collapse;margin-top:14px;margin-bottom:20px;"><tr style="background:#eef6ff;"><td style="padding:12px 10px;text-align:right;font-weight:700;font-size:14px;color:#0d7de0;border:2px solid #bfdbfe;">TOTAL:</td><td style="padding:12px 10px;text-align:right;font-weight:800;font-size:16px;color:#0d7de0;border:2px solid #bfdbfe;white-space:nowrap;width:20%;">R$ ${money(q.total)}</td></tr></table>${notesHtml}<div style="margin-top:280px;margin-bottom:30px;text-align:center;page-break-inside:avoid;"><div style="width:55%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div><div style="font-weight:700;font-size:13px;margin-top:8px;">${escapeHtml(issuer.name || '')}</div></div><div style="position:fixed;bottom:16px;left:0;right:0;text-align:center;font-size:10px;color:#9ca3af;">Orçamento gerado em: ${escapeHtml(dateOnly)}</div></div>`;
}

function exportQuoteDoc(quoteId) {
  try {
    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const dateOnly = formatDateISOtoLocal(q.createdAt);
    const moneyFmt = v => parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const logoHtml = issuer.logo ? `<p style="text-align:center;margin-bottom:12px;"><img src="${issuer.logo}" style="max-height:100px;max-width:260px;" /></p>` : '';
    const itemRows = (q.items || []).map(it => `<tr><td style="border:1px solid #ccc;padding:8px 10px;font-size:11pt;">${escapeHtml(it.descricao || '')}</td><td style="border:1px solid #ccc;padding:8px 10px;text-align:center;font-size:11pt;">${it.quantidade}</td><td style="border:1px solid #ccc;padding:8px 10px;text-align:right;font-size:11pt;">R$ ${moneyFmt(it.valorUnitario)}</td><td style="border:1px solid #ccc;padding:8px 10px;text-align:right;font-size:11pt;font-weight:bold;">R$ ${moneyFmt((it.quantidade || 0) * (it.valorUnitario || 0))}</td></tr>`).join('');
    const notesHtml = q.notes ? `<p style="margin-top:20px;padding:10px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:10pt;"><strong>Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g, '<br>')}</p>` : '';
    
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento ${escapeHtml(q.numero || q.id)}</title><style>body{font-family:Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:0;padding:20px;}.titulo{font-size:18pt;color:#0d7de0;text-align:center;font-weight:bold;margin:8px 0 20px 0;}.numero{font-size:13pt;text-align:center;margin:0 0 20px 0;}.box{padding:10px 14px;border:1pt solid #e0e0e0;background:#f9fafb;margin-bottom:20px;}.label{font-size:9pt;color:#0d7de0;font-weight:bold;margin-bottom:5px;display:block;}.name{font-size:12pt;font-weight:bold;margin-bottom:3px;display:block;}.cnpj{font-size:9pt;color:#666;margin:2px 0;display:block;}table.items{width:100%;border-collapse:collapse;margin:20px 0;}table.items th{background:#f2f2f2;border:1pt solid #ccc;padding:7px 10px;font-size:10pt;font-weight:bold;}table.items td{border:1pt solid #ccc;padding:7px 10px;font-size:10pt;}.total{margin:10px 0;text-align:right;font-weight:bold;font-size:12pt;color:#0d7de0;}.footer{text-align:center;font-size:9pt;color:#888;margin-top:20px;}</style></head><body>${logoHtml}<p class="titulo">ORÇAMENTO</p><p class="numero">${escapeHtml(q.numero || '')}</p><div class="box"><span class="label">EMISSOR</span><span class="name">${escapeHtml(issuer.name || '—')}</span>${issuer.cnpjCpf ? `<span class="cnpj">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</span>` : ''}${issuer.address ? `<span class="cnpj">${escapeHtml(issuer.address)}</span>` : ''}${issuer.phone ? `<span class="cnpj">Tel: ${escapeHtml(issuer.phone)}</span>` : ''}</div><div class="box"><span class="label">DESTINATÁRIO</span><span class="name">${escapeHtml(client.name || '—')}</span>${client.cnpjCpf ? `<span class="cnpj">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</span>` : ''}${client.address ? `<span class="cnpj">${escapeHtml(client.address)}</span>` : ''}${client.phone ? `<span class="cnpj">Tel: ${escapeHtml(client.phone)}</span>` : ''}</div><table class="items"><thead><tr><th style="text-align:left;width:55%;">Descrição</th><th style="text-align:center;width:10%;">Qtd</th><th style="text-align:right;width:17%;">Valor Unit.</th><th style="text-align:right;width:18%;">Total</th></tr></thead><tbody>${itemRows}</tbody></table><p class="total">TOTAL: R$ ${moneyFmt(q.total || 0)}</p>${notesHtml}<p class="footer">Orçamento gerado em: ${dateOnly}</p></body></html>`;
    
    const blob = new Blob(['\ufeff' + doc], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orcamento_${q.numero || q.id}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("✅ Word exportado!", "success");
  } catch (err) { showNotification("Erro ao exportar documento", "error"); }
}

function triggerPrint(bodyHtml, title) {
  try {
    let iframe = document.getElementById('_softprime_print_frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = '_softprime_print_frame';
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
      document.body.appendChild(iframe);
    }
    const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title || 'Orçamento - SoftPrime'}</title></head><body>${bodyHtml}</body></html>`;
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 300);
  } catch (e) { showNotification("Não foi possível abrir a impressão.", "error"); }
}

function exportQuotePdf(quoteId) {
  try {
    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const html = renderQuoteHtml(q, issuer, client);
    triggerPrint(html, `Orçamento ${escapeHtml(q.numero || q.id)}`);
  } catch (err) { showNotification("Erro ao exportar PDF", "error"); }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadStore();
  renderAll();
  setDefaultQuoteFields();
  console.log("✅ SoftPrime iniciado!");
});