
const authScreen = document.getElementById('authScreen');
const authMessage = document.getElementById('authMessage');
const toggleLoginPassword = document.getElementById('toggleLoginPassword');
const loginPassword = document.getElementById('loginPassword');

if (toggleLoginPassword && loginPassword) {
  toggleLoginPassword.addEventListener('click', () => {
    const showing = loginPassword.type === 'password';

    loginPassword.type = showing ? 'text' : 'password';
    toggleLoginPassword.textContent = showing ? 'Ocultar' : 'Mostrar';
    toggleLoginPassword.setAttribute(
      'aria-label',
      showing ? 'Ocultar senha' : 'Mostrar senha'
    );
    toggleLoginPassword.setAttribute('aria-pressed', String(showing));
  });
}
const authViews = {
  login: document.getElementById('authLoginView'),
  signup: document.getElementById('authSignupView'),
  recovery: document.getElementById('authRecoveryView'),
  update: document.getElementById('authUpdateView')
};

function showAuthView(view) {
  Object.values(authViews).forEach(element => {
    element.hidden = true;
  });

  authViews[view].hidden = false;
  authScreen.hidden = false;
  authMessage.className = 'auth-message';
  authMessage.textContent = '';
}

function showAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.className = 'auth-message visible';

  if (isError) {
    authMessage.classList.add('error');
  }
}

function setFormLoading(form, loading) {
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = loading;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.textContent = loading
      ? 'AGUARDE...'
      : button.dataset.originalText;
  }
}

document.querySelectorAll('[data-auth-view]').forEach(button => {
  button.addEventListener('click', () => {
    showAuthView(button.dataset.authView);
  });
});

// Cadastro
document.getElementById('signupForm').addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  setFormLoading(form, true);

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;

    if (data.session) {
      showAuthMessage('Conta criada com sucesso!');
    } else {
      showAuthMessage(
        'Cadastro iniciado! Confira seu e-mail para confirmar a conta antes de entrar.'
      );
    }
  } catch (error) {
    showAuthMessage(
      error.message || 'Não foi possível criar a conta.',
      true
    );
  } finally {
    setFormLoading(form, false);
  }
});

// Login
document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  setFormLoading(form, true);

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
  } catch (error) {
    showAuthMessage(
      error.message || 'Não foi possível entrar. Confira seus dados.',
      true
    );
  } finally {
    setFormLoading(form, false);
  }
});

// Recuperação de senha
document.getElementById('recoveryForm').addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const email = document.getElementById('recoveryEmail').value.trim();

  setFormLoading(form, true);

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) throw error;

    showAuthMessage(
      'Se o endereço estiver cadastrado, você receberá um e-mail com as instruções para redefinir a senha.'
    );
  } catch (error) {
    showAuthMessage(
      error.message || 'Não foi possível enviar o e-mail de recuperação.',
      true
    );
  } finally {
    setFormLoading(form, false);
  }
});

// Salvar nova senha
document.getElementById('updatePasswordForm').addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const password = document.getElementById('newPassword').value;

  setFormLoading(form, true);

  try {
    const { error } = await supabaseClient.auth.updateUser({
      password
    });

    if (error) throw error;

    await supabaseClient.auth.signOut();

    showAuthView('login');
    showAuthMessage('Senha atualizada! Entre com sua nova senha.');
    document.getElementById('loginPassword').value = '';
  } catch (error) {
    showAuthMessage(
      error.message || 'Não foi possível atualizar a senha.',
      true
    );
  } finally {
    setFormLoading(form, false);
  }
});

// Controle de acesso e painel administrativo
let accessCheckVersion = 0;
let currentAccessRole = null;

function showBlockedAccess(status) {
  Object.values(authViews).forEach(element => {
    if (element) element.hidden = true;
  });

  authScreen.hidden = false;

  const card = authScreen.querySelector('.auth-card');
  let box = document.getElementById('accessStatusPanel');

  if (!box) {
    box = document.createElement('div');
    box.id = 'accessStatusPanel';
    card.appendChild(box);
  }

  box.hidden = false;
  box.style.cssText = 'padding:20px 0;color:inherit';
  box.replaceChildren();

  const title = document.createElement('h2');
  title.textContent = status === 'rejected'
    ? 'Acesso não autorizado'
    : 'Cadastro aguardando aprovação';

  const description = document.createElement('p');
  description.textContent = status === 'rejected'
    ? 'Seu cadastro não foi aprovado. Entre em contato com a administração.'
    : 'Sua conta foi criada, mas você precisa aguardar a aprovação da administradora para acessar a área de estudos.';

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Verificar novamente';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData.session) {
        await checkAccountAccess(sessionData.session);
      }
    } finally {
      refresh.disabled = false;
    }
  });

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.textContent = 'Sair da conta';
  logout.style.marginLeft = '8px';
  logout.addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) showAuthMessage(error.message, true);
  });

  box.append(title, description, refresh, logout);
  const message = document.getElementById('authMessage');
  if (message) message.hidden = true;
}

function closeAccessStatus() {
  const box = document.getElementById('accessStatusPanel');
  if (box) box.hidden = true;

  const message = document.getElementById('authMessage');
  if (message) message.hidden = false;
}

async function checkAccountAccess(session) {
  const version = ++accessCheckVersion;

  if (!session?.user) {
    currentAccessRole = null;
    const button = document.getElementById('adminAccessBtn');
    if (button) button.hidden = true;
    authScreen.hidden = false;
    closeAccessStatus();
    showAuthView('login');
    return;
  }

  // Mantém a tela de bloqueio visível enquanto consulta o banco.
  authScreen.hidden = false;

  const { data: access, error } = await supabaseClient
    .from('user_access')
    .select('status, role')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (version !== accessCheckVersion) return;

  if (error || !access) {
    currentAccessRole = null;
    showBlockedAccess('pending');
    const box = document.getElementById('accessStatusPanel');
    if (box) {
      const detail = document.createElement('p');
      detail.textContent = error
        ? 'Não foi possível confirmar a aprovação. Verifique sua conexão e tente novamente.'
        : 'Cadastro ainda não localizado. Entre em contato com a administradora.';
      box.appendChild(detail);
    }
    console.error('Não foi possível verificar a aprovação:', error?.message);
    return;
  }

  if (access.status !== 'approved') {
    currentAccessRole = null;
    showBlockedAccess(access.status === 'rejected' ? 'rejected' : 'pending');
    return;
  }

  currentAccessRole = access.role;
  closeAccessStatus();
  authScreen.hidden = true;

  const button = document.getElementById('adminAccessBtn');
  if (button) button.hidden = access.role !== 'admin';
}

function createAdminPanel() {
  if (document.getElementById('adminAccessBtn')) return;

  const header = document.getElementById('logoutBtn')?.parentElement;
  if (!header) return;

  const button = document.createElement('button');
  button.id = 'adminAccessBtn';
  button.type = 'button';
  button.className = 'header-action';
  button.textContent = 'Cadastros'; button.title = 'Aprovar cadastros';
  button.hidden = true;
  button.addEventListener('click', openAdminPanel);
  header.insertBefore(button, document.getElementById('logoutBtn'));

  const panel = document.createElement('section');
  panel.id = 'adminAccessOverlay';
  panel.hidden = true;
  panel.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.88);overflow:auto;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:850px;margin:30px auto;padding:24px;background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:14px;';

  const heading = document.createElement('h2');
  heading.textContent = 'Administração de cadastros';

  const description = document.createElement('p');
  description.textContent = 'Aprove ou rejeite os pedidos de acesso à Operação Kinha.';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fechar painel';
  close.addEventListener('click', () => { panel.hidden = true; });

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Atualizar lista';
  refresh.style.marginLeft = '8px';
  refresh.addEventListener('click', loadAdminAccounts);

  const list = document.createElement('div');
  list.id = 'adminAccessList';
  list.style.marginTop = '20px';

  card.append(heading, description, close, refresh, list);
  panel.appendChild(card);
  document.body.appendChild(panel);
}

async function openAdminPanel() {
  if (currentAccessRole !== 'admin') return;

  const panel = document.getElementById('adminAccessOverlay');
  if (!panel) return;

  panel.hidden = false;
  await loadAdminAccounts();
}

async function loadAdminAccounts() {
  if (currentAccessRole !== 'admin') return;

  const list = document.getElementById('adminAccessList');
  list.textContent = 'Carregando cadastros...';

  const { data: accounts, error } = await supabaseClient
    .from('user_access')
    .select('user_id, email, status, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    list.textContent = 'Erro ao carregar: ' + error.message;
    return;
  }

  list.replaceChildren();

  if (!accounts?.length) {
    list.textContent = 'Nenhum cadastro encontrado.';
    return;
  }

  accounts.forEach(account => {
    const row = document.createElement('article');
    row.style.cssText = 'padding:16px 0;border-bottom:1px solid #374151;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;';

    const info = document.createElement('div');
    const email = document.createElement('strong');
    email.textContent = account.email || 'E-mail não informado';

    const status = document.createElement('p');
    status.textContent = 'Status: ' + account.status + ' · Perfil: ' + account.role;
    status.style.margin = '6px 0 0';

    info.append(email, status);
    row.appendChild(info);

    if (account.role !== 'admin') {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

      if (account.status !== 'approved') {
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.textContent = 'Aprovar';
        approve.addEventListener('click', () => updateAccountStatus(account.user_id, 'approved'));
        actions.appendChild(approve);
      }

      if (account.status !== 'rejected') {
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.textContent = 'Rejeitar';
        reject.addEventListener('click', () => updateAccountStatus(account.user_id, 'rejected'));
        actions.appendChild(reject);
      }

      row.appendChild(actions);
    }

    list.appendChild(row);
  });
}

async function updateAccountStatus(userId, status) {
  if (currentAccessRole !== 'admin') return;

  const action = status === 'approved' ? 'aprovar' : 'rejeitar';
  if (!confirm('Confirma ' + action + ' este cadastro?')) return;

  const { error } = await supabaseClient
    .from('user_access')
    .update({ status })
    .eq('user_id', userId);

  if (error) {
    alert('Não foi possível atualizar o cadastro: ' + error.message);
    return;
  }

  await loadAdminAccounts();
}

createAdminPanel();

// Não executar consultas de rede diretamente dentro do callback de auth.
supabaseClient.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') {
      showAuthView('update');
      return;
    }
    checkAccountAccess(session);
  }, 0);
});
/* ===== SAIR DA CONTA ===== */


const logoutButton = document.getElementById('logoutBtn');

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = 'SAINDO...';

    try {
      const { error } = await supabaseClient.auth.signOut();

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao sair da conta:', error);
      alert('Não foi possível sair da conta. Tente novamente.');
    } finally {
      logoutButton.disabled = false;
      logoutButton.textContent = 'Sair da conta';
    }
  });
}
