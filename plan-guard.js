// plan-guard.js — Controle de planos e trial de 7 dias (SoftPrime)
// Fonte de verdade: tabela 'profiles' no Supabase (campo trial_start + plan)
// O localStorage é apenas cache — nunca é a fonte definitiva

(function () {
  'use strict';

  const TRIAL_DAYS     = 7;
  const LS_PLAN_KEY    = 'softprime_plan';
  const LS_TRIAL_KEY   = 'softprime_trial_start';
  const LS_CHECKED_KEY = 'softprime_plan_checked_at';
  const CHECK_TTL      = 5 * 60 * 1000; // revalida do Supabase a cada 5 min

  // Recursos liberados por plano
  const PLAN_FEATURES = {
    free:    [],
    trial:   ['pdf', 'logo', 'word', 'excel', 'export'],
    basic:   [],
    pro:     ['pdf', 'logo'],
    premium: ['pdf', 'logo', 'word', 'excel', 'export'],
  };

  // Mensagens do paywall
  const PAYWALL_MSGS = {
    pdf:    { icon: '📄', title: 'PDF com Logo Personalizada',  subtitle: 'Disponível a partir do plano Intermediário.' },
    word:   { icon: '📝', title: 'Exportação Word (.docx)',      subtitle: 'Exclusivo do plano Premium.' },
    excel:  { icon: '📊', title: 'Exportação Excel (.xlsx)',     subtitle: 'Exclusivo do plano Premium.' },
    export: { icon: '📤', title: 'Exportação Avançada',          subtitle: 'Disponível no plano Premium.' },
    logo:   { icon: '🎨', title: 'Logo Personalizada',           subtitle: 'Disponível a partir do Intermediário.' },
  };

  // Links do Mercado Pago
  const MP_LINKS = {
    basic:   'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=27ebb103fe7f4b79896c1bab3fbba34e',
    pro:     'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=d2e9a9c34db74ea9a5ab9cadcf811171',
    premium: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=47df5b41e79a4ce8aef081c3babd9d3f',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function getSupabaseClient() {
    if (typeof getSupabase === 'function') return getSupabase();
    if (window.authManager?.supabase) return window.authManager.supabase;
    return null;
  }

  function getUserId() {
    if (window.authManager?.currentUser?.id) return window.authManager.currentUser.id;
    return null;
  }

  // Calcula dias restantes de trial a partir de uma data ISO
  function trialDaysLeft(trialStartISO) {
    if (!trialStartISO) return 0;
    const start   = new Date(trialStartISO).getTime();
    const now     = Date.now();
    const elapsed = (now - start) / (1000 * 60 * 60 * 24); // dias
    return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
  }

  function trialExpired(trialStartISO) {
    return trialDaysLeft(trialStartISO) <= 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Núcleo do PlanGuard
  // ─────────────────────────────────────────────────────────────────────────

  window.PlanGuard = {

    _plan: null,         // plano ativo resolvido: 'trial'|'basic'|'pro'|'premium'|'free'
    _trialStart: null,   // data ISO de início do trial
    _ready: false,       // true após primeiro sync com Supabase
    _readyCallbacks: [],

    // ── Inicializa — sincroniza com Supabase ──────────────────────────────
    async init() {
      await this._syncFromSupabase();
      this._ready = true;
      this._readyCallbacks.forEach(fn => fn());
      this._readyCallbacks = [];
      this._applyAccess();
    },

    // Executa callback quando o guard estiver pronto
    onReady(fn) {
      if (this._ready) fn();
      else this._readyCallbacks.push(fn);
    },

    // ── Busca/cria dados de plano no Supabase ────────────────────────────
    async _syncFromSupabase() {
      const sb  = getSupabaseClient();
      const uid = getUserId();

      // Se não há cliente Supabase ou usuário, usa apenas cache local
      if (!sb || !uid) {
        this._loadFromCache();
        return;
      }

      // Revalida do Supabase apenas se o cache local expirou
      const lastCheck = parseInt(localStorage.getItem(LS_CHECKED_KEY) || '0');
      if (Date.now() - lastCheck < CHECK_TTL && localStorage.getItem(LS_PLAN_KEY)) {
        this._loadFromCache();
        return;
      }

      try {
        const { data: profile, error } = await sb
          .from('profiles')
          .select('plan, trial_start')
          .eq('id', uid)
          .single();

        if (error) throw error;

        let plan       = profile?.plan       || null;
        let trialStart = profile?.trial_start || null;

        // Primeira vez sem plano → inicia trial automaticamente
        if (!plan && !trialStart) {
          trialStart = new Date().toISOString();
          plan       = 'trial';
          await sb.from('profiles').update({
            plan:        'trial',
            trial_start: trialStart,
            updated_at:  new Date().toISOString(),
          }).eq('id', uid);
        }

        // Trial expirado e plano ainda é 'trial' → rebaixa para 'free'
        if (plan === 'trial' && trialExpired(trialStart)) {
          plan = 'free';
          await sb.from('profiles').update({
            plan:       'free',
            updated_at: new Date().toISOString(),
          }).eq('id', uid);
        }

        this._plan       = plan || 'free';
        this._trialStart = trialStart;

        // Salva cache local
        localStorage.setItem(LS_PLAN_KEY,    this._plan);
        localStorage.setItem(LS_TRIAL_KEY,   trialStart || '');
        localStorage.setItem(LS_CHECKED_KEY, String(Date.now()));

      } catch (err) {
        console.warn('[PlanGuard] Erro ao sincronizar com Supabase:', err.message);
        this._loadFromCache();
      }
    },

    // Carrega do cache local (fallback offline)
    _loadFromCache() {
      this._plan       = localStorage.getItem(LS_PLAN_KEY)  || 'free';
      this._trialStart = localStorage.getItem(LS_TRIAL_KEY) || null;

      // Verifica trial expirado mesmo offline
      if (this._plan === 'trial' && trialExpired(this._trialStart)) {
        this._plan = 'free';
      }
    },

    // ── API pública ───────────────────────────────────────────────────────

    getActivePlan() {
      return this._plan || 'free';
    },

    hasAccess(feature) {
      const plan = this.getActivePlan();
      return (PLAN_FEATURES[plan] || []).includes(feature);
    },

    getTrialDaysLeft() {
      if (this._plan !== 'trial') return 0;
      return trialDaysLeft(this._trialStart);
    },

    isTrialActive() {
      return this._plan === 'trial';
    },

    isTrialExpired() {
      return this._plan === 'free' && !!this._trialStart;
    },

    // ── Aplica restrições de acesso na UI ────────────────────────────────
    _applyAccess() {
      const plan = this.getActivePlan();

      // Atualiza badge do plano na sidebar (reusa o do auth.js se existir)
      if (window.authManager && typeof window.authManager._renderPlanBadge === 'function') {
        window.authManager._renderPlanBadge();
      }

      // Exibe banner de trial ou trial expirado
      this._renderTrialBanner(plan);
    },

    // Banner topo da tela: dias restantes de trial ou expirado
    _renderTrialBanner(plan) {
      const existing = document.getElementById('sp-trial-banner');
      if (existing) existing.remove();

      const mainContent = document.querySelector('.main-content');
      if (!mainContent) return;

      let html = '';

      if (plan === 'trial') {
        const days = this.getTrialDaysLeft();
        html = `
          <div id="sp-trial-banner" style="
            background:linear-gradient(90deg,#0f5132,#166534);
            color:#fff;padding:9px 20px;display:flex;align-items:center;
            justify-content:space-between;gap:12px;font-size:13px;flex-wrap:wrap;
            border-bottom:1px solid rgba(255,255,255,0.1);">
            <span>🎁 <strong>Trial gratuito:</strong> ${days} dia${days !== 1 ? 's' : ''} restante${days !== 1 ? 's' : ''} — aproveite todos os recursos!</span>
            <a href="/planos" style="background:#fff;color:#166534;padding:5px 14px;border-radius:6px;font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap;">Ver planos →</a>
          </div>`;
      } else if (plan === 'free' && this._trialStart) {
        // Trial expirado — aviso mais urgente
        html = `
          <div id="sp-trial-banner" style="
            background:linear-gradient(90deg,#7f1d1d,#991b1b);
            color:#fff;padding:10px 20px;display:flex;align-items:center;
            justify-content:space-between;gap:12px;font-size:13px;flex-wrap:wrap;
            border-bottom:1px solid rgba(255,255,255,0.15);">
            <span>⚠️ <strong>Seu trial de 7 dias expirou.</strong> Assine um plano para continuar usando o sistema.</span>
            <a href="/planos" style="background:#fbbf24;color:#1a1a1a;padding:6px 16px;border-radius:6px;font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap;">Assinar agora →</a>
          </div>`;
      }

      if (html) {
        mainContent.insertAdjacentHTML('afterbegin', html);
      }
    },

    // ── Paywall ───────────────────────────────────────────────────────────
    openPaywall(feature) {
      const msg = PAYWALL_MSGS[feature] || {
        icon: '🔒', title: 'Recurso Premium',
        subtitle: 'Este recurso requer um plano pago.'
      };

      // Tenta usar o modal existente na página
      const iconEl    = document.getElementById('pw-icon');
      const titleEl   = document.getElementById('pw-title');
      const subEl     = document.getElementById('pw-subtitle');
      const modalEl   = document.getElementById('paywall-modal');

      if (iconEl && titleEl && subEl && modalEl) {
        iconEl.textContent  = msg.icon;
        titleEl.textContent = msg.title;
        subEl.textContent   = msg.subtitle;
        modalEl.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        return;
      }

      // Fallback: modal simples
      const overlay = document.createElement('div');
      overlay.id = 'sp-paywall-fallback';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);padding:20px;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:32px 28px;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="font-size:48px;margin-bottom:12px;">${msg.icon}</div>
          <h3 style="margin:0 0 8px;font-size:18px;color:#1a1a1a;">${msg.title}</h3>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">${msg.subtitle}</p>
          <a href="/planos" style="display:block;background:#0d7de0;color:#fff;padding:13px;border-radius:9px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:10px;">Ver Planos</a>
          <button onclick="document.getElementById('sp-paywall-fallback').remove();document.body.style.overflow='';"
            style="background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer;font-family:inherit;">Cancelar</button>
        </div>`;
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { overlay.remove(); document.body.style.overflow = ''; }
      });
      document.body.appendChild(overlay);
    },

    // ── Ativa plano após pagamento ────────────────────────────────────────
    async activatePlan(planKey) {
      const sb  = getSupabaseClient();
      const uid = getUserId();

      if (sb && uid) {
        await sb.from('profiles').update({
          plan:       planKey,
          updated_at: new Date().toISOString(),
        }).eq('id', uid);
      }

      this._plan = planKey;
      localStorage.setItem(LS_PLAN_KEY,    planKey);
      localStorage.setItem(LS_CHECKED_KEY, String(Date.now()));
      this._applyAccess();
    },

    // Ativa checkout (compatibilidade com código existente)
    checkout(planKey) {
      localStorage.setItem('pendingPlan', planKey);
      window.location.href = MP_LINKS[planKey] || '/planos';
    },
  };

  // ── Verifica retorno do Mercado Pago em qualquer página ────────────────
  (function checkPaymentReturn() {
    const params     = new URLSearchParams(window.location.search);
    const paymentId  = params.get('payment_id') || params.get('collection_id');
    const status     = params.get('status')     || params.get('collection_status');
    const pendingPlan = localStorage.getItem('pendingPlan');

    if ((paymentId || status === 'approved') && pendingPlan) {
      localStorage.removeItem('pendingPlan');
      // Aguarda o guard estar pronto para ativar o plano
      function tryActivate(tries) {
        if (tries > 30) return;
        if (window.PlanGuard && window.PlanGuard._ready) {
          window.PlanGuard.activatePlan(pendingPlan);
        } else {
          setTimeout(() => tryActivate(tries + 1), 200);
        }
      }
      tryActivate(0);
    }
  })();

})();
