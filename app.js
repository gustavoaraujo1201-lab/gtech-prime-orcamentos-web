// app.js — Gerador de Orçamentos SoftPrime
// VERSÃO SUPABASE: dados sincronizados entre dispositivos por usuário
// Migração automática do localStorage na primeira vez

// ========== SUPABASE HELPER ==========
// SEMPRE usa o cliente do authManager — ele já tem a sessão autenticada
function getSupabase() {
  return window.authManager ? window.authManager.getSupabase() : null;
}
function getUserId() {
  return window.authManager ? window.authManager.getUserId() : null;
}

// ========== LEGACY STORE KEY ==========
const STORE_KEY = "softprime_quotes_v2";
const MIGRATION_KEY = "softprime_migrated_v1";

// ========== UTILITIES ==========
function uid(){
  // UUID v4 real — exigido pelo Supabase para chaves primárias e foreign keys
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0;
    return (c==='x' ? r : (r&0x3|0x8)).toString(16);
  });
}
const money = v => Number(v||0).toFixed(2);

function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escapeCsv(str){
  if (str === null || str === undefined) return "";
  return String(str).replace(/"/g,'""');
}
function formatDateISOtoLocal(iso){
  if (!iso) return "";
  return new Date(iso).toLocaleDateString('pt-BR');
}
function normalizeStr(str){
  return String(str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// ========== IN-MEMORY STORE (cache local) ==========
let store = { issuers: [], clients: [], quotes: [] };

// ========== QUOTE NUMBER HELPERS ==========
function computeNextQuoteNumberForIssuer(issuerId){
  const issuerQuotes = (store.quotes||[]).filter(q => q.issuerId === issuerId);
  if (!issuerQuotes.length) return 1;
  let max = 0;
  for (const q of issuerQuotes){
    const m = String(q.numero||'').match(/(\d+)(?!.*\d)/);
    if (m){ const n = parseInt(m[0],10); if (!isNaN(n) && n > max) max = n; }
  }
  return max + 1;
}
function formatQuoteNumber(n){
  return `${new Date().getFullYear()}-${String(n).padStart(4,'0')}`;
}

// ========== NOTIFICATION ==========
function showNotification(message, type='success'){
  // Toast não-bloqueante — funciona em mobile e não interrompe o fluxo
  const prev = document.getElementById('sp-toast');
  if (prev) prev.remove();
  const colors = { success:'#16a34a', error:'#dc2626', info:'#0d7de0' };
  const icons  = { success:'✅', error:'❌', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.id = 'sp-toast';
  toast.style.cssText = [
    'position:fixed','bottom:24px','right:20px','z-index:99999',
    'max-width:340px','min-width:200px',`background:${colors[type]||colors.info}`,
    'color:#fff','font-family:Arial,sans-serif','font-size:14px','font-weight:500',
    'padding:14px 18px','border-radius:10px','box-shadow:0 4px 20px rgba(0,0,0,.25)',
    'display:flex','align-items:flex-start','gap:10px','word-break:break-word',
    'animation:spIn .25s ease'
  ].join(';');
  if (!document.getElementById('sp-toast-css')){
    const s=document.createElement('style'); s.id='sp-toast-css';
    s.textContent='@keyframes spIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }
  toast.innerHTML=`<span style="font-size:18px;line-height:1">${icons[type]||'ℹ️'}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(()=>{ if(toast.parentNode) toast.remove(); }, type==='error'?6000:3500);
}

// ========== LOADING STATE ==========
function setLoading(on){
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = on ? 'flex' : 'none';
}

// ========== SUPABASE CRUD ==========

// --- ISSUERS ---
async function dbLoadIssuers(){
  const sb = getSupabase(); const uid = getUserId();
  if (!sb || !uid) return [];
  const { data, error } = await sb.from('issuers').select('*').eq('user_id', uid).order('created_at');
  if (error){ console.error('dbLoadIssuers:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id, name: r.name, cnpjCpf: r.cnpj_cpf||r.cnpj||'', address: r.address||'', phone: r.phone||'',
    logo: r.logo||null, createdAt: r.created_at
  }));
}
async function dbSaveIssuer(issuer){
  const sb = getSupabase(); const userId = getUserId();
  if (!sb || !userId) return null;
  const row = { id: issuer.id, user_id: userId, name: issuer.name, cnpj_cpf: issuer.cnpjCpf||'',
    address: issuer.address||'', phone: issuer.phone||'', logo: issuer.logo||null };
  const { data, error } = await sb.from('issuers').upsert(row, { onConflict: 'id' }).select().single();
  if (error){ console.error('dbSaveIssuer:', error); return null; }
  return data;
}
async function dbDeleteIssuer(id){
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('issuers').delete().eq('id', id);
}

// --- CLIENTS ---
async function dbLoadClients(){
  const sb = getSupabase(); const uid = getUserId();
  if (!sb || !uid) return [];
  const { data, error } = await sb.from('clients').select('*').eq('user_id', uid).order('created_at');
  if (error){ console.error('dbLoadClients:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id, name: r.name, cnpjCpf: r.cnpj_cpf||'', address: r.address||'', phone: r.phone||'',
    createdAt: r.created_at
  }));
}
async function dbSaveClient(client){
  const sb = getSupabase(); const userId = getUserId();
  if (!sb || !userId) return null;
  const row = { id: client.id, user_id: userId, name: client.name, cnpj_cpf: client.cnpjCpf||'',
    address: client.address||'', phone: client.phone||'' };
  const { data, error } = await sb.from('clients').upsert(row, { onConflict: 'id' }).select().single();
  if (error){ console.error('dbSaveClient:', error); return null; }
  return data;
}
async function dbDeleteClient(id){
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('clients').delete().eq('id', id);
}

// --- QUOTES ---
async function dbLoadQuotes(){
  const sb = getSupabase(); const uid = getUserId();
  if (!sb || !uid) return [];
  const { data, error } = await sb.from('quotes').select('*').eq('user_id', uid).order('created_at');
  if (error){ console.error('dbLoadQuotes:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id, issuerId: r.issuer_id||'', clientId: r.client_id||'',
    numero: r.numero||'', items: r.items||[], subtotal: Number(r.subtotal||0),
    total: Number(r.total||0), notes: r.notes||'', createdAt: r.created_at, updatedAt: r.updated_at
  }));
}
async function dbSaveQuote(q){
  const sb = getSupabase(); const userId = getUserId();
  if (!sb || !userId) return null;
  const row = {
    id: q.id, user_id: userId, issuer_id: q.issuerId||null, client_id: q.clientId||null,
    numero: q.numero||null, items: q.items||[], subtotal: q.subtotal||0, total: q.total||0,
    notes: q.notes||null,
    created_at: q.createdAt || new Date().toISOString(),
    updated_at: q.updatedAt || new Date().toISOString()
  };
  const { data, error } = await sb.from('quotes').upsert(row, { onConflict: 'id' }).select().single();
  if (error){ console.error('dbSaveQuote:', error); return null; }
  return data;
}
async function dbDeleteQuote(id){
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('quotes').delete().eq('id', id);
}

// ========== MIGRATION: localStorage → Supabase ==========
async function migrateLocalStorageToSupabase(){
  if (localStorage.getItem(MIGRATION_KEY) === '1') return; // já migrou
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) { localStorage.setItem(MIGRATION_KEY,'1'); return; }

  let local;
  try { local = JSON.parse(raw); } catch(e){ localStorage.setItem(MIGRATION_KEY,'1'); return; }

  const issuers = local.issuers || [];
  const clients = local.clients || [];
  const quotes  = local.quotes  || [];

  if (!issuers.length && !clients.length && !quotes.length){
    localStorage.setItem(MIGRATION_KEY,'1'); return;
  }

  console.log(`🔄 Migrando: ${issuers.length} emissores, ${clients.length} clientes, ${quotes.length} orçamentos`);
  showNotification('🔄 Migrando seus dados para a nuvem... Aguarde.', 'info');

  // Migrar emissores
  for (const iss of issuers){
    if (!iss.id) iss.id = uid();
    await dbSaveIssuer(iss);
  }
  // Migrar clientes
  for (const cli of clients){
    if (!cli.id) cli.id = uid();
    await dbSaveClient(cli);
  }
  // Migrar orçamentos
  for (const q of quotes){
    if (!q.id) q.id = uid();
    await dbSaveQuote(q);
  }

  localStorage.setItem(MIGRATION_KEY,'1');
  showNotification('✅ Dados migrados para a nuvem com sucesso!', 'success');
  console.log('✅ Migração concluída');
}

// ========== LOAD ALL DATA ==========
async function loadAllData(){
  setLoading(true);
  try {
    await migrateLocalStorageToSupabase();
    const [issuers, clients, quotes] = await Promise.all([
      dbLoadIssuers(), dbLoadClients(), dbLoadQuotes()
    ]);
    store.issuers = issuers;
    store.clients = clients;
    store.quotes  = quotes;
  } catch(e){
    console.error('loadAllData error:', e);
  } finally {
    setLoading(false);
  }
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
let _appInitialized = false; // guard contra dupla inicialização
window._appInitialized = false;
let editingQuoteId   = null;
let editingIssuerId  = null;
let editingClientId  = null;
let lastPreviewHtml  = "";
let currentPreviewQuoteId = null;
let currentIssuerLogoDataUrl = null;
let searchQuery = '';

// ========== FILTER ==========
function filterQuotes(quotes){
  if (!searchQuery) return quotes;
  const q = normalizeStr(searchQuery);
  return quotes.filter(quote => {
    const issuer = store.issuers.find(i => i.id === quote.issuerId) || {};
    const client = store.clients.find(c => c.id === quote.clientId) || {};
    const fields = [quote.numero||'', issuer.name||'', client.name||'',
      formatDateISOtoLocal(quote.createdAt), money(quote.total)];
    return fields.some(f => normalizeStr(f).includes(q));
  });
}

function highlightText(text, query){
  if (!query) return escapeHtml(text);
  const norm = normalizeStr(text);
  const idx = norm.indexOf(normalizeStr(query));
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0,idx))
    + '<mark class="search-highlight">' + escapeHtml(text.slice(idx, idx+query.length)) + '</mark>'
    + escapeHtml(text.slice(idx+query.length));
}

// ========== RENDER FUNCTIONS ==========
function renderIssuers(){
  if (!selectIssuer) return;
  if (issuerList) issuerList.innerHTML = "";
  selectIssuer.innerHTML = "<option value=''>-- selecione o emissor --</option>";

  (store.issuers||[]).forEach(i => {
    if (issuerList){
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

  (store.clients||[]).forEach(c => {
    if (clientList){
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

  if (!store.quotes.length){
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>📭 Nenhum orçamento salvo ainda</li>";
    if (filterResultsCount){ filterResultsCount.textContent=''; filterResultsCount.className='filter-results-count'; }
    return;
  }

  const filtered = filterQuotes(store.quotes.slice().reverse());
  const total = store.quotes.length;
  const shown = filtered.length;

  if (filterResultsCount){
    if (searchQuery.length > 0){
      filterResultsCount.textContent = shown === 0
        ? 'Nenhum orçamento encontrado'
        : `Exibindo ${shown} de ${total} orçamento${total!==1?'s':''}`;
      filterResultsCount.className = 'filter-results-count' + (shown===0?' no-results':'');
    } else {
      filterResultsCount.textContent = '';
      filterResultsCount.className = 'filter-results-count';
    }
  }

  if (!filtered.length){
    quotesList.innerHTML = "<li style='text-align:center;color:#9ca3af;'>🔍 Nenhum orçamento corresponde à pesquisa</li>";
    return;
  }

  filtered.forEach(q => {
    const issuer = store.issuers.find(i=>i.id===q.issuerId)||{};
    const client = store.clients.find(c=>c.id===q.clientId)||{};
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
        <button class="btn btn-outline view-quote" data-id="${q.id}">👁️ Visualizar/Imprimir</button>
        <button class="btn btn-outline export-pdf" data-id="${q.id}" title="Escolher modelo e baixar PDF">📥 PDF</button>
        <button class="btn btn-outline export-quote" data-id="${q.id}">📄 Word</button>
        <button class="btn btn-outline export-excel" data-id="${q.id}">📊 Excel</button>
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

  items.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td><input data-idx="${idx}" data-field="descricao" value="${escapeHtml(it.descricao||'')}" placeholder="Descrição do item" /></td>
      <td><input data-idx="${idx}" data-field="quantidade" type="number" min="0" step="1" value="${it.quantidade||1}" /></td>
      <td><input data-idx="${idx}" data-field="valorUnitario" type="number" min="0" step="0.01" value="${it.valorUnitario||0}" /></td>
      <td class="item-total">R$ ${money((it.quantidade||1)*(it.valorUnitario||0))}</td>
      <td><button class="del-item" data-idx="${idx}">×</button></td>`;
    itemsBody.appendChild(tr);

    tr.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", e => {
        const i = +e.target.dataset.idx;
        const field = e.target.dataset.field;
        let val = e.target.value;
        if (["quantidade","valorUnitario"].includes(field)) val = Number(val||0);
        currentItems[i][field] = val;
        const it2 = currentItems[i];
        const td = tr.querySelector(".item-total");
        if (td) td.textContent = `R$ ${money(Number(it2.quantidade||0)*Number(it2.valorUnitario||0))}`;
        recalcTotals();
      });
    });

    const delBtn = tr.querySelector(".del-item");
    delBtn && delBtn.addEventListener("click", () => {
      if (currentItems.length === 1){ showNotification("Deve haver pelo menos um item","info"); return; }
      currentItems.splice(idx, 1);
      renderItems(currentItems);
    });
  });
  recalcTotals();
}

function recalcTotals(){
  const subtotal = currentItems.reduce((s,it)=> s + Number(it.quantidade||0)*Number(it.valorUnitario||0), 0);
  if (subtotalEl) subtotalEl.textContent = money(subtotal);
  if (grandTotalEl) grandTotalEl.textContent = money(subtotal);
  return { subtotal, total: subtotal };
}

function setDefaultQuoteFields(){
  if (!quoteNumber || !quoteDate || editingQuoteId) return;
  const issuerId = selectIssuer ? selectIssuer.value : null;
  const n = issuerId ? computeNextQuoteNumberForIssuer(issuerId) : 1;
  quoteNumber.value = formatQuoteNumber(n);
  quoteDate.value = new Date().toISOString().slice(0,10);
  if (notes) notes.value = "";
}

function renderAll(){ renderIssuers(); renderClients(); renderQuotes(); renderItems(currentItems); }

// ========== ISSUER HANDLERS ==========
if (issuerForm){
  issuerForm.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const name     = (issuerName    && issuerName.value    || "").trim();
      const cnpjCpf  = (issuerCnpjCpf && issuerCnpjCpf.value || "").trim();
      const address  = (issuerAddress  && issuerAddress.value  || "").trim();
      const phone    = (issuerPhone    && issuerPhone.value    || "").trim();
      if (!name){ showNotification("Preencha o nome do emissor","error"); return; }

      if (editingIssuerId){
        const item = store.issuers.find(x => x.id === editingIssuerId);
        if (item){
          item.name=name; item.cnpjCpf=cnpjCpf; item.address=address; item.phone=phone;
          item.logo = currentIssuerLogoDataUrl;
          setLoading(true);
          await dbSaveIssuer(item);
          setLoading(false);
          editingIssuerId = null;
          if (issuerSubmitBtn) issuerSubmitBtn.textContent = "Adicionar Emissor";
          if (issuerCancelBtn) issuerCancelBtn.style.display = "none";
          issuerForm.reset(); currentIssuerLogoDataUrl = null;
          if (issuerLogoInput) issuerLogoInput.value='';
          if (issuerLogoPreview) issuerLogoPreview.style.display='none';
          if (issuerLogoImg) issuerLogoImg.src='';
          renderIssuers(); renderQuotes();
          showNotification("Emissor atualizado com sucesso!","success"); return;
        }
      }

      const newItem = { id: uid(), name, cnpjCpf, address, phone, logo: currentIssuerLogoDataUrl||null };
      setLoading(true);
      const savedIssuer = await dbSaveIssuer(newItem);
      // Recarrega do banco para garantir dados corretos (inclusive IDs gerados pelo servidor)
      store.issuers = await dbLoadIssuers();
      setLoading(false);
      issuerForm.reset(); currentIssuerLogoDataUrl = null;
      if (issuerLogoInput) issuerLogoInput.value='';
      if (issuerLogoPreview) issuerLogoPreview.style.display='none';
      if (issuerLogoImg) issuerLogoImg.src='';
      renderIssuers(); renderQuotes();
      showNotification("Emissor adicionado com sucesso!","success");
    } catch(err){ console.error("[ERROR] issuerForm:",err); setLoading(false); showNotification("Erro ao salvar emissor","error"); }
  });
}

if (issuerList){
  issuerList.addEventListener("click", async e => {
    try {
      if (e.target.classList.contains("del-issuer")){
        const id = e.target.dataset.id;
        if (!confirm("❓ Excluir este emissor?")) return;
        setLoading(true);
        await dbDeleteIssuer(id);
        setLoading(false);
        store.issuers = store.issuers.filter(x=>x.id!==id);
        renderIssuers(); renderQuotes();
        showNotification("Emissor excluído","success");
      } else if (e.target.classList.contains("edit-issuer")){
        const id = e.target.dataset.id;
        const it = store.issuers.find(x=>x.id===id);
        if (!it) return;
        editingIssuerId = id;
        if (issuerName) issuerName.value = it.name||"";
        if (issuerCnpjCpf) issuerCnpjCpf.value = it.cnpjCpf||"";
        if (issuerAddress) issuerAddress.value = it.address||"";
        if (issuerPhone) issuerPhone.value = it.phone||"";
        currentIssuerLogoDataUrl = it.logo||null;
        if (issuerLogoImg && it.logo){ issuerLogoImg.src=it.logo; if(issuerLogoPreview) issuerLogoPreview.style.display='block'; }
        else { if(issuerLogoPreview) issuerLogoPreview.style.display='none'; if(issuerLogoImg) issuerLogoImg.src=''; }
        if (issuerLogoInput) issuerLogoInput.value='';
        if (issuerSubmitBtn) issuerSubmitBtn.textContent = "Atualizar Emissor";
        if (issuerCancelBtn) issuerCancelBtn.style.display = "inline-block";
        window.scrollTo({top:0,behavior:'smooth'});
      }
    } catch(err){ console.error("[ERROR] issuerList click:",err); setLoading(false); }
  });
}

if (issuerCancelBtn){
  issuerCancelBtn.addEventListener("click", ()=>{
    editingIssuerId = null; issuerForm && issuerForm.reset();
    if (issuerSubmitBtn) issuerSubmitBtn.textContent="Adicionar Emissor";
    issuerCancelBtn.style.display="none"; currentIssuerLogoDataUrl=null;
    if (issuerLogoInput) issuerLogoInput.value='';
    if (issuerLogoPreview) issuerLogoPreview.style.display='none';
    if (issuerLogoImg) issuerLogoImg.src='';
  });
}

if (issuerLogoInput){
  issuerLogoInput.addEventListener('change', e=>{
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 4*1024*1024){ showNotification('Imagem muito grande. Máximo 4MB.','error'); issuerLogoInput.value=''; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      currentIssuerLogoDataUrl = ev.target.result;
      if (issuerLogoImg) issuerLogoImg.src = currentIssuerLogoDataUrl;
      if (issuerLogoPreview) issuerLogoPreview.style.display='block';
    };
    reader.readAsDataURL(file);
  });
}

if (removeLogoBtn){
  removeLogoBtn.addEventListener('click', ()=>{
    currentIssuerLogoDataUrl=null;
    if (issuerLogoInput) issuerLogoInput.value='';
    if (issuerLogoPreview) issuerLogoPreview.style.display='none';
    if (issuerLogoImg) issuerLogoImg.src='';
  });
}

// ========== CLIENT HANDLERS ==========
if (clientForm){
  clientForm.addEventListener("submit", async e=>{
    e.preventDefault();
    try {
      const name    = (clientName    && clientName.value    ||"").trim();
      const cnpjCpf = (clientCnpjCpf && clientCnpjCpf.value||"").trim();
      const address = (clientAddress  && clientAddress.value ||"").trim();
      const phone   = (clientPhone    && clientPhone.value   ||"").trim();
      if (!name){ showNotification("Preencha o nome do cliente","error"); return; }

      if (editingClientId){
        const item = store.clients.find(x=>x.id===editingClientId);
        if (item){
          item.name=name; item.cnpjCpf=cnpjCpf; item.address=address; item.phone=phone;
          setLoading(true);
          await dbSaveClient(item);
          setLoading(false);
          editingClientId=null;
          if (clientSubmitBtn) clientSubmitBtn.textContent="Adicionar Cliente";
          if (clientCancelBtn) clientCancelBtn.style.display="none";
          clientForm.reset(); renderClients(); renderQuotes();
          showNotification("Cliente atualizado com sucesso!","success"); return;
        }
      }

      const newItem = { id: uid(), name, cnpjCpf, address, phone };
      setLoading(true);
      await dbSaveClient(newItem);
      store.clients = await dbLoadClients();
      setLoading(false);
      clientForm.reset(); renderClients(); renderQuotes();
      showNotification("Cliente adicionado com sucesso!","success");
    } catch(err){ console.error("[ERROR] clientForm:",err); setLoading(false); showNotification("Erro ao salvar cliente","error"); }
  });
}

if (clientList){
  clientList.addEventListener("click", async e=>{
    try {
      if (e.target.classList.contains("del-client")){
        const id = e.target.dataset.id;
        if (!confirm("❓ Excluir este cliente?")) return;
        setLoading(true);
        await dbDeleteClient(id);
        setLoading(false);
        store.clients = store.clients.filter(x=>x.id!==id);
        renderClients(); renderQuotes();
        showNotification("Cliente excluído","success");
      } else if (e.target.classList.contains("edit-client")){
        const id = e.target.dataset.id;
        const it = store.clients.find(x=>x.id===id);
        if (!it) return;
        editingClientId=id;
        if (clientName) clientName.value=it.name||"";
        if (clientCnpjCpf) clientCnpjCpf.value=it.cnpjCpf||"";
        if (clientAddress) clientAddress.value=it.address||"";
        if (clientPhone) clientPhone.value=it.phone||"";
        if (clientSubmitBtn) clientSubmitBtn.textContent="Atualizar Cliente";
        if (clientCancelBtn) clientCancelBtn.style.display="inline-block";
        window.scrollTo({top:0,behavior:'smooth'});
      }
    } catch(err){ console.error("[ERROR] clientList click:",err); setLoading(false); }
  });
}

if (clientCancelBtn){
  clientCancelBtn.addEventListener("click", ()=>{
    editingClientId=null; clientForm&&clientForm.reset();
    if (clientSubmitBtn) clientSubmitBtn.textContent="Adicionar Cliente";
    clientCancelBtn.style.display="none";
  });
}

// ========== ITEM HANDLERS ==========
if (addItemBtn){
  addItemBtn.addEventListener("click", e=>{
    e.preventDefault();
    currentItems.push({descricao:"",quantidade:1,valorUnitario:0});
    renderItems(currentItems);
    setTimeout(()=>{
      const lastIdx = currentItems.length-1;
      const inp = itemsBody && itemsBody.querySelector(`input[data-idx="${lastIdx}"][data-field="descricao"]`);
      if (inp) inp.focus();
    }, 100);
  });
}

// ========== QUOTE HANDLERS ==========
if (selectIssuer){
  selectIssuer.addEventListener('change', ()=>{ if (!editingQuoteId) setDefaultQuoteFields(); });
}

if (saveQuoteBtn){
  saveQuoteBtn.addEventListener("click", async ()=>{
    try {
      const issuerId = selectIssuer && selectIssuer.value;
      const clientId = selectClient && selectClient.value;
      if (!issuerId||!clientId){ showNotification("Selecione emissor e cliente","error"); return; }

      if (currentIssuerLogoDataUrl){
        const iss = store.issuers.find(i=>i.id===issuerId);
        if (iss && !iss.logo){ iss.logo=currentIssuerLogoDataUrl; await dbSaveIssuer(iss); }
      }

      const validItems = currentItems.filter(it=>(it.descricao||"").trim()!=="");
      if (!validItems.length){ showNotification("Adicione pelo menos um item com descrição","error"); return; }

      const totals = recalcTotals();
      let numeroValue = (quoteNumber&&quoteNumber.value||"").trim();
      if (!numeroValue) numeroValue = formatQuoteNumber(computeNextQuoteNumberForIssuer(issuerId));
      const notesVal = (notes&&notes.value||"").trim();

      if (editingQuoteId){
        const q = store.quotes.find(x=>x.id===editingQuoteId);
        if (!q){ showNotification("Orçamento não encontrado","error"); return; }
        q.issuerId=issuerId; q.clientId=clientId; q.numero=numeroValue||null;
        q.items=JSON.parse(JSON.stringify(validItems));
        q.subtotal=totals.subtotal; q.total=totals.total; q.notes=notesVal;
        if (quoteDate&&quoteDate.value) q.createdAt=new Date(quoteDate.value+'T12:00:00').toISOString();
        q.updatedAt=new Date().toISOString();
        setLoading(true);
        await dbSaveQuote(q);
        setLoading(false);
        showNotification(`✅ Orçamento ${q.numero} atualizado!`,"success");
        endEditMode(); renderQuotes();
        currentItems=[{descricao:"",quantidade:1,valorUnitario:0}];
        renderItems(currentItems); return;
      }

      const q = {
        id: uid(), issuerId, clientId, numero: numeroValue||null,
        items: JSON.parse(JSON.stringify(validItems)),
        subtotal: totals.subtotal, total: totals.total, notes: notesVal,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      setLoading(true);
      await dbSaveQuote(q);
      store.quotes = await dbLoadQuotes();
      setLoading(false);
      currentItems=[{descricao:"",quantidade:1,valorUnitario:0}];
      renderItems(currentItems); renderQuotes(); setDefaultQuoteFields();
      showNotification(`✅ Orçamento ${q.numero} salvo com sucesso!`,"success");
      setTimeout(()=>{ quotesList&&quotesList.scrollIntoView({behavior:'smooth',block:'start'}); }, 300);
    } catch(err){ console.error("[ERROR] saveQuoteBtn:",err); setLoading(false); showNotification("Erro ao salvar orçamento","error"); }
  });
}

function startEditMode(quoteId){
  const q = store.quotes.find(x=>x.id===quoteId);
  if (!q){ showNotification("Orçamento não encontrado","error"); return; }
  editingQuoteId=quoteId;
  if (selectIssuer) selectIssuer.value=q.issuerId||"";
  if (selectClient) selectClient.value=q.clientId||"";
  if (quoteNumber){ quoteNumber.value=q.numero||""; quoteNumber.removeAttribute("readonly"); }
  if (quoteDate){ quoteDate.value=(q.createdAt||new Date().toISOString()).slice(0,10); quoteDate.removeAttribute('readonly'); }
  if (notes) notes.value=q.notes||"";
  currentItems=JSON.parse(JSON.stringify(q.items||[{descricao:"",quantidade:1,valorUnitario:0}]));
  renderItems(currentItems);
  if (saveQuoteBtn) saveQuoteBtn.textContent="💾 Atualizar Orçamento";
  if (cancelEditBtn) cancelEditBtn.style.display="block";
  window.scrollTo({top:300,behavior:'smooth'});
  showNotification("Modo de edição ativado. Você pode editar o número do orçamento!","info");
}

function endEditMode(){
  editingQuoteId=null;
  if (saveQuoteBtn) saveQuoteBtn.textContent="📄 Gerar Orçamento";
  if (cancelEditBtn) cancelEditBtn.style.display="none";
  if (quoteNumber) quoteNumber.setAttribute("readonly","true");
  setDefaultQuoteFields();
  if (notes) notes.value="";
}

if (cancelEditBtn){
  cancelEditBtn.addEventListener("click", e=>{
    e.preventDefault();
    if (!confirm("❓ Cancelar edição e limpar formulário?")) return;
    endEditMode();
    currentItems=[{descricao:"",quantidade:1,valorUnitario:0}];
    renderItems(currentItems);
    showNotification("Edição cancelada","info");
  });
}

if (quotesSearch){
  quotesSearch.addEventListener('input', ()=>{
    searchQuery=quotesSearch.value;
    if (clearSearch) clearSearch.style.display=searchQuery.length>0?'':'none';
    renderQuotes();
  });
}

if (clearSearch){
  clearSearch.addEventListener('click', ()=>{
    searchQuery=''; if (quotesSearch) quotesSearch.value='';
    clearSearch.style.display='none'; renderQuotes();
  });
}

function attachQuoteListListeners(){
  if (!quotesList) return;
  quotesList.querySelectorAll(".view-quote").forEach(btn=>btn.addEventListener("click",e=>openPreview(e.target.closest('[data-id]').dataset.id)));
  quotesList.querySelectorAll(".export-quote").forEach(btn=>btn.addEventListener("click",e=>exportQuoteDoc(e.target.closest('[data-id]').dataset.id)));
  quotesList.querySelectorAll(".export-pdf").forEach(btn=>btn.addEventListener("click",e=>generatePDFFromQuote(e.target.closest('[data-id]').dataset.id)));
  quotesList.querySelectorAll(".export-excel").forEach(btn=>btn.addEventListener("click",e=>exportQuoteExcel(e.target.closest('[data-id]').dataset.id)));
  quotesList.querySelectorAll(".edit-quote").forEach(btn=>btn.addEventListener("click",e=>startEditMode(e.target.closest('[data-id]').dataset.id)));
  quotesList.querySelectorAll(".del-quote").forEach(btn=>{
    btn.addEventListener("click", async e=>{
      const id = e.target.dataset.id;
      if (!confirm("❓ Excluir este orçamento permanentemente?")) return;
      setLoading(true);
      await dbDeleteQuote(id);
      setLoading(false);
      store.quotes=store.quotes.filter(q=>q.id!==id);
      renderQuotes();
      showNotification("Orçamento excluído","success");
    });
  });
}

// ========== PREVIEW / PRINT ==========
function openPreview(id){
  const q = store.quotes.find(x=>x.id===id);
  if (!q){ showNotification("Orçamento não encontrado","error"); return; }
  const issuer = store.issuers.find(i=>i.id===q.issuerId)||{};
  const client = store.clients.find(c=>c.id===q.clientId)||{};
  const html = renderQuoteHtml(q, issuer, client);
  if (previewArea) previewArea.innerHTML=html;
  lastPreviewHtml=html; currentPreviewQuoteId=id;
  previewModal&&previewModal.classList.remove("hidden");
}

if (closePreview) closePreview.addEventListener("click",()=>previewModal&&previewModal.classList.add("hidden"));

const downloadPdfBtn = document.getElementById('downloadPdfBtn');
if (downloadPdfBtn) downloadPdfBtn.addEventListener("click",()=>{ if (currentPreviewQuoteId) generatePDFFromQuote(currentPreviewQuoteId); });

if (printBtn){
  printBtn.addEventListener("click",()=>{
    const content = previewArea ? previewArea.innerHTML : "";
    if (!content){ showNotification("Nenhum conteúdo para imprimir.","info"); return; }
    triggerPrint(content,"Orçamento - SoftPrime");
  });
}

// ========== CSV EXPORT ==========
if (exportCsvBtn){
  exportCsvBtn.addEventListener("click",()=>{
    // ── PAYWALL: Exportação CSV requer pelo menos plano Básico ──
    if (window.PaywallModal && !window.PaywallModal.hasAccess('export')) {
      window.PaywallModal.open('export');
      return;
    }
    if (!store.quotes.length){ showNotification("Nenhum orçamento para exportar","info"); return; }
    const rows=[["Número","Emissor","CNPJ Emissor","Cliente","CNPJ Cliente","Data","Subtotal","Total","Observações"].map(h=>`"${h}"`).join(",")];
    store.quotes.forEach(q=>{
      const iss=store.issuers.find(i=>i.id===q.issuerId)||{};
      const cli=store.clients.find(c=>c.id===q.clientId)||{};
      rows.push([q.numero||"",iss.name||"",iss.cnpjCpf||"",cli.name||"",cli.cnpjCpf||"",
        formatDateISOtoLocal(q.createdAt),money(q.subtotal||0),money(q.total||0),(q.notes||"").substring(0,100)
      ].map(v=>`"${escapeCsv(v)}"`).join(","));
    });
    const blob=new Blob(["\uFEFF"+rows.join("\n")],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`orcamentos_softprime_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showNotification("✅ CSV exportado com sucesso!","success");
  });
}

// ========== WORD EXPORT (preview) ==========
if (exportDocBtn){
  exportDocBtn.addEventListener("click",()=>{
    if (window.PlanGuard && !window.PlanGuard.hasAccess('word')) {
      window.PlanGuard.openPaywall('word');
      return;
    }
    if (!currentPreviewQuoteId){ showNotification("Abra um orçamento primeiro (Visualizar/Imprimir) para exportar","info"); return; }
    exportQuoteDoc(currentPreviewQuoteId);
  });
}

// Botão de backup geral (procura elemento na página)
const backupBtn = document.getElementById('backupBtn');
if (backupBtn) {
  backupBtn.addEventListener('click', () => exportBackupExcel());
}

// ========== WORD EXPORT (individual) ==========

// ========== HELPERS DE FORMATAÇÃO ==========
const mf = v => parseFloat(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');

// ========== MARCA D'ÁGUA ==========
// Retorna HTML de marca d'água se o plano não for premium
function getWatermarkHtml() {
  const plan = window.PlanGuard ? window.PlanGuard.getActivePlan() : (localStorage.getItem('softprime_plan') || null);
  const isPremium = plan === 'premium';
  if (isPremium) return '';
  return `
    <div style="
      position:fixed;top:50%;left:50%;
      transform:translate(-50%,-50%) rotate(-35deg);
      font-size:52px;font-weight:900;
      color:rgba(13,125,224,0.07);
      white-space:nowrap;pointer-events:none;
      letter-spacing:6px;z-index:0;
      font-family:Arial,sans-serif;
    ">SOFTPRIME</div>`;
}

// ========== SELETOR DE MODELO DE PDF ==========
function openPdfModelSelector(quoteId) {
  const existing = document.getElementById('sp-pdf-model-modal');
  if (existing) existing.remove();

  const plan = window.PlanGuard ? window.PlanGuard.getActivePlan() : (localStorage.getItem('softprime_plan') || null);
  const hasPro = ['pro','premium'].includes(plan) || plan === 'trial'; // trial tem acesso básico
  // Só pro/premium tem múltiplos modelos
  const hasMultiModel = ['pro','premium'].includes(plan);

  const modal = document.createElement('div');
  modal.id = 'sp-pdf-model-modal';
  modal.style.cssText = [
    'position:fixed','inset:0','z-index:99998',
    'display:flex','align-items:center','justify-content:center',
    'background:rgba(0,0,0,0.65)','backdrop-filter:blur(6px)','padding:20px'
  ].join(';');

  const models = [
    {
      id: 'classico',
      icon: '📄',
      name: 'Clássico',
      desc: 'Layout limpo com logo e tabela organizada',
      plan: 'Básico',
      locked: false,
    },
    {
      id: 'moderno',
      icon: '🎨',
      name: 'Moderno',
      desc: 'Cabeçalho colorido azul com destaque profissional',
      plan: 'Intermediário',
      locked: !hasMultiModel,
    },
    {
      id: 'minimalista',
      icon: '✨',
      name: 'Minimalista',
      desc: 'Design clean sem bordas, elegante e sóbrio',
      plan: 'Intermediário',
      locked: !hasMultiModel,
    },
  ];

  const cardsHtml = models.map(m => `
    <div onclick="${m.locked ? `document.getElementById('sp-pdf-model-modal').remove();window.PlanGuard&&window.PlanGuard.openPaywall('pdf')` : `document.getElementById('sp-pdf-model-modal').remove();generatePDFFromQuote('${quoteId}','${m.id}')`}" style="
      background:${m.locked ? 'rgba(255,255,255,0.03)' : 'rgba(13,125,224,0.08)'};
      border:1px solid ${m.locked ? 'rgba(255,255,255,0.08)' : 'rgba(13,125,224,0.3)'};
      border-radius:12px;padding:18px 16px;cursor:${m.locked ? 'not-allowed' : 'pointer'};
      transition:all 0.2s;position:relative;opacity:${m.locked ? '0.55' : '1'};
    " onmouseover="if(!${m.locked})this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${m.locked ? `<div style="position:absolute;top:10px;right:10px;font-size:11px;background:rgba(99,102,241,0.2);color:#a5b4fc;padding:2px 8px;border-radius:100px;border:1px solid rgba(99,102,241,0.3);">🔒 ${m.plan}</div>` : ''}
      <div style="font-size:28px;margin-bottom:8px;">${m.icon}</div>
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;">${m.name}</div>
      <div style="font-size:12px;color:rgba(160,200,255,0.6);">${m.desc}</div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div style="
      background:#1a2332;border:1px solid rgba(13,125,224,0.2);
      border-radius:16px;padding:32px 28px;max-width:500px;width:100%;
      box-shadow:0 24px 60px rgba(0,0,0,0.5);
      font-family:'Inter',Arial,sans-serif;color:#f0f6ff;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <h3 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#fff;">Escolha o modelo de PDF</h3>
          <p style="margin:0;font-size:13px;color:rgba(160,200,255,0.55);">Selecione o layout do seu orçamento</p>
        </div>
        <button onclick="document.getElementById('sp-pdf-model-modal').remove()" style="
          background:rgba(255,255,255,0.06);border:none;cursor:pointer;
          color:rgba(255,255,255,0.4);font-size:20px;padding:6px 10px;
          border-radius:8px;line-height:1;
        ">×</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:8px;">
        ${cardsHtml}
      </div>
    </div>
  `;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ========== GERAÇÃO PDF — MODELO CLÁSSICO (melhorado) ==========
function buildPdfClassico(q, issuer, client) {
  const dateOnly = formatDateISOtoLocal(q.createdAt);
  const logoHtml = issuer.logo ? `<div style="text-align:center;margin-bottom:16px;"><img src="${issuer.logo}" style="max-height:90px;max-width:240px;" /></div>` : '';
  const watermark = getWatermarkHtml();
  const itemRows = (q.items||[]).map(it => `
    <tr>
      <td style="border:1px solid #d1d5db;padding:9px 10px;font-size:11pt;">${escapeHtml(it.descricao||'')}</td>
      <td style="border:1px solid #d1d5db;padding:9px 10px;text-align:center;font-size:11pt;">${it.quantidade}</td>
      <td style="border:1px solid #d1d5db;padding:9px 10px;text-align:right;font-size:11pt;">R$ ${mf(it.valorUnitario)}</td>
      <td style="border:1px solid #d1d5db;padding:9px 10px;text-align:right;font-size:11pt;font-weight:bold;">R$ ${mf((it.quantidade||0)*(it.valorUnitario||0))}</td>
    </tr>`).join('');
  const notesHtml = q.notes ? `<div style="margin-top:18px;padding:12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;"><strong>Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g,'<br/>')}</div>` : '';
  const validadeHtml = q.validade ? `<div style="margin-bottom:6px;font-size:10pt;color:#6b7280;">Válido até: <strong>${escapeHtml(q.validade)}</strong></div>` : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Orçamento ${escapeHtml(q.numero||q.id)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    @page{margin:2cm;size:A4 portrait;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#1a1a1a;margin:0 auto;padding:24px;max-width:780px;position:relative;}
    .titulo{font-size:20pt;color:#0d7de0;text-align:center;font-weight:900;letter-spacing:3px;margin:6px 0 2px 0;}
    .numero{font-size:12pt;text-align:center;color:#6b7280;margin:0 0 20px 0;}
    .box{padding:12px 14px;border:1px solid #e0e0e0;background:#f9fafb;border-radius:6px;}
    .label{font-size:9pt;color:#0d7de0;font-weight:bold;letter-spacing:1px;margin-bottom:5px;display:block;text-transform:uppercase;}
    .name{font-size:13pt;font-weight:bold;margin-bottom:3px;display:block;}
    .cnpj{font-size:9pt;color:#6b7280;margin:2px 0;display:block;}
    .info{font-size:9pt;color:#555;margin:1px 0;display:block;}
    table.layout{width:100%;border-collapse:collapse;margin-bottom:20px;}
    table.items{width:100%;border-collapse:collapse;margin-top:12px;}
    table.items th{background:#0d7de0;color:#fff;border:1px solid #0a5fb8;padding:9px 10px;font-size:10pt;font-weight:700;}
    table.items td{border:1px solid #d1d5db;padding:9px 10px;font-size:10pt;}
    table.items tr:nth-child(even) td{background:#f8fafc;}
    .total-box{margin-top:14px;padding:12px 16px;background:#eef6ff;border:2px solid #93c5fd;border-radius:6px;display:flex;justify-content:space-between;align-items:center;}
    .total-label{font-weight:700;color:#0d7de0;font-size:12pt;}
    .total-value{font-weight:900;color:#0d7de0;font-size:15pt;}
    .sig-block{text-align:center;margin-top:120px;margin-bottom:30px;}
    .footer{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:9pt;color:#9ca3af;padding:5px 0;border-top:1px solid #e5e7eb;background:#fff;}
    body{padding-bottom:30px;}
    @media print{body{padding:0;} .footer{position:fixed;bottom:0;left:0;right:0;}}
  </style></head><body>
  ${watermark}
  ${logoHtml}
  <div class="titulo">ORÇAMENTO</div>
  <div class="numero">${escapeHtml(q.numero||q.id)}</div>
  ${validadeHtml}
  <table class="layout" cellspacing="0" cellpadding="0"><tr>
    <td style="width:49%;vertical-align:top;" class="box">
      <span class="label">Emissor</span>
      <span class="name">${escapeHtml(issuer.name||'—')}</span>
      ${issuer.cnpjCpf?`<span class="cnpj">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</span>`:''}
      ${issuer.address?`<span class="info">${escapeHtml(issuer.address)}</span>`:''}
      ${issuer.phone?`<span class="info">Tel: ${escapeHtml(issuer.phone)}</span>`:''}
    </td>
    <td style="width:2%;"></td>
    <td style="width:49%;vertical-align:top;" class="box">
      <span class="label">Destinatário</span>
      <span class="name">${escapeHtml(client.name||'—')}</span>
      ${client.cnpjCpf?`<span class="cnpj">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</span>`:''}
      ${client.address?`<span class="info">${escapeHtml(client.address)}</span>`:''}
      ${client.phone?`<span class="info">Tel: ${escapeHtml(client.phone)}</span>`:''}
    </td>
  </tr></table>
  <table class="items" cellspacing="0" cellpadding="0">
    <thead><tr>
      <th style="text-align:left;width:55%;">Descrição</th>
      <th style="text-align:center;width:10%;">Qtd</th>
      <th style="text-align:right;width:17%;">Valor Unit.</th>
      <th style="text-align:right;width:18%;">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px;" cellspacing="0" cellpadding="0"><tr>
    <td style="padding:12px 16px;text-align:right;font-weight:700;font-size:12pt;color:#0d7de0;background:#eef6ff;border:2px solid #93c5fd;">TOTAL:</td>
    <td style="padding:12px 16px;text-align:right;font-weight:900;font-size:15pt;color:#0d7de0;background:#eef6ff;border:2px solid #93c5fd;white-space:nowrap;width:22%;">R$ ${mf(q.total||0)}</td>
  </tr></table>
  ${notesHtml}
  <div class="sig-block">
    <div style="width:55%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div>
    <div style="font-weight:700;font-size:11pt;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
  </div>
  <div class="footer">Orçamento gerado em: ${dateOnly} • SoftPrime</div>
</body></html>`;
}

// ========== GERAÇÃO PDF — MODELO MODERNO ==========
function buildPdfModerno(q, issuer, client) {
  const dateOnly = formatDateISOtoLocal(q.createdAt);
  const logoHtml = issuer.logo ? `<img src="${issuer.logo}" style="max-height:70px;max-width:200px;object-fit:contain;" />` : `<span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:1px;">${escapeHtml(issuer.name||'')}</span>`;
  const watermark = getWatermarkHtml();
  const itemRows = (q.items||[]).map((it,idx) => `
    <tr style="background:${idx%2===0?'#fff':'#f0f7ff'};">
      <td style="border:1px solid #dbeafe;padding:10px 12px;font-size:11pt;">${escapeHtml(it.descricao||'')}</td>
      <td style="border:1px solid #dbeafe;padding:10px 12px;text-align:center;font-size:11pt;">${it.quantidade}</td>
      <td style="border:1px solid #dbeafe;padding:10px 12px;text-align:right;font-size:11pt;">R$ ${mf(it.valorUnitario)}</td>
      <td style="border:1px solid #dbeafe;padding:10px 12px;text-align:right;font-size:11pt;font-weight:bold;color:#0d7de0;">R$ ${mf((it.quantidade||0)*(it.valorUnitario||0))}</td>
    </tr>`).join('');
  const notesHtml = q.notes ? `<div style="margin-top:18px;padding:14px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;font-size:10pt;"><strong>Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g,'<br/>')}</div>` : '';
  const validadeHtml = q.validade ? `<span style="font-size:10pt;color:rgba(255,255,255,0.75);">Válido até: <strong>${escapeHtml(q.validade)}</strong></span>` : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Orçamento ${escapeHtml(q.numero||q.id)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    @page{margin:0;size:A4 portrait;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#1a1a1a;margin:0;padding:0;position:relative;}
    .header{background:linear-gradient(135deg,#0d7de0,#0a5fb8);padding:28px 36px;display:flex;align-items:center;justify-content:space-between;}
    .header-right{text-align:right;}
    .orcamento-title{font-size:26pt;font-weight:900;color:#fff;letter-spacing:4px;margin-bottom:4px;}
    .orcamento-num{font-size:12pt;color:rgba(255,255,255,0.8);}
    .content{padding:28px 36px;}
    .parties{display:flex;gap:16px;margin-bottom:24px;}
    .party-box{flex:1;padding:14px 16px;background:#f0f7ff;border-radius:8px;border-left:4px solid #0d7de0;}
    .party-label{font-size:9pt;color:#0d7de0;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
    .party-name{font-size:13pt;font-weight:700;color:#1a1a1a;margin-bottom:4px;}
    .party-info{font-size:9pt;color:#6b7280;line-height:1.6;}
    table.items{width:100%;border-collapse:collapse;}
    table.items th{background:#0d7de0;color:#fff;padding:11px 12px;font-size:10pt;font-weight:700;}
    table.items td{padding:10px 12px;font-size:10pt;}
    .total-row{background:#0d7de0;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:6px;margin-top:12px;}
    .total-label{font-size:13pt;font-weight:700;}
    .total-value{font-size:18pt;font-weight:900;}
    .footer{position:fixed;bottom:0;left:0;right:0;background:#f8fafc;padding:5px 36px;text-align:center;font-size:9pt;color:#9ca3af;border-top:1px solid #e5e7eb;}
    @media print{.footer{position:fixed;bottom:0;left:0;right:0;}}
    @media print{@page{margin:0;}}
  </style></head><body>
  ${watermark}
  <div class="header">
    <div>${logoHtml}</div>
    <div class="header-right">
      <div class="orcamento-title">ORÇAMENTO</div>
      <div class="orcamento-num">${escapeHtml(q.numero||q.id)}</div>
      <div style="margin-top:6px;font-size:10pt;color:rgba(255,255,255,0.7);">${dateOnly}</div>
      ${validadeHtml}
    </div>
  </div>
  <div class="content">
    <div class="parties">
      <div class="party-box">
        <div class="party-label">Emissor</div>
        <div class="party-name">${escapeHtml(issuer.name||'—')}</div>
        <div class="party-info">
          ${issuer.cnpjCpf?`CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}<br/>`:''}
          ${issuer.address?`${escapeHtml(issuer.address)}<br/>`:''}
          ${issuer.phone?`Tel: ${escapeHtml(issuer.phone)}`:''}
        </div>
      </div>
      <div class="party-box">
        <div class="party-label">Destinatário</div>
        <div class="party-name">${escapeHtml(client.name||'—')}</div>
        <div class="party-info">
          ${client.cnpjCpf?`CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}<br/>`:''}
          ${client.address?`${escapeHtml(client.address)}<br/>`:''}
          ${client.phone?`Tel: ${escapeHtml(client.phone)}`:''}
        </div>
      </div>
    </div>
    <table class="items" cellspacing="0" cellpadding="0">
      <thead><tr>
        <th style="text-align:left;width:55%;">Descrição</th>
        <th style="text-align:center;width:10%;">Qtd</th>
        <th style="text-align:right;width:17%;">Valor Unit.</th>
        <th style="text-align:right;width:18%;">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;" cellspacing="0" cellpadding="0"><tr>
      <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:13pt;color:#fff;background:#0d7de0;border-radius:6px 0 0 6px;">TOTAL:</td>
      <td style="padding:14px 16px;text-align:right;font-weight:900;font-size:17pt;color:#fff;background:#0d7de0;border-radius:0 6px 6px 0;white-space:nowrap;width:22%;">R$ ${mf(q.total||0)}</td>
    </tr></table>
    ${notesHtml}
    <div style="text-align:center;margin-top:100px;margin-bottom:20px;">
      <div style="width:50%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div>
      <div style="font-weight:700;font-size:11pt;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
    </div>
  </div>
  <div class="footer">Orçamento gerado em: ${dateOnly} • SoftPrime Orçamentos</div>
</body></html>`;
}

// ========== GERAÇÃO PDF — MODELO MINIMALISTA ==========
function buildPdfMinimalista(q, issuer, client) {
  const dateOnly = formatDateISOtoLocal(q.createdAt);
  const logoHtml = issuer.logo ? `<div style="margin-bottom:20px;"><img src="${issuer.logo}" style="max-height:70px;max-width:200px;object-fit:contain;" /></div>` : '';
  const watermark = getWatermarkHtml();
  const itemRows = (q.items||[]).map(it => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-size:11pt;">${escapeHtml(it.descricao||'')}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:center;font-size:11pt;color:#6b7280;">${it.quantidade}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11pt;color:#6b7280;">R$ ${mf(it.valorUnitario)}</td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:11pt;font-weight:700;">R$ ${mf((it.quantidade||0)*(it.valorUnitario||0))}</td>
    </tr>`).join('');
  const notesHtml = q.notes ? `<div style="margin-top:20px;padding:14px 0;border-top:1px solid #f3f4f6;font-size:10pt;color:#6b7280;"><strong style="color:#1a1a1a;">Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g,'<br/>')}</div>` : '';
  const validadeHtml = q.validade ? `<div style="font-size:10pt;color:#9ca3af;margin-bottom:20px;">Válido até: ${escapeHtml(q.validade)}</div>` : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Orçamento ${escapeHtml(q.numero||q.id)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    @page{margin:2.5cm;size:A4 portrait;}
    body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:0 auto;max-width:700px;padding:0;position:relative;}
    @media print{body{padding:0;}}
  </style></head><body>
  ${watermark}
  ${logoHtml}
  <div style="border-bottom:2px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div style="font-size:28pt;font-weight:900;letter-spacing:2px;color:#1a1a1a;line-height:1;">ORÇAMENTO</div>
      <div style="font-size:12pt;color:#9ca3af;margin-top:4px;">${escapeHtml(q.numero||q.id)}</div>
    </div>
    <div style="text-align:right;font-size:10pt;color:#6b7280;line-height:1.8;">
      <div>${dateOnly}</div>
      ${q.validade ? `<div>Válido até: ${escapeHtml(q.validade)}</div>` : ''}
    </div>
  </div>
  <div style="display:flex;gap:40px;margin-bottom:32px;">
    <div style="flex:1;">
      <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;margin-bottom:8px;">De</div>
      <div style="font-size:13pt;font-weight:700;">${escapeHtml(issuer.name||'—')}</div>
      <div style="font-size:9pt;color:#6b7280;margin-top:4px;line-height:1.7;">
        ${issuer.cnpjCpf?`${escapeHtml(issuer.cnpjCpf)}<br/>`:''}
        ${issuer.address?`${escapeHtml(issuer.address)}<br/>`:''}
        ${issuer.phone?`Tel: ${escapeHtml(issuer.phone)}`:''}
      </div>
    </div>
    <div style="flex:1;">
      <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;margin-bottom:8px;">Para</div>
      <div style="font-size:13pt;font-weight:700;">${escapeHtml(client.name||'—')}</div>
      <div style="font-size:9pt;color:#6b7280;margin-top:4px;line-height:1.7;">
        ${client.cnpjCpf?`${escapeHtml(client.cnpjCpf)}<br/>`:''}
        ${client.address?`${escapeHtml(client.address)}<br/>`:''}
        ${client.phone?`Tel: ${escapeHtml(client.phone)}`:''}
      </div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
    <thead><tr style="border-bottom:2px solid #1a1a1a;">
      <th style="text-align:left;padding:0 0 10px;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;width:55%;">Descrição</th>
      <th style="text-align:center;padding:0 0 10px;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;width:10%;">Qtd</th>
      <th style="text-align:right;padding:0 0 10px;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;width:17%;">Unit.</th>
      <th style="text-align:right;padding:0 0 10px;font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;width:18%;">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:2px solid #1a1a1a;">
    <div style="text-align:right;">
      <div style="font-size:10pt;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;">Total</div>
      <div style="font-size:22pt;font-weight:900;">R$ ${mf(q.total||0)}</div>
    </div>
  </div>
  ${notesHtml}
  <div style="margin-top:100px;margin-bottom:20px;">
    <div style="width:45%;border-top:1px solid #1a1a1a;"></div>
    <div style="font-size:10pt;font-weight:700;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
  </div>
  <div style="position:fixed;bottom:0;left:0;right:0;font-size:9pt;color:#d1d5db;text-align:center;padding:5px 0;border-top:1px solid #f3f4f6;background:#fff;">Orçamento gerado em: ${dateOnly} • SoftPrime</div>
</body></html>`;
}

// ========== DISPATCHER DE PDF ==========
function generatePDFFromQuote(quoteId, modelo) {
  try {
    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification('Orçamento não encontrado','error'); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};

    // Se não foi passado modelo, abre o seletor
    if (!modelo) {
      openPdfModelSelector(quoteId);
      return;
    }

    // Paywall: modelos moderno/minimalista = pro+
    if (['moderno','minimalista'].includes(modelo)) {
      if (window.PlanGuard && !window.PlanGuard.hasAccess('pdf')) {
        window.PlanGuard.openPaywall('pdf');
        return;
      }
    }

    // Paywall: PDF com logo = pro+ (plano intermediário)
    if (issuer.logo && window.PlanGuard && !window.PlanGuard.hasAccess('pdf')) {
      window.PlanGuard.openPaywall('pdf');
      return;
    }

    let fullDoc;
    if (modelo === 'moderno')        fullDoc = buildPdfModerno(q, issuer, client);
    else if (modelo === 'minimalista') fullDoc = buildPdfMinimalista(q, issuer, client);
    else                               fullDoc = buildPdfClassico(q, issuer, client);

    // Impressão via iframe oculto
    let iframe = document.getElementById('_softprime_pdf_frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = '_softprime_pdf_frame';
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
    }
    const iDoc = iframe.contentWindow.document;
    iDoc.open(); iDoc.write(fullDoc); iDoc.close();
    const pending = Array.from(iDoc.images).filter(i => !i.complete);
    const doPrint = () => { iframe.contentWindow.focus(); iframe.contentWindow.print(); };
    if (!pending.length) { setTimeout(doPrint, 400); }
    else {
      let done = 0;
      pending.forEach(img => {
        img.addEventListener('load',  () => { done++; if (done === pending.length) setTimeout(doPrint, 300); });
        img.addEventListener('error', () => { done++; if (done === pending.length) setTimeout(doPrint, 300); });
      });
    }
  } catch(err) { console.error('[ERROR] generatePDFFromQuote:', err); showNotification('Erro ao gerar PDF','error'); }
}

// ========== EXPORTAÇÃO WORD (.doc) ==========
function exportQuoteDoc(quoteId) {
  // PAYWALL: Word requer premium
  if (window.PlanGuard && !window.PlanGuard.hasAccess('word')) {
    window.PlanGuard.openPaywall('word');
    return;
  }
  try {
    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification('Orçamento não encontrado','error'); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};
    const dateOnly = formatDateISOtoLocal(q.createdAt);
    const logoHtml = issuer.logo ? `<p style="text-align:center;margin-bottom:12px;"><img src="${issuer.logo}" style="max-height:100px;max-width:260px;" /></p>` : '';
    const watermark = getWatermarkHtml();
    const validadeHtml = q.validade ? `<p style="font-size:9pt;color:#6b7280;margin-bottom:12px;">Válido até: <strong>${escapeHtml(q.validade)}</strong></p>` : '';
    const itemRows = (q.items||[]).map(it => `
      <tr>
        <td style="border:1px solid #ccc;padding:8px 10px;">${escapeHtml(it.descricao||'')}</td>
        <td style="border:1px solid #ccc;padding:8px 10px;text-align:center;">${it.quantidade}</td>
        <td style="border:1px solid #ccc;padding:8px 10px;text-align:right;">R$ ${mf(it.valorUnitario)}</td>
        <td style="border:1px solid #ccc;padding:8px 10px;text-align:right;font-weight:bold;">R$ ${mf((it.quantidade||0)*(it.valorUnitario||0))}</td>
      </tr>`).join('');
    const notesHtml = q.notes ? `<p style="margin-top:20px;padding:10px;background:#fffbeb;border-left:3px solid #f59e0b;"><strong>Observações:</strong><br/>${escapeHtml(q.notes).replace(/\n/g,'<br/>')}</p>` : '';

    const doc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Orçamento ${escapeHtml(q.numero||q.id)}</title>
<style>
  @page{margin:2.5cm;size:A4 portrait;}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:0;padding:0;}
  .titulo{font-size:20pt;color:#0d7de0;text-align:center;font-weight:bold;letter-spacing:2px;margin:8px 0 2px;}
  .numero{font-size:12pt;text-align:center;color:#6b7280;margin:0 0 18px;}
  table.layout{width:100%;border-collapse:collapse;margin-bottom:18px;}
  .box{padding:10px 14px;border:1px solid #e0e0e0;background:#f9fafb;}
  .label{font-size:9pt;color:#0d7de0;font-weight:bold;letter-spacing:1px;margin-bottom:5px;display:block;}
  .name{font-size:12pt;font-weight:bold;margin-bottom:3px;display:block;}
  .cnpj{font-size:9pt;color:#6b7280;margin:2px 0;display:block;}
  .info{font-size:9pt;color:#555;margin:1px 0;display:block;}
  table.items{width:100%;border-collapse:collapse;margin-top:10px;}
  table.items th{background:#0d7de0;color:#fff;border:1px solid #0a5fb8;padding:8px 10px;font-size:10pt;font-weight:bold;}
  table.items td{border:1px solid #ccc;padding:8px 10px;font-size:10pt;}
  .footer{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:9pt;color:#9ca3af;padding:5px 0;border-top:1px solid #e5e7eb;background:#fff;}
  @media print{.footer{position:fixed;bottom:0;left:0;right:0;}}
</style></head>
<body>
  ${watermark}
  ${logoHtml}
  <p class="titulo">ORÇAMENTO</p>
  <p class="numero">${escapeHtml(q.numero||q.id)}</p>
  ${validadeHtml}
  <table class="layout" cellspacing="0" cellpadding="0"><tr>
    <td style="width:49%;vertical-align:top;" class="box">
      <span class="label">EMISSOR</span>
      <span class="name">${escapeHtml(issuer.name||'—')}</span>
      ${issuer.cnpjCpf?`<span class="cnpj">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</span>`:''}
      ${issuer.address?`<span class="info">${escapeHtml(issuer.address)}</span>`:''}
      ${issuer.phone?`<span class="info">Tel: ${escapeHtml(issuer.phone)}</span>`:''}
    </td>
    <td style="width:2%;"></td>
    <td style="width:49%;vertical-align:top;" class="box">
      <span class="label">DESTINATÁRIO</span>
      <span class="name">${escapeHtml(client.name||'—')}</span>
      ${client.cnpjCpf?`<span class="cnpj">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</span>`:''}
      ${client.address?`<span class="info">${escapeHtml(client.address)}</span>`:''}
      ${client.phone?`<span class="info">Tel: ${escapeHtml(client.phone)}</span>`:''}
    </td>
  </tr></table>
  <table class="items" cellspacing="0" cellpadding="0">
    <thead><tr>
      <th style="text-align:left;width:55%;">Descrição</th>
      <th style="text-align:center;width:10%;">Qtd</th>
      <th style="text-align:right;width:17%;">Valor Unit.</th>
      <th style="text-align:right;width:18%;">Total</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px;" cellspacing="0" cellpadding="0"><tr>
    <td style="padding:12px;text-align:right;font-weight:bold;font-size:12pt;color:#0d7de0;background:#eef6ff;border:2px solid #93c5fd;">TOTAL:</td>
    <td style="padding:12px;text-align:right;font-weight:bold;font-size:15pt;color:#0d7de0;background:#eef6ff;border:2px solid #93c5fd;width:22%;white-space:nowrap;">R$ ${mf(q.total||0)}</td>
  </tr></table>
  ${notesHtml}
  <div style="text-align:center;margin-top:120px;margin-bottom:30px;">
    <div style="width:55%;border-top:1.5pt solid #1a1a1a;margin:0 auto;"></div>
    <div style="font-weight:bold;font-size:11pt;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
  </div>
  <p class="footer">Orçamento gerado em: ${dateOnly} • SoftPrime Orçamentos</p>
</body></html>`;

    const blob = new Blob(['\ufeff' + doc], { type: 'application/msword;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `orcamento_${q.numero||q.id}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('✅ Word exportado!', 'success');
  } catch(err) { console.error('[ERROR] exportQuoteDoc:', err); showNotification('Erro ao exportar Word','error'); }
}

// ========== EXPORTAÇÃO EXCEL (.xlsx) — via biblioteca SheetJS CDN ==========
async function exportQuoteExcel(quoteId) {
  // PAYWALL: Excel requer premium
  if (window.PlanGuard && !window.PlanGuard.hasAccess('excel')) {
    window.PlanGuard.openPaywall('excel');
    return;
  }
  try {
    // Carrega SheetJS se ainda não estiver disponível
    if (typeof XLSX === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const q = store.quotes.find(x => x.id === quoteId);
    if (!q) { showNotification('Orçamento não encontrado','error'); return; }
    const issuer = store.issuers.find(i => i.id === q.issuerId) || {};
    const client = store.clients.find(c => c.id === q.clientId) || {};

    const wb = XLSX.utils.book_new();

    // Aba 1: Orçamento
    const rows = [
      ['ORÇAMENTO', q.numero||q.id],
      ['Data', formatDateISOtoLocal(q.createdAt)],
      q.validade ? ['Validade', q.validade] : null,
      [],
      ['EMISSOR', issuer.name||'—'],
      ['CNPJ/CPF Emissor', issuer.cnpjCpf||''],
      ['Endereço Emissor', issuer.address||''],
      ['Telefone Emissor', issuer.phone||''],
      [],
      ['DESTINATÁRIO', client.name||'—'],
      ['CNPJ/CPF Cliente', client.cnpjCpf||''],
      ['Endereço Cliente', client.address||''],
      ['Telefone Cliente', client.phone||''],
      [],
      ['Descrição', 'Quantidade', 'Valor Unit. (R$)', 'Total (R$)'],
      ...(q.items||[]).map(it => [
        it.descricao||'',
        it.quantidade||0,
        parseFloat(it.valorUnitario||0),
        parseFloat(((it.quantidade||0)*(it.valorUnitario||0)).toFixed(2))
      ]),
      [],
      ['', '', 'TOTAL (R$)', parseFloat((q.total||0).toFixed(2))],
      [],
      q.notes ? ['Observações', q.notes] : null,
    ].filter(Boolean);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Larguras de coluna
    ws['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 16 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Orçamento');
    XLSX.writeFile(wb, `orcamento_${q.numero||q.id}.xlsx`);
    showNotification('✅ Excel exportado!', 'success');
  } catch(err) { console.error('[ERROR] exportQuoteExcel:', err); showNotification('Erro ao exportar Excel','error'); }
}

// ========== BACKUP EM EXCEL (.xlsx) ==========
async function exportBackupExcel() {
  // PAYWALL: Backup requer premium
  if (window.PlanGuard && !window.PlanGuard.hasAccess('excel')) {
    window.PlanGuard.openPaywall('excel');
    return;
  }
  try {
    if (typeof XLSX === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const wb = XLSX.utils.book_new();

    // Aba Orçamentos
    const quotesRows = [['Número','Emissor','CNPJ Emissor','Cliente','CNPJ Cliente','Data','Validade','Subtotal','Total','Observações']];
    for (const q of store.quotes) {
      const iss = store.issuers.find(i => i.id === q.issuerId) || {};
      const cli = store.clients.find(c => c.id === q.clientId) || {};
      quotesRows.push([
        q.numero||'', iss.name||'', iss.cnpjCpf||'',
        cli.name||'', cli.cnpjCpf||'',
        formatDateISOtoLocal(q.createdAt), q.validade||'',
        parseFloat((q.subtotal||0).toFixed(2)),
        parseFloat((q.total||0).toFixed(2)),
        q.notes||''
      ]);
    }
    const wsQ = XLSX.utils.aoa_to_sheet(quotesRows);
    wsQ['!cols'] = [{wch:14},{wch:28},{wch:18},{wch:28},{wch:18},{wch:12},{wch:12},{wch:12},{wch:12},{wch:40}];
    XLSX.utils.book_append_sheet(wb, wsQ, 'Orçamentos');

    // Aba Emissores
    const issRows = [['Nome','CNPJ/CPF','Endereço','Telefone']];
    store.issuers.forEach(i => issRows.push([i.name||'', i.cnpjCpf||'', i.address||'', i.phone||'']));
    const wsI = XLSX.utils.aoa_to_sheet(issRows);
    wsI['!cols'] = [{wch:30},{wch:18},{wch:40},{wch:16}];
    XLSX.utils.book_append_sheet(wb, wsI, 'Emissores');

    // Aba Clientes
    const cliRows = [['Nome','CNPJ/CPF','Endereço','Telefone']];
    store.clients.forEach(c => cliRows.push([c.name||'', c.cnpjCpf||'', c.address||'', c.phone||'']));
    const wsC = XLSX.utils.aoa_to_sheet(cliRows);
    wsC['!cols'] = [{wch:30},{wch:18},{wch:40},{wch:16}];
    XLSX.utils.book_append_sheet(wb, wsC, 'Clientes');

    const date = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `backup_softprime_${date}.xlsx`);
    showNotification('✅ Backup exportado com sucesso!', 'success');
  } catch(err) { console.error('[ERROR] exportBackupExcel:', err); showNotification('Erro ao gerar backup','error'); }
}

// ========== BOTÃO CONTATO DESENVOLVEDOR (WhatsApp) ==========
function renderDevContactButton() {
  const existing = document.getElementById('sp-dev-contact-btn');
  if (existing) return;

  // Estilo responsivo injetado via <style>
  const style = document.createElement('style');
  style.textContent = `
    #sp-dev-contact-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9989;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #25d366, #128c7e);
      color: #fff;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      box-shadow: 0 4px 20px rgba(37,211,102,0.4);
      text-decoration: none;
      transition: all 0.2s;
      cursor: pointer;
    }
    #sp-dev-contact-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 28px rgba(37,211,102,0.5);
    }
    @media (max-width: 600px) {
      #sp-dev-contact-btn {
        bottom: 16px;
        right: 16px;
        width: 46px;
        height: 46px;
      }
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('a');
  btn.id     = 'sp-dev-contact-btn';
  const whatsNumber = '5518981607700';
  const whatsMsg    = encodeURIComponent('Olá! Tenho interesse em contratar um plano do SoftPrime. Pode me ajudar?');
  btn.href   = `https://wa.me/${whatsNumber}?text=${whatsMsg}`;
  btn.target = '_blank';
  btn.rel    = 'noopener noreferrer';
  btn.title  = 'Falar com o desenvolvedor no WhatsApp';
  btn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  `;

  document.body.appendChild(btn);
}

// ========== RENDER DA QUOTA HTML (prévia modal) ==========
function renderQuoteHtml(q, issuer, client){
  const dateOnly=formatDateISOtoLocal(q.createdAt);
  const plan = window.PlanGuard ? window.PlanGuard.getActivePlan() : (localStorage.getItem('softprime_plan')||null);
  const isPremium = plan === 'premium';
  const watermarkHtml = isPremium ? '' : `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);
      font-size:48px;font-weight:900;color:rgba(13,125,224,0.06);white-space:nowrap;pointer-events:none;
      letter-spacing:6px;z-index:0;font-family:Arial,sans-serif;">SOFTPRIME</div>`;
  const logoHtml=issuer.logo?`<div style="text-align:center;margin-bottom:20px;"><img src="${issuer.logo}" alt="Logo" style="max-height:100px;max-width:260px;object-fit:contain;" /></div>`:'';
  const validadeHtml = q.validade ? `<div style="text-align:center;font-size:12px;color:#9ca3af;margin-bottom:16px;">Válido até: <strong>${escapeHtml(q.validade)}</strong></div>` : '';
  const issuerBlock=`
    <div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">EMISSOR</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(issuer.name||'—')}</div>
    ${issuer.cnpjCpf?`<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(issuer.cnpjCpf)}</div>`:''}
    ${issuer.address?`<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(issuer.address)}</div>`:''}
    ${issuer.phone?`<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(issuer.phone)}</div>`:''}`;
  const clientBlock=`
    <div style="font-size:10px;font-weight:700;color:#0d7de0;letter-spacing:1px;margin-bottom:8px;">DESTINATÁRIO</div>
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(client.name||'—')}</div>
    ${client.cnpjCpf?`<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">CNPJ/CPF: ${escapeHtml(client.cnpjCpf)}</div>`:''}
    ${client.address?`<div style="font-size:12px;color:#4b5563;margin-bottom:2px;">${escapeHtml(client.address)}</div>`:''}
    ${client.phone?`<div style="font-size:12px;color:#4b5563;">Tel: ${escapeHtml(client.phone)}</div>`:''}`;
  const itemRows=(q.items||[]).map(it=>`
    <tr>
      <td style="padding:10px 8px;border:1px solid #d1d5db;word-break:break-word;font-size:13px;">${escapeHtml(it.descricao||'')}</td>
      <td style="padding:10px 8px;border:1px solid #d1d5db;text-align:center;white-space:nowrap;font-size:13px;">${it.quantidade}</td>
      <td style="padding:10px 8px;border:1px solid #d1d5db;text-align:right;white-space:nowrap;font-size:13px;">R$ ${money(it.valorUnitario)}</td>
      <td style="padding:10px 8px;border:1px solid #d1d5db;text-align:right;white-space:nowrap;font-size:13px;font-weight:700;">R$ ${money((it.quantidade||0)*(it.valorUnitario||0))}</td>
    </tr>`).join('');
  const notesHtml=q.notes?`
    <div style="margin-top:20px;padding:14px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;">
      <strong style="color:#92400e;font-size:13px;">Observações:</strong>
      <div style="margin-top:6px;color:#78350f;font-size:13px;white-space:pre-wrap;">${escapeHtml(q.notes)}</div>
    </div>`:'';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#1a1a1a;position:relative;">
      ${watermarkHtml}
      ${logoHtml}
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:24px;font-weight:800;color:#0d7de0;letter-spacing:2px;">ORÇAMENTO</div>
        <div style="font-size:17px;font-weight:600;margin-top:6px;">${escapeHtml(q.numero||q.id)}</div>
      </div>
      ${validadeHtml}
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">${issuerBlock}</td>
          <td style="width:2%;"></td>
          <td style="width:49%;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;">${clientBlock}</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;table-layout:auto;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:10px 8px;text-align:left;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;">Descrição</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;white-space:nowrap;width:8%;">Qtd</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;white-space:nowrap;width:20%;">Valor Unit.</th>
          <th style="padding:10px 8px;text-align:right;font-size:12px;font-weight:700;color:#374151;border:1px solid #d1d5db;white-space:nowrap;width:20%;">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:14px;margin-bottom:20px;table-layout:auto;">
        <tr>
          <td style="padding:12px 10px;text-align:right;font-weight:700;font-size:14px;color:#0d7de0;border:2px solid #bfdbfe;background:#eef6ff;">TOTAL:</td>
          <td style="padding:12px 10px;text-align:right;font-weight:800;font-size:16px;color:#0d7de0;border:2px solid #bfdbfe;white-space:nowrap;width:20%;background:#eef6ff;">R$ ${money(q.total)}</td>
        </tr>
      </table>
      ${notesHtml}
      <div style="margin-top:200px;margin-bottom:16px;text-align:center;">
        <div style="width:55%;border-top:1.5px solid #1a1a1a;margin:0 auto;"></div>
        <div style="font-weight:700;font-size:13px;margin-top:8px;">${escapeHtml(issuer.name||'')}</div>
      </div>
      <div style="position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:10px;color:#9ca3af;padding:5px 0;border-top:1px solid #e5e7eb;background:#fff;">Orçamento gerado em: ${escapeHtml(dateOnly)}</div>
    </div>`;
}

// ========== INIT ==========
function renderAll(){ renderIssuers(); renderClients(); renderQuotes(); renderItems(currentItems); }

async function initApp() {
  if (_appInitialized) { console.log('⚠️ initApp já foi chamado — ignorando dupla chamada'); return; }
  _appInitialized = true; window._appInitialized = true;
  await loadAllData();
  renderAll();
  setDefaultQuoteFields();
  // Botão de contato WhatsApp — aparece em todas as páginas do app
  renderDevContactButton();
  console.log('✅ SoftPrime iniciado! Usuário:', getUserId());

  const p = window.location.pathname;
  if (p.endsWith('orcamentos_salvos.html') || p === '/orcamentos_salvos' || p === '/orcamentos_salvos/') {
    if (typeof renderPanel === 'function') renderPanel();
  }

  // ── Retomar edição vinda da página Orçamentos Salvos ─────────────────────
  const pendingEditId = sessionStorage.getItem('editQuoteId');
  if (pendingEditId) {
    sessionStorage.removeItem('editQuoteId');
    setTimeout(() => {
      if (typeof startEditMode === 'function') {
        startEditMode(pendingEditId);
      }
    }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.authManager && window.authManager._initialized && window.authManager.getUserId()) {
    initApp();
  }
});

// ========== PAYWALL MODAL (compatibilidade com plan-guard.js) ==========
window.PaywallModal = {
  hasAccess: (feature) => window.PlanGuard ? window.PlanGuard.hasAccess(feature) : false,
  open:      (feature) => window.PlanGuard ? window.PlanGuard.openPaywall(feature) : null,
  getCurrentPlan: ()  => window.PlanGuard ? window.PlanGuard.getActivePlan() : null,
};
