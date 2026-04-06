<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Planos — SoftPrime Orçamentos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --blue-deep: #020c1b;
    --blue-mid: #041830;
    --accent: #1a8fff;
    --accent-glow: rgba(26,143,255,0.25);
    --accent-2: #00d4ff;
    --gold: #f5c842;
    --white: #f0f6ff;
    --muted: rgba(160,200,255,0.55);
    --card-bg: rgba(10,30,60,0.55);
    --card-border: rgba(26,143,255,0.18);
    --radius: 18px;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--blue-deep);
    color: var(--white);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── BACKGROUND ── */
  #bg-layer {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image: url('bg-login.png');
    background-size: cover; background-position: center;
    filter: brightness(0.28) saturate(120%);
  }
  #bg-overlay {
    position: fixed; inset: 0; z-index: 1; pointer-events: none;
    background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(26,143,255,0.12) 0%, transparent 70%),
                linear-gradient(180deg, rgba(2,12,27,0.5) 0%, rgba(2,12,27,0.85) 100%);
  }
  canvas#stars { position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: 0.6; }

  .page { position: relative; z-index: 10; }

  /* ── HEADER ── */
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 22px 48px;
    border-bottom: 1px solid rgba(26,143,255,0.1);
    backdrop-filter: blur(12px);
    background: rgba(2,12,27,0.4);
    position: sticky; top: 0; z-index: 100;
  }
  .logo-mark {
    font-weight: 800; font-size: 20px;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .header-nav { display: flex; gap: 12px; align-items: center; }
  .btn-back {
    padding: 9px 20px; border-radius: 8px;
    border: 1px solid var(--card-border);
    background: transparent; color: var(--muted);
    font-family: 'DM Sans', sans-serif; font-size: 14px; cursor: pointer;
    transition: all 0.2s; text-decoration: none;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn-back:hover { border-color: var(--accent); color: var(--accent); }
  .btn-login {
    padding: 9px 20px; border-radius: 8px;
    background: var(--accent); color: #fff; border: none;
    font-family: 'DM Sans', sans-serif; font-size: 14px;
    font-weight: 500; cursor: pointer; transition: all 0.2s; text-decoration: none;
  }
  .btn-login:hover { background: #0a7de0; }

  /* ── HERO ── */
  .hero { text-align: center; padding: 80px 24px 56px; }
  .hero-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 16px; border-radius: 100px;
    border: 1px solid rgba(26,143,255,0.3);
    background: rgba(26,143,255,0.08);
    font-size: 13px; color: var(--accent-2); font-weight: 500;
    margin-bottom: 28px; animation: fadeUp 0.6s ease both;
  }
  .hero-badge span { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-2); animation: pulse 2s infinite; display:inline-block; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

  .hero h1 {
    font-size: clamp(34px, 5.5vw, 62px); font-weight: 800;
    line-height: 1.08; letter-spacing: -1px; margin-bottom: 18px;
    animation: fadeUp 0.6s 0.1s ease both;
  }
  .hero h1 em {
    font-style: normal;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent-2) 100%);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .hero p {
    font-size: 17px; color: var(--muted); max-width: 480px;
    margin: 0 auto 32px; line-height: 1.6;
    animation: fadeUp 0.6s 0.2s ease both;
  }
  .trial-banner {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 12px 24px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(245,200,66,0.12), rgba(245,200,66,0.05));
    border: 1px solid rgba(245,200,66,0.3);
    font-size: 15px; color: var(--gold); font-weight: 500;
    animation: fadeUp 0.6s 0.3s ease both;
  }

  /* ── PERIOD SELECTOR ── */
  .period-selector {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    margin: 52px auto 48px; flex-wrap: wrap;
    animation: fadeUp 0.6s 0.35s ease both;
  }
  .period-btn {
    position: relative; padding: 12px 28px; border-radius: 12px;
    border: 1px solid var(--card-border); background: var(--card-bg);
    color: var(--muted); font-family: 'DM Sans', sans-serif;
    font-size: 15px; font-weight: 500; cursor: pointer;
    transition: all 0.22s; backdrop-filter: blur(12px);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
  }
  .period-btn:hover { border-color: rgba(26,143,255,0.4); color: var(--white); }
  .period-btn.active {
    border-color: var(--accent);
    background: rgba(26,143,255,0.15);
    color: var(--white);
    box-shadow: 0 0 0 1px rgba(26,143,255,0.3), 0 8px 24px rgba(26,143,255,0.2);
  }
  .period-btn .period-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
  .period-btn .period-price { font-size: 20px; font-weight: 800; color: var(--white); margin: 2px 0; }
  .period-btn .period-sub { font-size: 12px; color: var(--muted); }
  .period-btn.active .period-sub { color: var(--accent-2); }
  .period-save {
    position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(90deg, var(--gold), #e8a800);
    color: #020c1b; font-size: 10px; font-weight: 800;
    padding: 3px 10px; border-radius: 100px; white-space: nowrap;
    letter-spacing: 0.3px;
  }

  /* ── SINGLE PLAN CARD ── */
  .plan-wrapper {
    max-width: 560px; margin: 0 auto; padding: 0 24px;
    animation: fadeUp 0.6s 0.4s ease both;
  }
  .plan-card {
    position: relative;
    background: rgba(26,143,255,0.1);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 44px 40px 40px;
    backdrop-filter: blur(16px);
    box-shadow: 0 0 0 1px rgba(26,143,255,0.25), 0 24px 64px rgba(26,143,255,0.2);
    overflow: hidden;
  }
  .plan-card::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, rgba(26,143,255,0.06) 0%, transparent 60%);
    pointer-events: none;
  }
  .plan-badge-top {
    position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    color: #fff; font-size: 11px; font-weight: 700;
    padding: 5px 20px; border-radius: 0 0 12px 12px;
    letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;
  }

  .plan-header { text-align: center; margin-bottom: 32px; padding-top: 12px; }
  .plan-icon-big { font-size: 40px; margin-bottom: 12px; }
  .plan-title {
    font-size: 28px; font-weight: 800; color: var(--white);
    letter-spacing: -0.5px; margin-bottom: 6px;
  }
  .plan-subtitle { font-size: 15px; color: var(--muted); line-height: 1.5; }

  /* Price display */
  .plan-price-display {
    text-align: center; margin-bottom: 8px;
    min-height: 80px; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    transition: all 0.3s;
  }
  .price-main {
    display: flex; align-items: baseline; gap: 4px; justify-content: center;
  }
  .price-currency { font-size: 22px; color: var(--muted); font-weight: 600; margin-top: 8px; }
  .price-value {
    font-size: 64px; font-weight: 800; line-height: 1;
    letter-spacing: -2px; color: var(--white);
  }
  .price-cents { font-size: 28px; font-weight: 700; color: var(--white); margin-top: 8px; }
  .price-period { font-size: 14px; color: var(--muted); margin-top: 6px; }
  .price-economy {
    display: inline-block; margin-top: 8px;
    padding: 4px 12px; border-radius: 100px;
    background: rgba(245,200,66,0.15); color: var(--gold);
    font-size: 13px; font-weight: 600;
    border: 1px solid rgba(245,200,66,0.3);
  }
  .price-economy.hidden { display: none; }

  /* CTA */
  .btn-checkout {
    width: 100%; padding: 16px;
    border-radius: 12px; border: none;
    background: linear-gradient(135deg, var(--accent), #0a6dc7);
    color: #fff; font-family: 'DM Sans', sans-serif;
    font-size: 17px; font-weight: 700; cursor: pointer;
    transition: all 0.25s; margin: 28px 0 32px;
    box-shadow: 0 8px 28px rgba(26,143,255,0.35);
    letter-spacing: 0.2px;
  }
  .btn-checkout:hover {
    box-shadow: 0 12px 36px rgba(26,143,255,0.55);
    transform: translateY(-2px);
  }

  /* Features */
  .features-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: var(--muted); margin-bottom: 16px;
  }
  .plan-features { list-style: none; display: flex; flex-direction: column; gap: 13px; }
  .plan-features li {
    display: flex; align-items: center; gap: 12px;
    font-size: 15px; color: rgba(200,230,255,0.85); line-height: 1.4;
  }
  .feat-check {
    width: 20px; height: 20px; flex-shrink: 0;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
    background: rgba(26,143,255,0.2); color: var(--accent);
    border: 1px solid rgba(26,143,255,0.35);
  }

  /* ── GUARANTEE + STEPS ── */
  .bottom-section {
    text-align: center; padding: 64px 24px 48px;
    max-width: 700px; margin: 0 auto;
    animation: fadeUp 0.6s 0.5s ease both;
  }
  .bottom-section h2 {
    font-size: 30px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 14px;
  }
  .bottom-section > p { color: var(--muted); font-size: 16px; line-height: 1.7; margin-bottom: 36px; }
  .trial-steps {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 18px; margin-bottom: 36px;
  }
  .trial-step {
    background: var(--card-bg); border: 1px solid var(--card-border);
    border-radius: 14px; padding: 22px 18px; backdrop-filter: blur(12px);
  }
  .step-num {
    font-size: 26px; font-weight: 800;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .trial-step h4 { font-size: 14px; font-weight: 600; margin-bottom: 5px; }
  .trial-step p { font-size: 13px; color: var(--muted); margin: 0; }
  .guarantee {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    padding: 14px 28px; border-radius: 12px;
    background: rgba(26,143,255,0.06); border: 1px solid rgba(26,143,255,0.15);
    max-width: 440px; margin: 0 auto; font-size: 14px; color: var(--muted);
  }
  .guarantee .shield { font-size: 22px; }

  /* ── FOOTER ── */
  footer {
    text-align: center; padding: 32px 24px;
    border-top: 1px solid rgba(26,143,255,0.08);
    color: rgba(160,200,255,0.3); font-size: 13px; margin-top: 60px;
  }
  footer a { color: var(--accent); text-decoration: none; }

  /* ── ANIMATIONS ── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 600px) {
    header { padding: 16px 20px; }
    .hero { padding: 56px 20px 36px; }
    .period-selector { gap: 8px; }
    .period-btn { padding: 10px 18px; }
    .plan-card { padding: 36px 24px 32px; }
    .price-value { font-size: 52px; }
    .trial-steps { grid-template-columns: 1fr; }
  }

  /* Loading overlay */
  #mp-loading {
    display: none; position: fixed; inset: 0; z-index: 999;
    background: rgba(2,12,27,0.85); backdrop-filter: blur(8px);
    align-items: center; justify-content: center; flex-direction: column; gap: 16px;
  }
  #mp-loading.show { display: flex; }
  .spinner {
    width: 44px; height: 44px; border-radius: 50%;
    border: 3px solid rgba(26,143,255,0.2); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<div id="bg-layer"></div>
<div id="bg-overlay"></div>
<canvas id="stars"></canvas>

<div id="mp-loading">
  <div class="spinner"></div>
  <p style="color:var(--muted);font-size:15px;">Redirecionando para o pagamento…</p>
</div>

<div class="page">

  <!-- Header -->
  <header>
    <div class="logo-mark">⚡ SoftPrime</div>
    <nav class="header-nav">
      <a href="/login" class="btn-back">← Voltar</a>
      <a href="/login" class="btn-login">Entrar</a>
    </nav>
  </header>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-badge"><span></span> Planos & Preços</div>
    <h1>Acesso <em>completo</em><br>sem complicação</h1>
    <p>Um único plano com todas as funcionalidades liberadas. Escolha o período que preferir.</p>
    <div class="trial-banner">🎁 <strong>7 dias grátis</strong> — sem cartão de crédito necessário</div>
  </section>

  <!-- Period selector -->
  <div class="period-selector">

    <button class="period-btn active" id="btn-monthly" onclick="selectPeriod('monthly')">
      <span class="period-label">Mensal</span>
      <span class="period-price">R$ 29,90</span>
      <span class="period-sub">por mês</span>
    </button>

    <button class="period-btn" id="btn-semiannual" onclick="selectPeriod('semiannual')">
      <span class="period-save">ECONOMIA DE 17%</span>
      <span class="period-label">Semestral</span>
      <span class="period-price">R$ 149,50</span>
      <span class="period-sub">R$ 24,92/mês</span>
    </button>

    <button class="period-btn" id="btn-annual" onclick="selectPeriod('annual')">
      <span class="period-save">MELHOR PREÇO</span>
      <span class="period-label">Anual</span>
      <span class="period-price">R$ 299,00</span>
      <span class="period-sub">R$ 24,92/mês</span>
    </button>

  </div>

  <!-- Single Plan Card -->
  <div class="plan-wrapper">
    <div class="plan-card">
      <div class="plan-badge-top">⚡ Acesso Total Liberado</div>

      <div class="plan-header">
        <div class="plan-icon-big">🚀</div>
        <div class="plan-title">SoftPrime Completo</div>
        <div class="plan-subtitle">Todas as funcionalidades incluídas,<br>sem restrições e sem surpresas.</div>
      </div>

      <!-- Price display (atualizado via JS) -->
      <div class="plan-price-display" id="price-display">
        <div class="price-main">
          <span class="price-currency">R$</span>
          <span class="price-value" id="price-int">29</span>
          <span class="price-cents" id="price-dec">,90</span>
        </div>
        <div class="price-period" id="price-period">por mês</div>
        <span class="price-economy hidden" id="price-economy"></span>
      </div>

      <button class="btn-checkout" onclick="startCheckout()">
        Começar grátis por 7 dias →
      </button>

      <div class="features-title">✅ Tudo incluído no plano</div>
      <ul class="plan-features">
        <li><span class="feat-check">✓</span> Orçamentos ilimitados</li>
        <li><span class="feat-check">✓</span> Cadastro de clientes e emissores</li>
        <li><span class="feat-check">✓</span> PDF profissional com logo personalizada</li>
        <li><span class="feat-check">✓</span> Exportação Word (.docx)</li>
        <li><span class="feat-check">✓</span> Exportação Excel (.xlsx)</li>
        <li><span class="feat-check">✓</span> Múltiplos modelos de PDF</li>
        <li><span class="feat-check">✓</span> Histórico completo de orçamentos</li>
        <li><span class="feat-check">✓</span> Acesso web e mobile</li>
        <li><span class="feat-check">✓</span> Sem marca d'água nos documentos</li>
        <li><span class="feat-check">✓</span> Suporte via WhatsApp</li>
        <li><span class="feat-check">✓</span> Backup automático na nuvem</li>
      </ul>
    </div>
  </div>

  <!-- Como funciona -->
  <section class="bottom-section">
    <h2>Como funciona o período grátis?</h2>
    <p>Você começa a usar imediatamente, sem precisar informar cartão. Só cobramos ao final dos 7 dias, caso queira continuar.</p>
    <div class="trial-steps">
      <div class="trial-step">
        <div class="step-num">01</div>
        <h4>Crie sua conta</h4>
        <p>Cadastro rápido, sem cartão de crédito necessário.</p>
      </div>
      <div class="trial-step">
        <div class="step-num">02</div>
        <h4>Use por 7 dias</h4>
        <p>Acesso completo a todas as funcionalidades sem custo.</p>
      </div>
      <div class="trial-step">
        <div class="step-num">03</div>
        <h4>Assine ou cancele</h4>
        <p>Ao final do trial, escolha continuar ou cancele sem burocracia.</p>
      </div>
    </div>
    <div class="guarantee">
      <span class="shield">🛡️</span>
      <span>Garantia de 7 dias — insatisfeito? Devolvemos seu dinheiro.</span>
    </div>
  </section>

  <footer>
    <p>© 2026 SoftPrime — <a href="/login">Entrar no sistema</a> · Dúvidas? <a href="https://wa.me/5518981607700" target="_blank">Falar no WhatsApp</a></p>
  </footer>

</div><!-- .page -->

<script>
// ── Stars canvas ──
(function() {
  const c = document.getElementById('stars');
  const ctx = c.getContext('2d');
  let W, H, stars = [];
  function resize() { W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();
  for(let i=0;i<120;i++) stars.push({
    x: Math.random()*2000, y: Math.random()*2000,
    r: Math.random()*1.2+0.2, a: Math.random(), va: (Math.random()-0.5)*0.005
  });
  function frame() {
    ctx.clearRect(0,0,W,H);
    stars.forEach(s => {
      s.a = Math.max(0.05, Math.min(0.9, s.a + s.va));
      if(s.a<=0.05||s.a>=0.9) s.va *= -1;
      ctx.beginPath(); ctx.arc(s.x%W, s.y%H, s.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(180,220,255,${s.a})`; ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  frame();
})();

// ── Period selector ──
let currentPeriod = 'monthly';

const periodData = {
  monthly: {
    int: '29', dec: ',90',
    period: 'por mês',
    economy: null,
    link: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=27ebb103fe7f4b79896c1bab3fbba34e'
  },
  semiannual: {
    int: '149', dec: ',50',
    period: 'a cada 6 meses · R$ 24,92/mês',
    economy: '💰 Economia de R$ 30,00 vs mensal',
    link: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=d2e9a9c34db74ea9a5ab9cadcf811171' // 🔧 substitua pelo link real
  },
  annual: {
    int: '299', dec: ',00',
    period: 'por ano · R$ 24,92/mês',
    economy: '💰 Economia de R$ 59,80 vs mensal',
    link: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=47df5b41e79a4ce8aef081c3babd9d3f' // 🔧 substitua pelo link real
  }
};

function selectPeriod(period) {
  currentPeriod = period;

  // Atualiza botões
  ['monthly','semiannual','annual'].forEach(p => {
    document.getElementById('btn-' + p).classList.toggle('active', p === period);
  });

  // Atualiza preço no card
  const d = periodData[period];
  document.getElementById('price-int').textContent    = d.int;
  document.getElementById('price-dec').textContent    = d.dec;
  document.getElementById('price-period').textContent = d.period;

  const econEl = document.getElementById('price-economy');
  if (d.economy) {
    econEl.textContent = d.economy;
    econEl.classList.remove('hidden');
  } else {
    econEl.classList.add('hidden');
  }
}

// ── Checkout ──
function startCheckout() {
  const d = periodData[currentPeriod];
  localStorage.setItem('softprime_plan', 'premium'); // acesso total
  localStorage.setItem('softprime_plan_period', currentPeriod);
  localStorage.setItem('softprime_plan_ts', Date.now());

  document.getElementById('mp-loading').classList.add('show');
  setTimeout(() => { window.location.href = d.link; }, 900);
}
</script>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="auth.js"></script>
<script src="plan-guard.js"></script>
<script>
// ── Detecta usuário logado e adapta a UI ──
(function detectLoggedUser() {
  function waitForAuth(cb, tries) {
    tries = tries || 0;
    if (tries > 40) return;
    if (window.authManager && window.authManager._initialized) cb(window.authManager);
    else setTimeout(() => waitForAuth(cb, tries + 1), 150);
  }

  waitForAuth(function(auth) {
    const isLoggedIn = auth.isAuthenticated();
    const btnBack  = document.querySelector('.btn-back');
    const btnLogin = document.querySelector('.btn-login');

    if (isLoggedIn) {
      if (btnBack)  { btnBack.href = '/index'; btnBack.textContent = '← Voltar ao app'; }
      if (btnLogin) { btnLogin.style.display = 'none'; }
    }

    // Detectar retorno do Mercado Pago
    const params    = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id') || params.get('collection_id');
    const status    = params.get('status') || params.get('collection_status');

    if (paymentId || status === 'approved') {
      document.querySelector('.page').innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px 20px;">
          <div>
            <div style="font-size:72px;margin-bottom:20px;">🎉</div>
            <h1 style="font-size:clamp(28px,5vw,48px);font-weight:800;color:#fff;margin-bottom:12px;">Pagamento confirmado!</h1>
            <p style="color:rgba(160,200,255,0.7);font-size:16px;margin-bottom:32px;max-width:400px;margin:0 auto 32px;">
              Seu plano foi ativado com sucesso. Você será redirecionado em instantes.
            </p>
            <div style="width:200px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin:0 auto;overflow:hidden;">
              <div style="height:100%;background:#1a8fff;border-radius:2px;animation:loadBar 2.5s ease forwards;"></div>
            </div>
            <style>@keyframes loadBar{from{width:0}to{width:100%}}</style>
          </div>
        </div>`;
      setTimeout(() => { window.location.href = '/index'; }, 2800);
    }
  });
})();
</script>

</body>
</html>
