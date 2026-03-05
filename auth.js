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
      // Aguarda o supabase carregar
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
        console.error('❌ Credenciais não configuradas. URL:', url, 'KEY:', key ? 'OK' : 'VAZIA');
        return;
      }

      console.log('🔄 Inicializando Supabase com URL:', url);

      this.supabase = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      const { data: { session }, error } = await this.supabase.auth.getSession();

      if (error) {
        console.error('❌ Erro ao verificar sessão:', error.message);
      }

      this._initialized = true;

      if (session) {
        console.log('✅ Usuário já logado:', session.user.email);
        this.currentUser = session.user;
        this.showApp();
      } else {
        console.log('ℹ️ Nenhum usuário logado');
        this.showAuth();
      }

      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔔 Auth event:', event);
        if (session) {
          this.currentUser = session.user;
          this.showApp();
        } else {
          this.currentUser = null;
          this.showAuth();
        }
      });

    } catch (error) {
      console.error('❌ Erro ao inicializar auth:', error);
    }
  }

  showAuth() {
    if (!window.location.pathname.endsWith('login.html') && window.location.pathname !== '/login.html') {
      console.log('🔐 Redirecionando para login...');
      window.location.href = 'login.html';
    }
  }

  showApp() {
    if (window.location.pathname.endsWith('login.html') || window.location.pathname === '/login.html') {
      console.log('✅ Redirecionando para o app...');
      window.location.href = 'index.html';
      return;
    }

    const userNameEl = document.getElementById('userName');
    if (userNameEl && this.currentUser) {
      // Buscar username do perfil
      this.supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', this.currentUser.id)
        .single()
        .then(({ data: profile }) => {
          const displayName = profile?.username || profile?.full_name ||
                              this.currentUser.email.split('@')[0];
          userNameEl.textContent = displayName;
        })
        .catch(() => {
          userNameEl.textContent = this.currentUser.email.split('@')[0];
        });
    }

    if (typeof renderAll === 'function') {
      console.log('🔄 Carregando dados do usuário...');
      renderAll();
    }

    console.log('✅ App carregado para:', this.currentUser?.email);
  }

  async signUp(email, password, username) {
    try {
      if (!this.supabase) {
        return { success: false, message: '❌ Sistema não inicializado. Recarregue a página.' };
      }

      // Validar formato do username
      if (!username || username.length < 3) {
        return { success: false, message: '❌ Nome de usuário deve ter pelo menos 3 caracteres.' };
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { success: false, message: '❌ Nome de usuário pode conter apenas letras, números e _' };
      }

      // Verificar se username já existe
      const { data: existingUser } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        return { success: false, message: '❌ Este nome de usuário já está em uso. Escolha outro.' };
      }

      console.log('🔄 Cadastrando usuário:', email);

      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: username.toLowerCase() }
        }
      });

      if (error) throw error;

      // Salvar username na tabela de perfis
      if (data.user) {
        const { error: profileError } = await this.supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email,
            username: username.toLowerCase(),
            updated_at: new Date().toISOString()
          });
        if (profileError) {
          console.error('❌ Erro ao salvar perfil:', profileError.message);
        }
      }

      console.log('✅ Cadastro realizado');
      return {
        success: true,
        message: '✅ Conta criada! Você já pode fazer login.'
      };

    } catch (error) {
      console.error('❌ Erro no cadastro:', error);
      let msg = error.message || 'Erro desconhecido';
      if (msg.includes('Failed to fetch')) msg = 'Erro de conexão. Verifique sua internet.';
      if (msg.includes('User already registered')) msg = 'Este email já está cadastrado.';
      return { success: false, message: `❌ ${msg}` };
    }
  }

  async signIn(identifier, password) {
    try {
      if (!this.supabase) {
        return { success: false, message: '❌ Sistema não inicializado. Recarregue a página.' };
      }

      let email = identifier;

      // Se não contém '@', trata como username e busca o email correspondente
      if (!identifier.includes('@')) {
        console.log('🔄 Buscando email por username:', identifier.toLowerCase());
        const { data: profile, error: profileError } = await this.supabase
          .from('profiles')
          .select('email')
          .eq('username', identifier.toLowerCase())
          .maybeSingle();

        if (profileError) {
          console.error('❌ Erro ao buscar perfil:', profileError.message);
        }

        if (!profile) {
          return { success: false, message: '❌ Usuário não encontrado. Verifique seu email ou nome de usuário.' };
        }

        email = profile.email;
      }

      console.log('🔄 Fazendo login:', email);

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      console.log('✅ Login realizado');
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
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      window.location.href = 'login.html';
      return { success: true, message: '✅ Você saiu com sucesso!' };
    } catch (error) {
      console.error('❌ Erro no logout:', error);
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
      console.error('❌ Erro ao recuperar senha:', error);
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