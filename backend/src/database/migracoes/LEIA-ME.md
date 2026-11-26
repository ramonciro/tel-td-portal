# Migrações numeradas

**Regra:** toda mudança de banco NOVA entra aqui, em um arquivo novo. Não edite o `../migrate.js` (o "legado") para mudanças novas.

## Como criar
1. Crie `NNNN_o_que_faz.js` com o próximo número (4 dígitos) e nome em minúsculas, números e `_`. Ex.: `0002_coluna_observacao_turma.js`.
2. Conteúdo:

```js
module.exports = {
  descricao: "Frase curta do que muda",
  async up({ pool }) {
    await pool.query("ALTER TABLE treinamentos ADD COLUMN observacao VARCHAR(300) NULL");
  },
};
```

## Regras
- Cada migração roda **uma única vez** e fica registrada em `schema_migrations` (quando, quanto tempo levou).
- Escreva de forma que rodar duas vezes não quebre (`CREATE TABLE IF NOT EXISTS`, checar se a coluna já existe), porque bancos antigos podem já ter a mudança.
- **Nunca edite uma migração já aplicada.** Se o arquivo mudar depois, o sistema não roda de novo e avisa na tela de saúde. Corrija com uma migração nova.
- Se uma migração falhar, o servidor **não sobe** e a mesma migração é tentada de novo na próxima subida. Isso é proposital: melhor parar do que seguir com o banco pela metade.
- Os testes (`npm test`) montam um banco do zero e aplicam tudo, então a migração nova já é exercitada no CI.
