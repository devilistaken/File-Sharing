const form = $('#auth-form');
const msg = $('#msg');
const submit = $('#submit');
const pw = $('#password');
let mode = 'login';

// Already signed in? Skip straight to the dashboard.
API.me().then(() => { location.href = 'dashboard.html'; }).catch(() => {});

function setMode(next) {
  mode = next;
  const login = mode === 'login';
  $('#tab-login').setAttribute('aria-selected', login);
  $('#tab-register').setAttribute('aria-selected', !login);
  $('#auth-title').textContent = login ? 'Log in' : 'Create your account';
  $('#auth-sub').textContent = login ? 'Welcome back. Your links are waiting.' : 'It takes ten seconds. Then send your first file.';
  submit.textContent = login ? 'Log in' : 'Create account';
  pw.autocomplete = login ? 'current-password' : 'new-password';
  msg.textContent = '';
}
$('#tab-login').addEventListener('click', () => setMode('login'));
$('#tab-register').addEventListener('click', () => setMode('register'));

$('#pw-toggle').addEventListener('click', (e) => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  e.target.textContent = show ? 'Hide' : 'Show';
  e.target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = ''; msg.className = 'form-msg';
  submit.disabled = true;
  const original = submit.textContent;
  submit.textContent = 'One moment…';
  try {
    await API[mode]($('#email').value, pw.value);
    msg.textContent = 'You are in. Opening your dashboard…';
    msg.className = 'form-msg ok';
    location.href = 'dashboard.html';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'form-msg error';
    submit.disabled = false;
    submit.textContent = original;
  }
});
