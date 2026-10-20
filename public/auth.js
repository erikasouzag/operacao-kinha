
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
    button.dataset.originalText ??= button.textContent;
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

// Manter a tela de acesso sincronizada com a sessão
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    showAuthView('update');
    return;
  }

  if (session?.user) {
    authScreen.hidden = true;
  } else {
    authScreen.hidden = false;
    showAuthView('login');
  }
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
