// plan-guard.js — SoftPrime
// Verifica plano do usuário no Supabase, controla trial de 7 dias
// e bloqueia acesso/features conforme plano ativo.
// Carregue APÓS config.js e auth.js

(function () {

  // ─── Configurações dos planos ────────────────────────────────────────────────

  const PLAN_LEVELS = { trial: 1, basic: 1, pro: 2, premium: 3, expired: 0 };

  // Quais features cada nível desbloqueia
  const FEATURE_MIN_LEVEL = {
    export: 1,   // trial/basic ou acima → exportar CSV
    pdf:    2,   // pro ou acima → PDF com logo
    word:   3,   // premium → Word
    excel:  3,   // premium → Excel
  };

  const PLAN_LABELS = {
    trial:   'Trial (7 dias)',
    basic:   'Básico',
    pro:     'Intermediário',
    premium: 'Premium',
    expired: 'Expirado',
  };

  const FEATURE_LABELS = {
    export: 'Exportação CSV',
    pdf:    'PDF com logo personalizada',
    word:   'Exportação Word (.docx)',
    excel:  'Exportação Excel (.xlsx)',
  };

  const REQUIRED_PLAN_LABEL = {
    export: 'Básico',
    pdf:    'Intermediário',
    word:   'Premium',
    excel:  'Premium',
  };

  // ─── Estado local ─────────────────────────────────────────────────────────────

  let _planData = null; // dados brutos do Supabase
  let _loaded   = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function _getSupabase() {
    return window.authManager ? window.authManager.getSupabase() : null;
  }
  function _getUserId() {
    return window.authManager ? window.authManager.getUserId() : null;
  }

  // Persiste plano simplificado no localStorage (para PaywallModal legado)
  function _syncLocalStorage(plan) {
    const legacyMap = { trial: 'basic', basic: 'basic', pro: 'pro', premium: 'premium', expired: null };
    const lsPlan = legacyMap[plan] || null;
    if (lsPlan) {
      localStorage.setItem('softprime_plan', lsPlan);
    } else {
      localStorage.removeItem('softprime_plan');
    }
  }

  // ─── Carregar plano do Supabase ───────────────────────────────────────────────

  async function loadPlan() {
    const sb  = _getSupabase();
    const uid = _getUserId();
    if (!sb || !uid) return null;

    // 1. Busca registro existente
    const { data, error } = await sb
      .from('user_plans')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      console.error('[PlanGuard] Erro ao buscar plano:', error.message);
      return null;
    }

    // 2. Se não existe, cria trial de 7 dias
    if (!data) {
      const now      = new Date();
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data: created, error: createErr } = await sb
        .from('user_plans')
        .insert({
          user_id:     uid,
          plan:        'trial',
          trial_start: now.toISOString(),
          trial_end:   trialEnd.toISOString(),
        })
        .select()
        .single();

      if (createErr) {
        console.error('[PlanGuard] Erro ao criar trial:', createErr.message);
        return null;
      }
      _planData = created;
      _loaded   = true;
      _syncLocalStorage('trial');
      console.log('[PlanGuard] Trial criado — expira em:', trialEnd.toLocaleDateString('pt-BR'));
      return _planData;
    }

    _planData = data;
    _loaded   = true;

    // 3. Se o plano é 'trial', verifica se expirou
    if (data.plan === 'trial') {
      const now      = new Date();
      const trialEnd = new Date(data.trial_end);
      if (now > trialEnd) {
        // Atualiza para 'expired' no banco
        await sb.from('user_plans')
          .update({ plan: 'expired', updated_at: new Date().toISOString() })
          .eq('user_id', uid);
        _planData.plan = 'expired';
        _syncLocalStorage('expired');
        console.warn('[PlanGuard] Trial expirado em:', trialEnd.toLocaleDateString('pt-BR'));
        return _planData;
      }
    }

    _syncLocalStorage(data.plan);
    console.log('[PlanGuard] Plano carregado:', data.plan);
    return _planData;
  }

  // ─── Verificação de acesso ────────────────────────────────────────────────────

  function getActivePlan() {
    return _planData ? _planData.plan : null;
  }

  function getPlanLevel() {
    const plan = getActivePlan();
    return PLAN_LEVELS[plan] || 0;
  }

  function isExpired() {
    return getActivePlan() === 'expired';
  }

  function hasAccess(feature) {
    if (isExpired()) return false;
    const userLevel = getPlanLevel();
    const required  = FEATURE_MIN_LEVEL[feature] || 99;
    return userLevel >= required;
  }

  function getTrialDaysLeft() {
    if (!_planData || _planData.plan !== 'trial') return null;
    const now      = new Date();
    const trialEnd = new Date(_planData.trial_end);
    const diff     = trialEnd - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // ─── Guard de página: redireciona se expirado ─────────────────────────────────

  function enforcePlanGuard() {
    if (!_loaded) return;

    const isPlanos  = window.location.pathname.endsWith('planos.html');
    const isLogin   = window.location.pathname.endsWith('login.html');

    // Não bloqueia na própria página de planos ou login
    if (isPlanos || isLogin) return;

    if (isExpired()) {
      console.warn('[PlanGuard] Plano expirado → redirecionando para planos.html');
      window.location.replace('/planos.html?expired=1');
    }
  }

  // ─── Banner de trial ──────────────────────────────────────────────────────────

  function renderTrialBanner() {
    // Remove banner anterior
    const old = document.getElementById('sp-trial-banner');
    if (old) old.remove();

    const plan     = getActivePlan();
    const daysLeft = getTrialDaysLeft();

    if (plan !== 'trial' || daysLeft === null) return;

    const urgency  = daysLeft <= 2;
    const color    = urgency ? '#ef4444' : '#f5c842';
    const bgColor  = urgency ? 'rgba(239,68,68,0.12)' : 'rgba(245,200,66,0.10)';
    const border   = urgency ? 'rgba(239,68,68,0.35)' : 'rgba(245,200,66,0.30)';
    const icon     = urgency ? '⚠️' : '⏳';
    const msg      = daysLeft === 0
      ? 'Seu período de trial expirou hoje!'
      : daysLeft === 1
        ? 'Último dia de trial! Assine para continuar.'
        : `${daysLeft} dias restantes no seu período de teste gratuito.`;

    const banner = document.createElement('div');
    banner.id = 'sp-trial-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:9990', 'display:flex', 'align-items:center', 'gap:12px',
      `background:${bgColor}`, `border:1px solid ${border}`,
      'border-radius:12px', 'padding:12px 20px',
      'backdrop-filter:blur(12px)', 'box-shadow:0 8px 32px rgba(0,0,0,0.3)',
      'max-width:480px', 'width:calc(100% - 32px)',
      'font-family:"DM Sans",sans-serif',
    ].join(';');

    banner.innerHTML = `
      <span style="font-size:20px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:${color};line-height:1.3;">${msg}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;">
          Plano atual: <strong style="color:${color};">Trial — apenas recursos básicos</strong>
        </div>
      </div>
      <a href="planos.html" style="
        padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;
        background:${urgency ? '#ef4444' : '#f5c842'};
        color:${urgency ? '#fff' : '#1a1a1a'};
        text-decoration:none;white-space:nowrap;flex-shrink:0;
      ">Ver planos</a>
      <button onclick="this.parentElement.remove()" style="
        background:none;border:none;cursor:pointer;
        color:rgba(255,255,255,0.3);font-size:18px;padding:0 0 0 4px;
        line-height:1;flex-shrink:0;
      ">×</button>
    `;

    document.body.appendChild(banner);
  }

  // ─── Paywall modal (feature bloqueada) ────────────────────────────────────────

  function openPaywall(feature) {
    const existing = document.getElementById('sp-paywall-modal');
    if (existing) existing.remove();

    const plan         = getActivePlan();
    const planLabel    = PLAN_LABELS[plan] || 'Nenhum';
    const featureLabel = FEATURE_LABELS[feature] || feature;
    const requiredPlan = REQUIRED_PLAN_LABEL[feature] || 'Premium';

    const modal = document.createElement('div');
    modal.id = 'sp-paywall-modal';
    modal.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.70)', 'backdrop-filter:blur(6px)',
      'padding:20px',
    ].join(';');

    modal.innerHTML = `
      <div style="
        background:#1f2937;border:1px solid rgba(99,102,241,0.3);
        border-radius:16px;padding:36px 28px;max-width:420px;width:100%;
        box-shadow:0 24px 60px rgba(0,0,0,0.5);text-align:center;
        font-family:'DM Sans',sans-serif;color:#f0f6ff;
      ">
        <div style="font-size:44px;margin-bottom:14px;">🔒</div>
        <h3 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#fff;">
          Recurso bloqueado
        </h3>
        <p style="margin:0 0 6px;font-size:14px;color:rgba(160,200,255,0.75);line-height:1.5;">
          <strong style="color:#a5b4fc;">${featureLabel}</strong> requer o plano
          <strong style="color:#fff;">${requiredPlan}</strong> ou superior.
        </p>
        <p style="margin:0 0 24px;font-size:13px;color:rgba(160,200,255,0.45);">
          Seu plano atual: <strong style="color:#6ee7b7;">${planLabel}</strong>
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button onclick="document.getElementById('sp-paywall-modal').remove()" style="
            padding:10px 22px;border-radius:8px;
            border:1px solid rgba(255,255,255,0.15);
            background:transparent;color:rgba(255,255,255,0.55);
            font-size:14px;cursor:pointer;font-family:inherit;
          ">Fechar</button>
          <a href="planos.html" style="
            padding:10px 24px;border-radius:8px;border:none;
            background:linear-gradient(135deg,#6366f1,#8b5cf6);
            color:#fff;font-size:14px;font-weight:600;
            cursor:pointer;text-decoration:none;
            display:inline-flex;align-items:center;gap:6px;
          ">⚡ Ver planos</a>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  // ─── Banner de expiração (planos.html) ───────────────────────────────────────

  function renderExpiredBanner() {
    if (!window.location.search.includes('expired=1')) return;
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const banner = document.createElement('div');
    banner.style.cssText = [
      'display:flex', 'align-items:center', 'gap:14px',
      'padding:18px 24px', 'margin:0 auto 32px',
      'max-width:600px', 'border-radius:14px',
      'background:rgba(239,68,68,0.12)',
      'border:1px solid rgba(239,68,68,0.35)',
      'font-family:"DM Sans",sans-serif', 'color:#fca5a5',
    ].join(';');
    banner.innerHTML = `
      <span style="font-size:28px;">⚠️</span>
      <div>
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#f87171;">
          Seu período de trial expirou!
        </div>
        <div style="font-size:13px;color:rgba(252,165,165,0.7);">
          Escolha um plano abaixo para continuar usando o SoftPrime.
        </div>
      </div>
    `;
    hero.insertAdjacentElement('afterend', banner);
  }

  // ─── Init principal ───────────────────────────────────────────────────────────

  async function init() {
    // Aguarda authManager estar pronto
    let attempts = 0;
    while ((!window.authManager || !window.authManager._initialized) && attempts < 40) {
      await new Promise(r => setTimeout(r, 150));
      attempts++;
    }

    const userId = _getUserId();
    if (!userId) {
      console.log('[PlanGuard] Sem usuário logado — nada a fazer.');
      return;
    }

    await loadPlan();
    enforcePlanGuard();

    // Mostra banner de trial nas páginas do app
    const isApp = ['index.html', 'cadastro.html', 'orcamentos_salvos.html']
      .some(p => window.location.pathname.endsWith(p));
    if (isApp) renderTrialBanner();

    // Mostra banner de expirado na página de planos
    if (window.location.pathname.endsWith('planos.html')) renderExpiredBanner();

    // Substitui PaywallModal do app.js para usar este módulo
    window.PaywallModal = {
      hasAccess: hasAccess,
      open:      openPaywall,
      getCurrentPlan: getActivePlan,
    };

    console.log('[PlanGuard] ✅ Inicializado. Plano:', getActivePlan(), '| Dias trial:', getTrialDaysLeft());
  }

  // ─── Ativar plano pago (chamar após confirmação de pagamento) ────────────────

  async function activatePlan(plan) {
    const validPlans = ['basic', 'pro', 'premium'];
    if (!validPlans.includes(plan)) {
      console.error('[PlanGuard] Plano inválido:', plan);
      return false;
    }

    const sb  = _getSupabase();
    const uid = _getUserId();
    if (!sb || !uid) return false;

    const now     = new Date();
    const planEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    const { error } = await sb.from('user_plans')
      .update({
        plan:       plan,
        plan_start: now.toISOString(),
        plan_end:   planEnd.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', uid);

    if (error) {
      console.error('[PlanGuard] Erro ao ativar plano:', error.message);
      return false;
    }

    if (_planData) _planData.plan = plan;
    _syncLocalStorage(plan);

    // Remove banner de trial
    const banner = document.getElementById('sp-trial-banner');
    if (banner) banner.remove();

    // Atualiza badge na sidebar
    if (window.authManager && typeof window.authManager._renderPlanBadge === 'function') {
      window.authManager._renderPlanBadge();
    }

    console.log('[PlanGuard] ✅ Plano ativado:', plan);
    return true;
  }

  // ─── API pública ──────────────────────────────────────────────────────────────

  window.PlanGuard = {
    init,
    loadPlan,
    activatePlan,
    getActivePlan,
    getPlanLevel,
    isExpired,
    hasAccess,
    getTrialDaysLeft,
    openPaywall,
    renderTrialBanner,
    PLAN_LABELS,
  };

  // Auto-init quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
