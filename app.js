// app.js — Gerador de Orçamentos SoftPrime
// Sistema completo com localStorage, validações e exportações
// ATUALIZADO: Excel formatado + Word com assinatura + Visualizar/Imprimir

const STORE_KEY = "softprime_quotes_v2";

function uid(){ return Math.random().toString(36).slice(2,9); }
const money = v => Number(v||0).toFixed(2);

// ========== STORAGE ==========
function loadStore(){
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw){
    const seed = { issuers: [], clients: [], quotes: [] };
    localStorage.setItem(STORE_KEY, JSON.stringify(seed));
    return seed;
  }
  const s = JSON.parse(raw);
  s.issuers = s.issuers || [];
  s.clients = s.clients || [];
  s.quotes = s.quotes || [];
  return s;
}

function saveStore(s){ 
  localStorage.setItem(STORE_KEY, JSON.stringify(s)); 
}

function computeNextQuoteNumberFromQuotes(quotes){
  if (!quotes || !quotes.length) return 1;
  let max = 0;
  for (const q of quotes){
    if (!q.numero) continue;
    const m = String(q.numero).match(/(\d+)(?!.*\d)/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function computeNextQuoteNumberForIssuer(issuerId){
  const issuerQuotes = (store.quotes || []).filter(q => q.issuerId === issuerId);
  if (!issuerQuotes.length) return 1;
  let max = 0;
  for (const q of issuerQuotes){
    if (!q.numero) continue;
    const m = String(q.numero).match(/(\d+)(?!.*\d)/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function formatQuoteNumber(n){
  const year = new Date().getFullYear();
  return `${year}-${String(n).padStart(4,'0')}`;
}

let store = loadStore();

// ========== DOM ELEMENTS ==========
const issuerForm = document.getElementById("issuerForm");
const issuerList = document.getElementById("issuerList");
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

const clientForm = document.getElementById("clientForm");
const clientList = document.getElementById("clientList");
const clientName = document.getElementById("clientName");
const clientCnpjCpf = document.getElementById("clientCnpjCpf");
const clientAddress = document.getElementById("clientAddress");
const clientPhone = document.getElementById("clientPhone");
const clientSubmitBtn = document.getElementById("clientSubmitBtn");
const clientCancelBtn = document.getElementById("clientCancelBtn");

const selectIssuer = document.getElementById("selectIssuer");
const selectClient = document.getElementById("selectClient");
const quoteNumber = document.getElementById("quoteNumber");
const quoteDate = document.getElementById("quoteDate");
const notes = document.getElementById("notes");

const itemsBody = document.getElementById("itemsBody");
const addItemBtn = document.getElementById("addItemBtn");
const subtotalEl = document.getElementById("subtotal");
const grandTotalEl = document.getElementById("grandTotal");
const saveQuoteBtn = document.getElementById("saveQuoteBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const quotesList = document.getElementById("quotesList");
const quotesSearch = document.getElementById("quotesSearch");
const clearSearch = document.getElementById("clearSearch");
const filterResultsCount = document.getElementById("filterResultsCount");

const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportDocBtn = document.getElementById("exportDocBtn");

const previewModal = document.getElementById("previewModal");
const previewArea = document.getElementById("previewArea");
const closePreview = document.getElementById("closePreview");
const printBtn = document.getElementById("printBtn");

let currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
let editingQuoteId = null;
let editingIssuerId = null;
let editingClientId = null;
let lastPreviewHtml = "";
let currentIssuerLogoDataUrl = null;

// ===== FILTRO DE ORÇAMENTOS =====
let searchQuery = '';

function normalizeStr(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filterQuotes(quotes) {
  let result = quotes;
  const q = normalizeStr(searchQuery);
  if (q.length > 0) {
    result = result.filter(quote => {
      const issuer = store.issuers.find(i => i.id === quote.issuerId) || {};
      const client = store.clients.find(c => c.id === quote.clientId) || {};
      const fields = [
        quote.numero || '',
        issuer.name || '',
        client.name || '',
        formatDateISOtoLocal(quote.createdAt),
        money(quote.total),
      ];
      return fields.some(f => normalizeStr(f).includes(q));
    });
  }
  return result;
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const normalizedText = normalizeStr(text);
  const normalizedQuery = normalizeStr(query);
  if (!normalizedQuery) return escapeHtml(text);
  const idx = normalizedText.indexOf(normalizedQuery);
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, idx)) +
    '<mark class="search-highlight">' +
    escapeHtml(text.slice(idx, idx + normalizedQuery.length)) +
    '</mark>' +
    escapeHtml(text.slice(idx + normalizedQuery.length))
  );
}

// ========== UTILITY FUNCTIONS ==========
function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(str){
  if (str === null || str === undefined) return "";
  return String(str).replace(/"/g, '""');
}

function formatDateISOtoLocal(iso){
  if (!iso) return "";
  return new Date(iso).toLocaleDateString('pt-BR');
}

function setDefaultQuoteFields(){
  if (!quoteNumber || !quoteDate) return;
  if (editingQuoteId) return;

  const selectedIssuerId = selectIssuer ? selectIssuer.value : null;
  let nextNum;
  if (selectedIssuerId) {
    nextNum = computeNextQuoteNumberForIssuer(selectedIssuerId);
  } else {
    nextNum = 1;
  }

  quoteNumber.value = formatQuoteNumber(nextNum);
  quoteDate.value = new Date().toISOString().slice(0, 10);
  if (notes) notes.value = "";
}

function showNotification(message, type = 'success'){
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  alert(`${icon} ${message}`);
}

// ========== RENDER FUNCTIONS ==========
function renderIssuers(){
  if (!selectIssuer) return;
  
  if (issuerList) issuerList.innerHTML = "";
  selectIssuer.innerHTML = "<option value=''>-- selecione o emissor --</option>";
  
  (store.issuers || []).forEach(i=>{
    if (issuerList) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          ${i.logo ? `<img src="${i.logo}" alt="Logo" style="max-height:40px;max-width:100px;margin-bottom:6px;border-radius:4px;" />` : ''}
          <strong>${escapeHtml(i.name)}</strong>
          <div class="meta">${escapeHtml(i.cnpjCpf||'')} ${i.phone ? '• ' + escapeHtml(i.phone) : ''}</div>
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
    opt.textContent = `${i.name} ${i.cnpjCpf ? '— ' + i.cnpjCpf : ''}`;
    selectIssuer.appendChild(opt);
  });
}

function renderClients(){
  if (!selectClient) return;
  
  if (clientList) clientList.innerHTML = "";
  selectClient.innerHTML = "<option value=''>-- selecione o cliente --</option>";
  
  (store.clients || []).forEach(c=>{
    if (clientList) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <div class="meta">${escapeHtml(c.cnpjCpf||'')} ${c.phone ? '• ' + escapeHtml(c.phone) : ''}</div>
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
    opt.textContent = `${c.name} ${c.cnpjCpf ? '— ' + c.cnpjCpf : ''}`;
    selectClient.appendChild(opt);
  });
}

function renderQuotes(){
  if (!quotesList) return;
  quotesList.innerHTML = "";

  if (!store.quotes.length) {
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>📭 Nenhum orçamento salvo ainda</li>";
    if (filterResultsCount) { filterResultsCount.textContent = ''; filterResultsCount.className = 'filter-results-count'; }
    return;
  }

  const filtered = filterQuotes(store.quotes.slice().reverse());
  const total = store.quotes.length;
  const shown = filtered.length;
  const isFiltering = searchQuery.length > 0;

  if (filterResultsCount) {
    if (isFiltering) {
      filterResultsCount.textContent = shown === 0
        ? 'Nenhum orçamento encontrado'
        : `Exibindo ${shown} de ${total} orçamento${total !== 1 ? 's' : ''}`;
      filterResultsCount.className = 'filter-results-count' + (shown === 0 ? ' no-results' : '');
    } else {
      filterResultsCount.textContent = '';
      filterResultsCount.className = 'filter-results-count';
    }
  }

  if (filtered.length === 0) {
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>🔍 Nenhum orçamento corresponde à pesquisa</li>";
    return;
  }

  filtered.forEach(q=>{
    const issuer = store.issuers.find(i=>i.id===q.issuerId) || {};
    const client = store.clients.find(c=>c.id===q.clientId) || {};
    const li = document.createElement("li");
    li.innerHTML = `
      <div style="flex:1;">
        <strong>📄 Orçamento ${highlightText(q.numero||q.id, searchQuery)}</strong>
        <div class="meta">
          <span style="color:#0d7de0;">De:</span> ${highlightText(issuer.name||'—', searchQuery)}
          <span style="margin:0 8px;">→</span>
          <span style="color:#0d7de0;">Para:</span> ${highlightText(client.name||'—', searchQuery)}
        </div>
        <div class="meta">
          📅 ${formatDateISOtoLocal(q.createdAt)} •
          💰 R$ ${money(q.total)}
        </div>
      </div>
      <div class="quote-actions">
        <button class="btn btn-outline view-quote" data-id="${q.id}">👁️ Visualizar/Imprimir</button>
        <button class="btn btn-outline export-quote" data-id="${q.id}">📄 Word</button>
        <button class="btn btn-outline export-pdf" data-id="${q.id}">📑 PDF</button>
        <button class="btn btn-outline edit-quote" data-id="${q.id}">✏️ Editar</button>
        <button class="btn btn-outline del-quote" data-id="${q.id}" style="color:#dc2626;border-color:#fecaca;">🗑️ Excluir</button>
      </div>`;
    quotesList.appendChild(li);
  });

  attachQuoteListListeners();
}

function renderItems(items=[]){
  if (!itemsBody) return;
  itemsBody.innerHTML = "";
  
  items.forEach((it, idx)=>{
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td>
        <input data-idx="${idx}" data-field="descricao" value="${escapeHtml(it.descricao||'')}" placeholder="Descrição do item" aria-label="Descrição do item ${idx + 1}" />
      </td>
      <td>
        <input data-idx="${idx}" data-field="quantidade" type="number" min="0" step="1" value="${it.quantidade||1}" aria-label="Quantidade do item ${idx + 1}" />
      </td>
      <td>
        <input data-idx="${idx}" data-field="valorUnitario" type="number" min="0" step="0.01" value="${it.valorUnitario||0}" aria-label="Valor unitário do item ${idx + 1}" />
      </td>
      <td class="item-total">R$ ${money((it.quantidade||1)*(it.valorUnitario||0))}</td>
      <td>
        <button class="del-item" data-idx="${idx}" aria-label="Remover item ${idx + 1}">×</button>
      </td>
    `;
    itemsBody.appendChild(tr);

    const inputs = tr.querySelectorAll("input");
    inputs.forEach(inp => {
      inp.addEventListener("input", (e) => {
        const idx = +e.target.dataset.idx;
        const field = e.target.dataset.field;
        let val = e.target.value;
        if (["quantidade","valorUnitario"].includes(field)) val = Number(val || 0);
        currentItems[idx][field] = val;
        const it = currentItems[idx];
        const total = (Number(it.quantidade||0) * Number(it.valorUnitario||0));
        const td = tr.querySelector(".item-total");
        if (td) td.textContent = `R$ ${money(total)}`;
        recalcTotals();
      });
    });

    const delBtn = tr.querySelector(".del-item");
    delBtn && delBtn.addEventListener("click", () => {
      if (currentItems.length === 1) {
        showNotification("Deve haver pelo menos um item no orçamento", "info");
        return;
      }
      currentItems.splice(idx, 1);
      renderItems(currentItems);
    });
  });

  recalcTotals();
}

function recalcTotals(){
  const subtotal = currentItems.reduce((s,it)=> s + (Number(it.quantidade||0) * Number(it.valorUnitario||0)), 0);
  const total = subtotal;
  if (subtotalEl) subtotalEl.textContent = money(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = money(total);
  return {subtotal,total};
}

// ========== ISSUER HANDLERS ==========
if (issuerForm) {
  issuerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const name = (issuerName && issuerName.value || "").trim();
      const cnpjCpf = (issuerCnpjCpf && issuerCnpjCpf.value || "").trim();
      const address = (issuerAddress && issuerAddress.value || "").trim();
      const phone = (issuerPhone && issuerPhone.value || "").trim();

      if (!name) { showNotification("Preencha o nome do emissor", "error"); return; }

      store.issuers = store.issuers || [];

      if (editingIssuerId) {
        const item = store.issuers.find(x => x.id === editingIssuerId);
        if (item) {
          item.name = name; item.cnpjCpf = cnpjCpf; item.address = address; item.phone = phone;
          item.logo = currentIssuerLogoDataUrl;
          saveStore(store);
          editingIssuerId = null;
          if (issuerSubmitBtn) issuerSubmitBtn.textContent = "Adicionar Emissor";
          if (issuerCancelBtn) issuerCancelBtn.style.display = "none";
          issuerForm.reset();
          currentIssuerLogoDataUrl = null;
          if (issuerLogoInput) issuerLogoInput.value = '';
          if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
          if (issuerLogoImg) issuerLogoImg.src = '';
          renderIssuers(); renderQuotes();
          showNotification("Emissor atualizado com sucesso!", "success");
          return;
        }
      }

      const newItem = { id: uid(), name, cnpjCpf, address, phone, logo: currentIssuerLogoDataUrl || null };
      store.issuers.push(newItem);
      saveStore(store);
      issuerForm.reset();
      currentIssuerLogoDataUrl = null;
      if (issuerLogoInput) issuerLogoInput.value = '';
      if (issuerLogoPreview) issuerLogoPreview.style.display = 'none';
      if (issuerLogoImg) issuerLogoImg.src = '';
      renderIssuers(); renderQuotes();
      showNotification("Emissor adicionado com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] issuerForm handler:", err);
      showNotification("Erro ao adicionar emissor. Tente novamente.", "error");
    }
  });
}

if (issuerList) {
  issuerList.addEventListener("click", (e) => {
    try {
      if (e.target.classList.contains("del-issuer")) {
        const id = e.target.dataset.id;
        if (!confirm("❓ Excluir este emissor?")) return;
        store.issuers = store.issuers.filter(x => x.id !== id);
        saveStore(store); renderIssuers(); renderQuotes();
        showNotification("Emissor excluído", "success");
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
        if (issuerSubmitBtn) issuerSubmitBtn.textContent = "Atualizar Emissor";
        if (issuerCancelBtn) issuerCancelBtn.style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { console.error("[ERROR] issuerList click:", err); }
  });
}

if (issuerCancelBtn) {
  issuerCancelBtn.addEventListener("click", () => {
    editingIssuerId = null; issuerForm && issuerForm.reset();
    if (issuerSubmitBtn) issuerSubmitBtn.textContent = "Adicionar Emissor";
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

// ========== CLIENT HANDLERS ==========
if (clientForm) {
  clientForm.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const name = (clientName && clientName.value || "").trim();
      const cnpjCpf = (clientCnpjCpf && clientCnpjCpf.value || "").trim();
      const address = (clientAddress && clientAddress.value || "").trim();
      const phone = (clientPhone && clientPhone.value || "").trim();

      if (!name) { showNotification("Preencha o nome do cliente", "error"); return; }

      store.clients = store.clients || [];

      if (editingClientId) {
        const item = store.clients.find(x => x.id === editingClientId);
        if (item) {
          item.name = name; item.cnpjCpf = cnpjCpf; item.address = address; item.phone = phone;
          saveStore(store);
          editingClientId = null;
          if (clientSubmitBtn) clientSubmitBtn.textContent = "Adicionar Cliente";
          if (clientCancelBtn) clientCancelBtn.style.display = "none";
          clientForm.reset();
          renderClients(); renderQuotes();
          showNotification("Cliente atualizado com sucesso!", "success");
          return;
        }
      }

      const newItem = { id: uid(), name, cnpjCpf, address, phone };
      store.clients.push(newItem);
      saveStore(store);
      clientForm.reset();
      renderClients(); renderQuotes();
      showNotification("Cliente adicionado com sucesso!", "success");
    } catch (err) {
      console.error("[ERROR] clientForm handler:", err);
      showNotification("Erro ao adicionar cliente. Tente novamente.", "error");
    }
  });
}

if (clientList) {
  clientList.addEventListener("click", (e) => {
    try {
      if (e.target.classList.contains("del-client")) {
        const id = e.target.dataset.id;
        if (!confirm("❓ Excluir este cliente?")) return;
        store.clients = store.clients.filter(x => x.id !== id);
        saveStore(store); renderClients(); renderQuotes();
        showNotification("Cliente excluído", "success");
      } else if (e.target.classList.contains("edit-client")) {
        const id = e.target.dataset.id;
        const it = store.clients.find(x => x.id === id);
        if (!it) return;
        editingClientId = id;
        if (clientName) clientName.value = it.name || "";
        if (clientCnpjCpf) clientCnpjCpf.value = it.cnpjCpf || "";
        if (clientAddress) clientAddress.value = it.address || "";
        if (clientPhone) clientPhone.value = it.phone || "";
        if (clientSubmitBtn) clientSubmitBtn.textContent = "Atualizar Cliente";
        if (clientCancelBtn) clientCancelBtn.style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { console.error("[ERROR] clientList click:", err); }
  });
}

if (clientCancelBtn) {
  clientCancelBtn.addEventListener("click", () => {
    editingClientId = null; clientForm && clientForm.reset();
    if (clientSubmitBtn) clientSubmitBtn.textContent = "Adicionar Cliente";
    clientCancelBtn.style.display = "none";
  });
}

// ========== ITEM HANDLERS ==========
if (addItemBtn) {
  addItemBtn.addEventListener("click", (e) => {
    e.preventDefault();
    try {
      currentItems.push({descricao:"",quantidade:1,valorUnitario:0});
      renderItems(currentItems);
      setTimeout(() => {
        const lastIdx = currentItems.length - 1;
        const newInput = itemsBody.querySelector(`input[data-idx="${lastIdx}"][data-field="descricao"]`);
        if (newInput) newInput.focus();
      }, 100);
    } catch (err) { console.error("[ERROR] addItemBtn:", err); }
  });
}

// ========== QUOTE HANDLERS ==========
if (selectIssuer) {
  selectIssuer.addEventListener('change', () => {
    if (!editingQuoteId) setDefaultQuoteFields();
  });
}

if (saveQuoteBtn) {
  saveQuoteBtn.addEventListener("click", ()=>{
    try {
      const issuerId = selectIssuer && selectIssuer.value;
      const clientId = selectClient && selectClient.value;
      
      if (!issuerId || !clientId) { showNotification("Selecione emissor e cliente", "error"); return; }

      if (currentIssuerLogoDataUrl) {
        const issuerToUpdate = store.issuers.find(i => i.id === issuerId);
        if (issuerToUpdate && !issuerToUpdate.logo) {
          issuerToUpdate.logo = currentIssuerLogoDataUrl;
          saveStore(store);
        }
      }

      const validItems = currentItems.filter(it => (it.descricao || "").trim() !== "");
      if (validItems.length === 0) { showNotification("Adicione pelo menos um item com descrição", "error"); return; }

      const totals = recalcTotals();
      let numeroValue = (quoteNumber && quoteNumber.value || "").trim();
      if (!numeroValue) numeroValue = formatQuoteNumber(computeNextQuoteNumberForIssuer(issuerId));

      const notesVal = (notes && notes.value || "").trim();

      if (editingQuoteId) {
        const q = store.quotes.find(x => x.id === editingQuoteId);
        if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
        q.issuerId = issuerId; q.clientId = clientId; q.numero = numeroValue || null;
        q.items = JSON.parse(JSON.stringify(validItems));
        q.subtotal = totals.subtotal; q.total = totals.total;
        q.notes = notesVal;
        // Salva a data editada pelo usuário
        if (quoteDate && quoteDate.value) {
          q.createdAt = new Date(quoteDate.value + 'T12:00:00').toISOString();
        }
        q.updatedAt = new Date().toISOString();
        saveStore(store);
        showNotification(`✅ Orçamento ${q.numero} atualizado!`, "success");
        endEditMode(); renderQuotes();
        currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
        renderItems(currentItems);
        return;
      }

      const q = {
        id: uid(), issuerId, clientId,
        numero: numeroValue || null,
        items: JSON.parse(JSON.stringify(validItems)),
        subtotal: totals.subtotal, total: totals.total,
        notes: notesVal,
        createdAt: new Date().toISOString()
      };
      
      store.quotes.push(q);
      saveStore(store);
      currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
      renderItems(currentItems); renderQuotes();
      setDefaultQuoteFields();
      showNotification(`✅ Orçamento ${q.numero} salvo com sucesso!`, "success");
      setTimeout(() => { quotesList && quotesList.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
      
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
  if (quoteNumber) { quoteNumber.value = q.numero || ""; quoteNumber.removeAttribute("readonly"); }
  if (quoteDate) {
    const iso = q.createdAt || q.updatedAt || new Date().toISOString();
    quoteDate.value = iso.slice(0, 10);
    quoteDate.removeAttribute('readonly');
  }
  if (notes) notes.value = q.notes || "";
  
  currentItems = JSON.parse(JSON.stringify(q.items || [{descricao:"",quantidade:1,valorUnitario:0}]));
  renderItems(currentItems);
  if (saveQuoteBtn) saveQuoteBtn.textContent = "💾 Atualizar Orçamento";
  if (cancelEditBtn) cancelEditBtn.style.display = "block";
  window.scrollTo({ top: 300, behavior: 'smooth' });
  showNotification("Modo de edição ativado. Você pode editar o número do orçamento!", "info");
}

function endEditMode() {
  editingQuoteId = null;
  if (saveQuoteBtn) saveQuoteBtn.textContent = "📄 Gerar Orçamento";
  if (cancelEditBtn) cancelEditBtn.style.display = "none";
  if (quoteNumber) quoteNumber.setAttribute("readonly", "true");
  setDefaultQuoteFields();
  if (notes) notes.value = "";
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    if (!confirm("❓ Cancelar edição e limpar formulário?")) return;
    endEditMode();
    currentItems = [{descricao:"",quantidade:1,valorUnitario:0}];
    renderItems(currentItems);
    showNotification("Edição cancelada", "info");
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

function openPreview(id){
  const q = store.quotes.find(x=>x.id===id); 
  if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
  const issuer = store.issuers.find(i=>i.id===q.issuerId)||{};
  const client = store.clients.find(c=>c.id===q.clientId)||{};
  const html = renderQuoteHtml(q, issuer, client);
  previewArea && (previewArea.innerHTML = html);
  lastPreviewHtml = html;
  previewModal && previewModal.classList.remove("hidden");
}

if (closePreview) {
  closePreview.addEventListener("click", ()=> { previewModal && previewModal.classList.add("hidden"); });
}

if (printBtn) {
  printBtn.addEventListener("click", ()=>{
    try {
      const content = previewArea ? previewArea.innerHTML : "";
      if (!content) { showNotification("Nenhum conteúdo para imprimir.", "info"); return; }
      triggerPrint(content, "Orçamento - SoftPrime");
    } catch (err) {
      console.error("[ERROR] printBtn:", err);
      showNotification("Erro ao imprimir. Tente novamente.", "error");
    }
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", ()=>{
    try {
      if (!store.quotes.length) { showNotification("Nenhum orçamento para exportar", "info"); return; }
      const rows = [];
      rows.push(["Número do Orçamento","Emissor","CNPJ/CPF Emissor","Cliente","CNPJ/CPF Cliente","Data","Subtotal (R$)","Total (R$)","Observações"].map(h => `"${h}"`).join(","));
      store.quotes.forEach(q => {
        const issuer = store.issuers.find(i=>i.id===q.issuerId) || {};
        const client = store.clients.find(c=>c.id===q.clientId) || {};
        rows.push([q.numero||"",issuer.name||"",issuer.cnpjCpf||"",client.name||"",client.cnpjCpf||"",formatDateISOtoLocal(q.createdAt),money(q.subtotal||0),money(q.total||0),(q.notes||"").substring(0,100)].map(v => `"${escapeCsv(v)}"`).join(","));
      });
      const csv = rows.join("\n");
      const blob = new Blob(["\uFEFF" + csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `orcamentos_softprime_${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      showNotification("✅ Excel exportado com sucesso!", "success");
    } catch (err) { console.error("[ERROR] exportCsvBtn:", err); showNotification("Erro ao exportar Excel", "error"); }
  });
}

if (exportDocBtn) {
  exportDocBtn.addEventListener("click", ()=>{
    try {
      if (!lastPreviewHtml) { showNotification("Abra um orçamento primeiro (Visualizar/Imprimir) para exportar", "info"); return; }
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento - SoftPrime</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:30px;color:#1a1a1a;max-width:800px;margin:0 auto;min-height:calc(100vh - 60px);display:flex;flex-direction:column}table{width:100%;border-collapse:collapse;margin-top:16px;table-layout:auto}th,td{border:1px solid #e5e7eb;padding:10px;text-align:left}th{background:#f9fafb;font-weight:600}td:first-child,th:first-child{word-break:break-word}td:not(:first-child),th:not(:first-child){white-space:nowrap;width:1%}.signature{margin-top:160px;margin-bottom:40px;display:flex;flex-direction:column;align-items:center;gap:8px}.signature .sig-line{width:60%;border-top:2px solid #1a1a1a;height:0}.signature .sig-name{font-weight:600;font-size:0.95rem;color:#1a1a1a}.print-footer{margin-top:24px;font-size:0.85rem;color:#6b7280;text-align:center}</style></head><body>${lastPreviewHtml}</body></html>`;
      const blob = new Blob([html], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `orcamento_softprime_${new Date().getTime()}.doc`; a.click();
      URL.revokeObjectURL(url);
      showNotification("✅ Word exportado com sucesso!", "success");
    } catch (err) { console.error("[ERROR] exportDocBtn:", err); showNotification("Erro ao exportar Word", "error"); }
  });
}

function exportQuoteDoc(quoteId){
  try {
    const q = store.quotes.find(x=>x.id===quoteId);
    if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
    const issuer = store.issuers.find(i=>i.id===q.issuerId)||{};
    const client = store.clients.find(c=>c.id===q.clientId)||{};

    const dateOnly = formatDateISOtoLocal(q.createdAt);
    const money = (v) => parseFloat(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); 

    // Logo em base64 se existir
    const logoHtml = issuer.logo
      ? `<p style="text-align:center;margin-bottom:12px;"><img src="${issuer.logo}" style="max-height:100px;max-width:260px;" /></p>`
      : '';

    // Linhas dos itens
    const itemRows = (q.items||[]).map(it => `
      <tr>
        <td style="border:1px solid #cccccc;padding:8px 10px;font-size:11pt;">${escapeHtml(it.descricao||'')}</td>
        <td style="border:1px solid #cccccc;padding:8px 10px;text-align:center;font-size:11pt;">${it.quantidade}</td>
        <td style="border:1px solid #cccccc;padding:8px 10px;text-align:right;font-size:11pt;">R$ ${money(it.valorUnitario)}</td>
        <td style="border:1px solid #cccccc;padding:8px 10px;text-align:right;font-size:11pt;font-weight:bold;">R$ ${money((it.quantidade||0)*(it.valorUnitario||0))}</td>
      </tr>`).join('');

    // Observações
    const notesHtml = q.notes ? `
      <p style="margin-top:20px;padding:10px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:10pt;">
        <strong>Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g,'<br/>')}
      </p>` : '';

    const doc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Orçamento ${escapeHtml(q.numero||q.id)}</title>
  <!--[if gte mso 9]><xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml><![endif]-->
  <style>
    @page { margin: 2.5cm 2.5cm 2.5cm 2.5cm; size: A4 portrait; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 0; padding: 0; }
    p { margin: 0 0 4px 0; padding: 0; }
    .titulo { font-size: 18pt; color: #0d7de0; text-align: center; font-weight: bold; letter-spacing: 2px; margin: 8px 0 2px 0; }
    .numero { font-size: 13pt; text-align: center; font-weight: normal; margin: 0 0 20px 0; }
    table.layout { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.layout td { vertical-align: top; }
    .box { padding: 10px 14px; border: 1pt solid #e0e0e0; background: #f9fafb; }
    .label { font-size: 9pt; color: #0d7de0; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px; display: block; }
    .name  { font-size: 12pt; font-weight: bold; margin-bottom: 3px; display: block; }
    .cnpj  { font-size: 9pt; color: #6b7280; margin: 2px 0; display: block; }
    .info  { font-size: 9pt; color: #555555; margin: 1px 0; display: block; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 0; }
    table.items th { background: #f2f2f2; border: 1pt solid #cccccc; padding: 7px 10px; font-size: 10pt; font-weight: bold; }
    table.items td { border: 1pt solid #cccccc; padding: 7px 10px; font-size: 10pt; }
    .th-desc  { text-align: left; width: 55%; }
    .th-qtd   { text-align: center; width: 10%; }
    .th-unit  { text-align: right; width: 17%; }
    .th-total { text-align: right; width: 18%; }
    .td-center { text-align: center; }
    .td-right  { text-align: right; }
    .td-bold   { font-weight: bold; }
    table.total-sep { width: 100%; border-collapse: collapse; margin-top: 14px; margin-bottom: 10px; }
    table.total-sep td { border: 2pt solid #93c5fd; padding: 9px 10px; background: #eef6ff; }
    .total-label { text-align: right; font-weight: bold; color: #0d7de0; font-size: 11pt; }
    .total-value { text-align: right; font-weight: bold; color: #0d7de0; font-size: 12pt; white-space: nowrap; width: 22%; }
    .sig-block { text-align: center; margin-top: 160px; margin-bottom: 40px; }
    .sig-line-wrap { text-align: center; margin-bottom: 6px; }
    .sig-hr { width: 55%; border-top: 1.5pt solid #1a1a1a; display: inline-block; font-size: 0; line-height: 0; }
    .sig-name { font-size: 10pt; font-weight: bold; text-align: center; margin-top: 4px; }
    .footer { text-align: center; font-size: 9pt; color: #888888; margin-top: 16px; }
    @media screen and (max-width: 600px) {
      body { padding: 12px; font-size: 10pt; }
      table.layout tr, table.layout td { display: block; width: 100% !important; }
      table.layout td:nth-child(2) { display: none; }
      table.items, table.total-sep { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .sig-block { margin-top: 60px; }
    }
  </style>
</head>
<body>

  ${logoHtml}

  <p class="titulo">ORÇAMENTO</p>
  <p class="numero">${escapeHtml(q.numero||'')}</p>

  <table class="layout">
    <tr>
      <td style="width:49%;" class="box">
        <span class="label">EMISSOR</span>
        <span class="name">${escapeHtml(issuer.name||'—')}</span>
        ${issuer.cnpjCpf ? `<span class="cnpj">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</span>` : ''}
        ${issuer.address  ? `<span class="info">${escapeHtml(issuer.address)}</span>` : ''}
        ${issuer.phone    ? `<span class="info">Tel: ${escapeHtml(issuer.phone)}</span>` : ''}
      </td>
      <td style="width:2%;"></td>
      <td style="width:49%;" class="box">
        <span class="label">DESTINATÁRIO</span>
        <span class="name">${escapeHtml(client.name||'—')}</span>
        ${client.cnpjCpf ? `<span class="cnpj">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</span>` : ''}
        ${client.address  ? `<span class="info">${escapeHtml(client.address)}</span>` : ''}
        ${client.phone    ? `<span class="info">Tel: ${escapeHtml(client.phone)}</span>` : ''}
      </td>
    </tr>
  </table>

  <table class="items">
    <thead>
      <tr>
        <th class="th-desc">Descrição</th>
        <th class="th-qtd">Qtd</th>
        <th class="th-unit">Valor Unit.</th>
        <th class="th-total">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <table class="total-sep">
    <tr>
      <td class="total-label">TOTAL:</td>
      <td class="total-value">R$ ${money(q.total||0)}</td>
    </tr>
  </table>

  ${notesHtml}

  <div class="sig-block">
    <p class="sig-line-wrap"><span class="sig-hr">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
    <p class="sig-name">${escapeHtml(issuer.name||'')}</p>
  </div>

  <p class="footer">Orçamento gerado em: ${dateOnly}</p>

</body>
</html>`;

    const blob = new Blob(['\ufeff' + doc], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orcamento_${q.numero || q.id}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("✅ Word exportado!", "success");
  } catch (err) { console.error("[ERROR] exportQuoteDoc:", err); showNotification("Erro ao exportar documento", "error"); }
}

function getPrintCss() {
  return `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:24px;max-width:780px;margin:0 auto;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    table{border-collapse:collapse;width:100%;}
    img{max-width:100%;height:auto;display:block;}
    @media print{body{padding:0;}@page{margin:1.5cm;size:A4 portrait;}}
  `;
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
    if (pending.length === 0) { setTimeout(doprint, 400); return; }
    let done = 0;
    pending.forEach(img => {
      img.addEventListener('load',  () => { done++; if (done===pending.length) setTimeout(doprint,300); });
      img.addEventListener('error', () => { done++; if (done===pending.length) setTimeout(doprint,300); });
    });
  } catch(e) {
    try {
      const blob = new Blob([fullHtml],{type:'text/html;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),15000);
    } catch(e2){ showNotification("Não foi possível abrir a impressão.","error"); }
  }
}

function printWindowWhenReady(w) {
  const allImgs = Array.from(w.document.images);
  if (allImgs.length === 0) { setTimeout(() => w.print(), 300); return; }
  const pending = allImgs.filter(img => !img.complete);
  if (pending.length === 0) { setTimeout(() => w.print(), 200); return; }
  let loaded = 0;
  const tryPrint = () => { loaded++; if (loaded === pending.length) setTimeout(() => w.print(), 200); };
  for (const img of pending) { img.addEventListener('load', tryPrint); img.addEventListener('error', tryPrint); }
}

function exportQuotePdf(quoteId){
  try {
    const q = store.quotes.find(x=>x.id===quoteId);
    if (!q) { showNotification("Orçamento não encontrado", "error"); return; }
    const issuer = store.issuers.find(i=>i.id===q.issuerId)||{};
    const client = store.clients.find(c=>c.id===q.clientId)||{};
    const html = renderQuoteHtml(q, issuer, client);
    triggerPrint(html, `Orçamento ${escapeHtml(q.numero||q.id)}`);
  } catch (err) { console.error("[ERROR] exportQuotePdf:", err); showNotification("Erro ao exportar PDF", "error"); }
}

function renderQuoteHtml(q, issuer, client){
  const dateOnly = formatDateISOtoLocal(q.createdAt);
  const logoHtml = issuer.logo
    ? `<div style="text-align:center;margin-bottom:20px;"><img src="${issuer.logo}" alt="Logo" style="max-height:100px;max-width:260px;object-fit:contain;" /></div>`
    : '';

  const issuerBlock = `
    <div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">EMISSOR</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(issuer.name||'—')}</div>
    ${issuer.cnpjCpf ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</div>` : ''}
    ${issuer.address  ? `<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(issuer.address)}</div>` : ''}
    ${issuer.phone    ? `<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(issuer.phone)}</div>` : ''}
  `;

  const clientBlock = `
    <div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">DESTINATÁRIO</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(client.name||'—')}</div>
    ${client.cnpjCpf ? `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</div>` : ''}
    ${client.address  ? `<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(client.address)}</div>` : ''}
    ${client.phone    ? `<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(client.phone)}</div>` : ''}
  `;

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
        <div style="font-size:17px;font-weight:600;margin-top:6px;">${escapeHtml(q.numero || q.id)}</div>
      </div>

      <!-- EMISSOR + DESTINATÁRIO via TABLE (funciona em print mobile) -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">
            ${issuerBlock}
          </td>
          <td style="width:2%;"></td>
          <td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">
            ${clientBlock}
          </td>
        </tr>
      </table>

      <!-- ITENS -->
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

      <!-- TOTAL — tabela SEPARADA, com margem acima para criar distância visual -->
      <table style="width:100%;border-collapse:collapse;margin-top:14px;margin-bottom:20px;table-layout:auto;">
        <tr style="background:#eef6ff;">
          <td style="padding:12px 10px;text-align:right;font-weight:700;font-size:14px;color:#0d7de0;border:2px solid #bfdbfe;">TOTAL:</td>
          <td style="padding:12px 10px;text-align:right;font-weight:800;font-size:16px;color:#0d7de0;border:2px solid #bfdbfe;white-space:nowrap;width:20%;">R$ ${money(q.total)}</td>
        </tr>
      </table>

      ${notesHtml}

      <!-- ASSINATURA — bem abaixo na folha -->
      <div style="margin-top:280px;margin-bottom:30px;text-align:center;page-break-inside:avoid;">
        <div style="width:55%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div>
        <div style="font-weight:700;font-size:13px;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
      </div>

      <!-- DATA no rodapé fixo -->
      <div style="position:fixed;bottom:16px;left:0;right:0;text-align:center;font-size:10px;color:#9ca3af;">
        Orçamento gerado em: ${escapeHtml(dateOnly)}
      </div>

    </div>
  `;
}

function attachQuoteListListeners(){
  if (!quotesList) return;
  quotesList.querySelectorAll(".view-quote").forEach(btn=>{ btn.addEventListener("click",(e)=> openPreview(e.target.dataset.id)); });
  quotesList.querySelectorAll(".export-quote").forEach(btn=>{ btn.addEventListener("click",(e)=> exportQuoteDoc(e.target.dataset.id)); });
  quotesList.querySelectorAll(".export-pdf").forEach(btn=>{ btn.addEventListener("click",(e)=> exportQuotePdf(e.target.dataset.id)); });
  quotesList.querySelectorAll(".edit-quote").forEach(btn=>{ btn.addEventListener("click",(e)=> startEditMode(e.target.dataset.id)); });
  quotesList.querySelectorAll(".del-quote").forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      const id = e.target.dataset.id;
      if (!confirm("❓ Excluir este orçamento permanentemente?")) return;
      store.quotes = store.quotes.filter(q=>q.id!==id); 
      saveStore(store); renderQuotes();
      showNotification("Orçamento excluído", "success");
    });
  });
}

// ========== INITIALIZATION ==========
function renderAll(){ 
  renderIssuers(); renderClients(); renderQuotes(); renderItems(currentItems); 
}

document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  setDefaultQuoteFields();
  console.log("✅ SoftPrime Gerador de Orçamentos iniciado!");
});