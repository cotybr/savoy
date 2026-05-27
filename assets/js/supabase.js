// 1. Inicialização
const { createClient } = supabase;
const db = createClient(
  'https://vrzdgwzzqxdinnijydhg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyemRnd3p6cXhkaW5uaWp5ZGhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDE1OTAsImV4cCI6MjA5MTg3NzU5MH0.64kRIoCtJDtT8svA9lsXBCSHs_PQEcNRNTEe8EbVGmc'
);

// 2. Funções de Interface (Declaradas antes para garantir que existam)
function exibirConteudo() {
    console.log("Exibindo conteúdo protegido...");
    const loginContainer = document.getElementById('login-container');
    const conteudoProtegido = document.getElementById('conteudo-protegido');
    const loader = document.getElementById('loader');

    if (loginContainer) loginContainer.style.display = 'none';
    if (conteudoProtegido) conteudoProtegido.style.display = 'block';
    if (loader) loader.style.display = 'none';
}

async function logout() {
    await db.auth.signOut();
    window.location.reload();
}

// 3. Função de Login
async function login() {
    const emailInput = document.getElementById('email');
    const senhaInput = document.getElementById('senha');
    const erroTxt = document.getElementById('login-erro');

    if (!emailInput || !senhaInput) {
        console.error("Elementos de input não encontrados!");
        return;
    }

    const email = emailInput.value.trim();
    const password = senhaInput.value;

    console.log("Tentando login..."); 

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            erroTxt.style.display = 'block';
            erroTxt.innerText = "Acesso negado: " + error.message;
        } else if (data.user) {
            console.log("Sucesso!");
            exibirConteudo();
        }
    } catch (err) {
        console.error("Erro no processo de login:", err);
    }
}

// 4. Verificação ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { session } } = await db.auth.getSession();
        
        if (session) {
            exibirConteudo();
        } else {
            const loader = document.getElementById('loader');
            const loginContainer = document.getElementById('login-container');
            if (loader) loader.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'none';
        }
    } catch (e) {
        console.error("Erro ao verificar sessão:", e);
    }
});
