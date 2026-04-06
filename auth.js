// auth.js — Autenticação Supabase (versão estável com .html)

class AuthManager {
  constructor() {
    this.supabase = null;
    this.currentUser = null;
    this._initialized = false;
    this._redirecting = false;
    this.init();
  }

  async init() {
    try {
      // Aguarda SDK do Supabase carregar
      let attempts = 0;
      while (typeof window.supabase === 'undefined' && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (typeof window.supabase === 'undefined') {
        console.error('❌ Supabase SDK não carregado');
        this._removeGuard();
        return;
      }

      const url = window.SUPABASE_URL;
      const key = window.SUPABASE_ANON_KEY;

      if (!url || !key) {
        console.error('❌ Credenciais Supabase não configuradas');
        this._removeGuard();
        return;
      }

      this.supabase = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });

      // Verifica sessão UMA ÚNICA VEZ
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) console.error('❌ Erro ao obter sessão:', error.message);

      this._initialized = true;

      const isLoginPage = this._isLoginPage();
      const isAppPage   = this._isAppPage();

      if (session) {
        this.currentUser = session.user;
        console.log('✅ Sessão ativa:', this.currentUser.email);

        if (isLoginPage) {
          // Estava no login com sessão → vai para o app
          this._redirecting = true;
          window.location.replace('/index');
          return;
        }

        if (isAppPage) {
          // Já no app → remove guard e atualiza UI
          this._updateAppUI();
        }

      } else {
        console.log('ℹ️ Sem sessão ativa');

        if (isAppPage) {
          // No app sem sessão → vai para login
          this._redirecting = true;
          window.location.replace('/login');
          return;
        }

        // Já está no login sem sessão → só remove guard
        this._removeGuard();
      }

      // Listener MÍNIMO — só SIGNED_OUT e TOKEN_REFRESHED
      // NÃO reagir a SIGNED_IN evita o loop de redirect
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔔 Auth event:', event);

        // INITIAL_SESSION: sessão já existia (ex: voltou de outra aba/dispositivo)
        // Só age se ainda não inicializamos a UI (evita dupla chamada com o getSession acima)
        if (event === 'INITIAL_SESSION' && session && this._isAppPage() && !this._redirecting) {
          if (!this.currentUser) {
            this.currentUser = session.user;
            this._updateAppUI();
          }
        }

        if (event === 'SIGNED_IN' && session && !this._redirecting) {
          this.currentUser = session.user;
          if (this._isLoginPage()) {
            this._redirecting = true;
            window.location.replace('/index');
          }
        }

        if (event === 'SIGNED_OUT') {
          this.currentUser = null;
          if (!this._redirecting) {
            this._redirecting = true;
            window.location.replace('/login');
          }
        }

        if (event === 'TOKEN_REFRESHED' && session) {
          this.currentUser = session.user;
        }
      });

    } catch (err) {
      console.error('❌ Erro no init do AuthManager:', err);
      this._removeGuard();
    }
  }

  // ── Helpers de rota ───────────────────────────────────────────

  _isLoginPage() {
    const p = window.location.pathname;
    return p.endsWith('login.html') || p === '/login' || p === '/login/';
  }

  _isPlanosPage() {
    const p = window.location.pathname;
    return p.endsWith('planos.html') || p === '/planos' || p === '/planos/';
  }

  _isAppPage() {
    const p = window.location.pathname;
    // Reconhece as 3 páginas do app: início, cadastro e orçamentos salvos
    return p.endsWith('index.html')
        || p.endsWith('cadastro.html')
        || p.endsWith('orcamentos_salvos.html')
        || p === '/' || p === '' || p === '/index' || p === '/index/'
        || p === '/cadastro' || p === '/cadastro/'
        || p === '/orcamentos_salvos' || p === '/orcamentos_salvos/';
  }

  // Retorna o plano atual do usuário (lido do localStorage)
  getUserPlan() {
    return localStorage.getItem('softprime_plan') || null;
  }

  // Retorna label legível do plano
  getUserPlanLabel() {
    const map = { basic: 'Básico', pro: 'Intermediário', premium: 'Premium' };
    return map[this.getUserPlan()] || null;
  }

  // ── Remove a tela de bloqueio ──────────────────────────────────

  _removeGuard() {
    const guard = document.getElementById('auth-guard');
    if (guard) guard.remove();
  }

  // ── Atualiza UI do app ─────────────────────────────────────────

  _updateAppUI() {
    // Remove guard imediatamente — libera a tela
    this._removeGuard();

    // Inicializa verificação de plano/trial
    if (window.PlanGuard) window.PlanGuard.init();

    // Injeta badge do plano na sidebar (desktop e mobile)
    this._renderPlanBadge();

    const userNameEl = document.getElementById('userName');
    if (userNameEl && this.currentUser) {
      this.supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', this.currentUser.id)
        .single()
        .then(({ data: profile }) => {
          userNameEl.textContent =
            profile?.username ||
            profile?.full_name ||
            this.currentUser.user_metadata?.username ||
            this.currentUser.user_metadata?.full_name ||
            this.currentUser.email.split('@')[0];
        })
        .catch(() => {
          userNameEl.textContent =
            this.currentUser.user_metadata?.username ||
            this.currentUser.user_metadata?.full_name ||
            this.currentUser.email.split('@')[0];
        });
    }

    // Chama initApp do app.js agora que temos sessão confirmada
    if (typeof initApp === 'function') {
      initApp();
    }
  }

  // Aliases para compatibilidade com código legado
  showApp()  { this._updateAppUI(); }
  showAuth() {
    if (!this._redirecting && !this._isLoginPage()) {
      this._redirecting = true;
      window.location.replace('/login');
    }
  }

  // ── Sign Up ────────────────────────────────────────────────────

  async signUp(email, password, username) {
    try {
      if (!this.supabase)
        return { success: false, message: '❌ Sistema não inicializado. Recarregue a página.' };

      if (!username || username.trim().length < 2)
        return { success: false, message: '❌ Nome de usuário deve ter pelo menos 2 caracteres.' };

      const cleanUsername = username.trim();

      const { data: existing } = await this.supabase
        .from('profiles').select('id').ilike('username', cleanUsername).maybeSingle();
      if (existing)
        return { success: false, message: '❌ Este nome de usuário já está em uso. Escolha outro.' };

      const { data, error } = await this.supabase.auth.signUp({
        email, password,
        options: { data: { username: cleanUsername, full_name: cleanUsername, display_name: cleanUsername } }
      });

      if (error) throw error;
      if (!data.user) throw new Error('Usuário não foi criado. Tente novamente.');

      console.log('✅ Auth user criado:', data.user.id);

      // Login automático (requer "Confirm email" DESATIVADO no Supabase)
      const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({ email, password });

      if (!signInError && signInData?.session) {
        console.log('✅ Login automático após cadastro');
        const uid = signInData.session.user.id;

        try {
          await this.supabase.from('profiles').upsert({
            id: uid, email, username: cleanUsername, full_name: cleanUsername,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
          console.log('✅ Profile salvo');
        } catch (e) {
          console.warn('⚠️ Erro ao salvar profile:', e.message);
        }

        this._redirecting = true;
        window.location.replace('/index');
        return { success: true, autoLogin: true, message: '✅ Conta criada e login realizado!' };
      }

      return { success: true, autoLogin: false, message: '✅ Conta criada! Faça login agora.' };

    } catch (err) {
      console.error('❌ Erro no cadastro:', err);
      let msg = err.message || 'Erro desconhecido';
      if (msg.includes('Failed to fetch'))                    msg = 'Erro de conexão. Verifique sua internet.';
      if (msg.includes('User already registered'))            msg = 'Este email já está cadastrado.';
      if (msg.includes('Password should be at least'))        msg = 'A senha deve ter pelo menos 6 caracteres.';
      if (msg.includes('Password should contain'))            msg = 'A senha deve conter letras maiúsculas, minúsculas, números e um caractere especial (ex: Senha@123).';
      if (msg.includes('should contain at least one'))        msg = 'A senha deve conter letras maiúsculas, minúsculas, números e um caractere especial (ex: Senha@123).';
      if (msg.includes('weak'))                               msg = 'Senha muito fraca. Use letras maiúsculas, minúsculas, números e caractere especial.';
      if (msg.includes('rate limit'))                         msg = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
      if (msg.includes('Email address') && msg.includes('invalid')) msg = 'Endereço de email inválido.';
      return { success: false, message: `❌ ${msg}` };
    }
  }

  // ── Sign In ────────────────────────────────────────────────────

  async signIn(identifier, password) {
    try {
      if (!this.supabase)
        return { success: false, message: '❌ Sistema não inicializado. Recarregue a página.' };

      let email = identifier.trim();

      // Suporte a login por username
      if (!email.includes('@')) {
        console.log('🔄 Buscando email por username:', email);
        const { data: profile, error: profileError } = await this.supabase
          .from('profiles').select('email').ilike('username', email).maybeSingle();

        if (profileError) console.error('❌ Erro ao buscar perfil:', profileError.message);
        if (!profile?.email)
          return { success: false, message: '❌ Usuário não encontrado. Verifique seu email ou nome de usuário.' };

        email = profile.email;
      }

      const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      console.log('✅ Login realizado');
      this.currentUser = data.user;

      this._redirecting = true;
      window.location.replace('/index');
      return { success: true, message: '✅ Login realizado com sucesso!' };

    } catch (err) {
      console.error('❌ Erro no login:', err);
      let msg = err.message || 'Erro desconhecido';
      if (msg.includes('Invalid login credentials'))          msg = 'Email/usuário ou senha incorretos.';
      if (msg.includes('Email not confirmed'))                msg = 'Confirme seu email antes de fazer login.';
      if (msg.includes('Failed to fetch'))                    msg = 'Erro de conexão. Verifique sua internet.';
      if (msg.includes('rate limit'))                         msg = 'Muitas tentativas. Aguarde alguns minutos.';
      if (msg.includes('User not found'))                     msg = 'Usuário não encontrado.';
      if (msg.includes('too many requests'))                  msg = 'Muitas tentativas. Tente novamente em alguns minutos.';
      return { success: false, message: `❌ ${msg}` };
    }
  }

  // ── Sign Out ───────────────────────────────────────────────────

  async signOut() {
    try {
      if (!this.supabase) return { success: false, message: '❌ Sistema não inicializado.' };
      await this.supabase.auth.signOut();
      // O listener SIGNED_OUT cuida do redirect
      return { success: true };
    } catch (err) {
      return { success: false, message: `❌ ${err.message}` };
    }
  }

  // ── Reset Password ─────────────────────────────────────────────

  async resetPassword(email) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
      });
      if (error) throw error;
      return { success: true, message: '✅ Email de recuperação enviado!' };
    } catch (err) {
      return { success: false, message: `❌ ${err.message}` };
    }
  }

  // ── Plan Badge na Sidebar ─────────────────────────────────────

  _renderPlanBadge() {
    const plan = this.getUserPlan();
    const planLabel = this.getUserPlanLabel();

    // Configurações visuais por plano
    const planConfig = {
      basic:   { label: 'Básico',        color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.25)',  icon: '📄' },
      pro:     { label: 'Intermediário', color: '#34d399', bg: 'rgba(52,211,153,0.12)',   border: 'rgba(52,211,153,0.25)',  icon: '🚀' },
      premium: { label: 'Premium',       color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   border: 'rgba(251,191,36,0.25)',  icon: '👑' },
    };

    const cfg = plan ? planConfig[plan] : null;

    // Monta o HTML do badge
    const badgeHtml = cfg
      ? `<a href="/planos" class="sidebar-plan-badge" title="Meu plano: ${cfg.label}" style="
            display:flex;align-items:center;gap:11px;
            width:100%;padding:10px 12px;margin:0 0 2px;
            border-radius:8px;border:1px solid transparent;
            background:transparent;text-decoration:none;
            box-sizing:border-box;transition:all 0.2s;cursor:pointer;
          "
          onmouseover="this.style.background='${cfg.bg}';this.style.borderColor='${cfg.border}';"
          onmouseout="this.style.background='transparent';this.style.borderColor='transparent';">
          <span style="font-size:17px;width:22px;text-align:center;flex-shrink:0;line-height:1;">${cfg.icon}</span>
          <div style="flex:1;min-width:0;line-height:1.2;">
            <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;line-height:1;">Plano ativo</div>
            <div style="font-size:13px;font-weight:600;color:${cfg.color};margin-top:2px;line-height:1;">${cfg.label}</div>
          </div>
          <span style="font-size:10px;color:rgba(255,255,255,0.3);flex-shrink:0;">›</span>
        </a>`
      : `<a href="/planos" class="sidebar-plan-badge" title="Escolha um plano" style="
            display:flex;align-items:center;gap:11px;
            width:100%;padding:10px 12px;margin:0 0 2px;
            border-radius:8px;border:1px solid transparent;
            background:transparent;text-decoration:none;
            box-sizing:border-box;transition:all 0.2s;cursor:pointer;
          "
          onmouseover="this.style.background='rgba(251,191,36,0.08)';this.style.borderColor='rgba(251,191,36,0.35)';"
          onmouseout="this.style.background='transparent';this.style.borderColor='transparent';">
          <span style="font-size:17px;width:22px;text-align:center;flex-shrink:0;line-height:1;">⚡</span>
          <div style="flex:1;min-width:0;line-height:1.2;">
            <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;line-height:1;">Sem plano</div>
            <div style="font-size:12px;font-weight:600;color:#fbbf24;margin-top:2px;line-height:1;">Ver planos →</div>
          </div>
        </a>`;

    // Insere antes do primeiro sidebar-btn da nav (desktop)
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
      // Remove badge anterior se existir
      const old = sidebarNav.querySelector('.sidebar-plan-badge');
      if (old) old.remove();

      // Insere após o label "Menu"
      const label = sidebarNav.querySelector('.sidebar-section-label');
      if (label) {
        label.insertAdjacentHTML('afterend', badgeHtml);
      } else {
        sidebarNav.insertAdjacentHTML('afterbegin', badgeHtml);
      }
    }

    // Nota: o badge de plano não é exibido no menu mobile (já aparece no topo do menu desktop)
  }

  // ── Getters ────────────────────────────────────────────────────

  getUserId()       { return this.currentUser?.id    || null; }
  getUserEmail()    { return this.currentUser?.email || null; }
  getSupabase()     { return this.supabase; }
  isAuthenticated() { return this.currentUser !== null; }
}

window.authManager = new AuthManager();
console.log('✅ AuthManager carregado');