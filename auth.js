// auth.js — Sistema de Autenticação com Supabase

class AuthManager {
  constructor() {
    this.supabase = null;
    this.currentUser = null;
    this._initialized = false;
    this.init();
  }

  async init() {
    try {
      let attempts = 0;
      while (typeof window.supabase === 'undefined' && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (typeof window.supabase === 'undefined') {
        console.error('❌ Supabase não está carregado após espera');
        return;
      }

      const url = window.SUPABASE_URL;
      const key = window.SUPABASE_ANON_KEY;

      if (!url || !key) {
        console.error('❌ Credenciais não configuradas.');
        return;
      }

      this.supabase = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });

      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) console.error('❌ Erro ao verificar sessão:', error.message);

      this._initialized = true;
      this._redirecting = false;

      const path = window.location.pathname;
      const isLoginPage = path.endsWith('login.html') || path === '/login' || path === '/login/' || path === '/';
      const isAppPage = path.endsWith('index.html') || path === '/index' || path === '/index/';

      if (session) {
        this.currentUser = session.user;
        if (isLoginPage) {
          // Estava no login com sessão ativa → vai para o app
          this._redirecting = true;
          window.location.replace('/index');
        } else if (isAppPage) {
          // Já está no app → só atualiza UI, sem redirecionar
          this.showApp();
        }
      } else {
        if (isAppPage) {
          // Sem sessão no app → volta para login
          this._redirecting = true;
          window.location.replace('/login');
        }
        // Se já está no login sem sessão → não faz nada
      }

      // Reage apenas a SIGNED_OUT — SIGNED_IN é tratado acima no init
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔔 Auth event:', event);
        if (event === 'SIGNED_OUT') {
          this.currentUser = null;
          this._redirecting = true;
          window.location.replace('/login');
        }
      });

    } catch (error) {
      console.error('❌ Erro ao inicializar auth:', error);
    }
  }

  showAuth() {
    if (this._redirecting) return;
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('login.html') || path === '/login' || path === '/login/' || path === '/';
    if (!isLoginPage) {
      this._redirecting = true;
      window.location.replace('/login');
    }
  }

  showApp() {
    if (this._redirecting) return;
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('login.html') || path === '/login' || path === '/login/' || path === '/';
    const isAppPage = path.endsWith('index.html') || path === '/index' || path === '/index/';

    if (isLoginPage) {
      this._redirecting = true;
      window.location.replace('/index');
      return;
    }

    // Já está no app — só atualiza UI, NUNCA redireciona
    if (!isAppPage) return;

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

    const guard = document.getElementById('auth-guard');
    if (guard) guard.remove();
    if (typeof renderAll === 'function') renderAll();
  }

  async signUp(email, password, username) {
    try {
      if (!this.supabase)
        return { success: false, message: '❌ Sistema não inicializado. Recarregue a página.' };

      if (!username || username.trim().length < 2)
        return { success: false, message: '❌ Nome de usuário deve ter pelo menos 2 caracteres.' };

      const cleanUsername = username.trim();

      // Verifica se username já existe
      const { data: existingUser } = await this.supabase
        .from('profiles').select('id').ilike('username', cleanUsername).maybeSingle();

      if (existingUser)
        return { success: false, message: '❌ Este nome de usuário já está em uso. Escolha outro.' };

      // Cadastra salvando username no metadata do Supabase Auth
      const { data, error } = await this.supabase.auth.signUp({
        email, password,
        options: {
          data: { username: cleanUsername, full_name: cleanUsername, display_name: cleanUsername }
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error('Usuário não foi criado. Tente novamente.');

      console.log('✅ Usuário criado no Auth:', data.user.id);

      // Salva na tabela profiles com até 3 tentativas
      let profileSaved = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise(r => setTimeout(r, attempt * 400));
        const { error: profileError } = await this.supabase
          .from('profiles')
          .upsert({ id: data.user.id, email, username: cleanUsername, full_name: cleanUsername, updated_at: new Date().toISOString() }, { onConflict: 'id' });

        if (!profileError) {
          profileSaved = true;
          console.log(`✅ Perfil salvo (tentativa ${attempt})`);
          break;
        }
        console.warn(`⚠️ Tentativa ${attempt} falhou:`, profileError.message);
      }

      if (!profileSaved)
        console.warn('⚠️ Username salvo apenas no metadata do Auth (tabela profiles indisponível).');

      // Login automático (funciona se "Confirm email" estiver DESATIVADO no Supabase)
      const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({ email, password });

      if (!signInError && signInData?.session) {
        console.log('✅ Login automático após cadastro');

        // Agora com sessão ativa, salva o profile corretamente
        try {
          const uid = signInData.session.user.id;
          const { error: profileError } = await this.supabase
            .from('profiles')
            .upsert({
              id: uid,
              email: email,
              username: cleanUsername,
              full_name: cleanUsername,
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

          if (profileError) {
            console.warn('⚠️ Erro ao salvar profile após login:', profileError.message);
          } else {
            console.log('✅ Profile salvo com sucesso após login automático');
          }
        } catch (e) {
          console.warn('⚠️ Exceção ao salvar profile:', e.message);
        }

        return { success: true, autoLogin: true, message: '✅ Conta criada e login realizado!' };
      }

      return { success: true, autoLogin: false, message: '✅ Conta criada! Faça login agora.' };

    } catch (error) {
      console.error('❌ Erro no cadastro:', error);
      let msg = error.message || 'Erro desconhecido';
      if (msg.includes('Failed to fetch')) msg = 'Erro de conexão. Verifique sua internet.';
      if (msg.includes('User already registered')) msg = 'Este email já está cadastrado.';
      if (msg.includes('Password should be at least')) msg = 'A senha deve ter pelo menos 6 caracteres.';
      return { success: false, message: `❌ ${msg}` };
    }
  }

  async signIn(identifier, password) {
    try {
      if (!this.supabase)
        return { success: false, message: '❌ Sistema não inicializado. Recarregue a página.' };

      let email = identifier.trim();

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
      // Redireciona diretamente para o app após login
      this._redirecting = true;
      window.location.replace('/index');
      return { success: true, message: '✅ Login realizado com sucesso!' };

    } catch (error) {
      console.error('❌ Erro no login:', error);
      let msg = error.message || 'Erro desconhecido';
      if (msg.includes('Invalid login credentials')) msg = 'Email/usuário ou senha incorretos.';
      if (msg.includes('Email not confirmed')) msg = 'Confirme seu email antes de fazer login.';
      if (msg.includes('Failed to fetch')) msg = 'Erro de conexão. Verifique sua internet.';
      return { success: false, message: `❌ ${msg}` };
    }
  }

  async signOut() {
    try {
      await this.supabase.auth.signOut();
      window.location.href = '/login';
      return { success: true };
    } catch (error) {
      return { success: false, message: `❌ ${error.message}` };
    }
  }

  async resetPassword(email) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login.html`
      });
      if (error) throw error;
      return { success: true, message: '✅ Email de recuperação enviado!' };
    } catch (error) {
      return { success: false, message: `❌ ${error.message}` };
    }
  }

  getUserId() { return this.currentUser?.id || null; }
  getUserEmail() { return this.currentUser?.email || null; }
  getSupabase() { return this.supabase; }
  isAuthenticated() { return this.currentUser !== null; }
}

window.authManager = new AuthManager();
console.log('✅ AuthManager carregado');