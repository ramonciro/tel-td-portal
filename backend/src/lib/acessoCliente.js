/**
 * acessoCliente.js — Pacote 3 (Acesso restrito por cliente, generalizar)
 *
 * O cadastro de usuário (tela /usuarios) já permite vincular uma pessoa a
 * MAIS DE UM "cliente" dentro da mesma empresa (ex.: "SAFRA, CREA") — o
 * campo é um texto livre separado por vírgula, e o frontend já sabe lidar
 * com isso (normalizarClientes() em frontend/app/usuarios/page.js).
 *
 * Até este pacote, todo lugar do backend que checava o cliente do usuário
 * (hoje só o catálogo de Trilhas) comparava `req.user.cliente` como se
 * fosse sempre um valor único (`===`). Para qualquer usuário vinculado a
 * mais de um cliente, essa comparação nunca batia — o efeito prático era
 * só "enxerga menos do que devia" (nunca um vazamento, já que era
 * comparação de igualdade, não substring), mas era um bug real e
 * silencioso, sem nenhum aviso de erro. Este módulo centraliza a lógica
 * certa (multi-valor) para todo lugar do backend que precisar dela daqui
 * pra frente, em vez de cada controller reimplementar a própria versão
 * (e repetir o mesmo bug).
 *
 * Regra de negócio (mesma já usada no catálogo de Trilhas, agora só
 * generalizada): coordenador/supervisor/superintendente (e super_admin)
 * sempre veem tudo — são quem gerencia a operação inteira, não só um
 * cliente. Os demais perfis (treinando, instrutor) só veem/acessam um
 * recurso quando ele não tem cliente definido (recurso "global", visível
 * a todos no tenant) ou quando o cliente do recurso bate com um dos
 * clientes do usuário. Usuário sem nenhum cliente vinculado continua sem
 * nenhuma restrição (comportamento de antes deste pacote, preservado de
 * propósito para não quebrar contas já cadastradas sem esse campo).
 */

const PERFIS_GESTORES = ["coordenador", "supervisor", "superintendente"];

function normalizarClientes(valor) {
  if (!valor) return [];
  return String(valor)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isGestor(req) {
  const perfil = String(req.user?.perfil || "").toLowerCase().trim();
  return PERFIS_GESTORES.includes(perfil) || perfil === "super_admin";
}

/**
 * True se o usuário da requisição pode acessar um recurso que tem o valor
 * de cliente informado (ex.: trilha.cliente, treinamento.cliente,
 * biblioteca.cliente). `clienteRecurso` é sempre um único valor (coluna do
 * recurso); quem tem múltiplos clientes é o usuário, nunca o recurso.
 */
function usuarioTemAcessoAoCliente(req, clienteRecurso) {
  if (isGestor(req)) return true;

  const valorRecurso = String(clienteRecurso || "").trim();
  if (!valorRecurso) return true; // recurso global — visível a todo o tenant

  const clientesUsuario = normalizarClientes(req.user?.cliente).map((c) =>
    c.toLowerCase()
  );
  if (!clientesUsuario.length) return true; // usuário sem cliente vinculado = sem restrição

  return clientesUsuario.includes(valorRecurso.toLowerCase());
}

/**
 * Fragmento SQL + params para recortar uma listagem pelo(s) cliente(s) do
 * usuário logado. Devolve `null` quando não há restrição a aplicar
 * (gestor, ou usuário sem cliente vinculado) — quem chama simplesmente não
 * usa filtro nenhum nesse caso, herdando o comportamento de antes.
 *
 * `permitirGlobal` (padrão true) inclui linhas com cliente NULL/vazio no
 * resultado — use `false` para tabelas onde a coluna cliente é NOT NULL
 * (ex.: treinamentos), onde essa condição nunca é verdadeira mas também
 * não atrapalha.
 */
function filtroClientesSQL(req, coluna = "cliente") {
  if (isGestor(req)) return null;

  const clientesUsuario = normalizarClientes(req.user?.cliente);
  if (!clientesUsuario.length) return null;

  const placeholders = clientesUsuario.map(() => "?").join(", ");
  return {
    sql: `(${coluna} IS NULL OR ${coluna} = '' OR LOWER(${coluna}) IN (${placeholders}))`,
    params: clientesUsuario.map((c) => c.toLowerCase()),
  };
}

module.exports = {
  normalizarClientes,
  isGestor,
  usuarioTemAcessoAoCliente,
  filtroClientesSQL,
};
