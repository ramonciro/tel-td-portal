# Backup externo e restauração — Portal T&D

Atualizado em 21/10/2026 (fase 1 de resiliência).

## O que existe

- **Backup diário automático às 02h30 (Brasília)** do banco de dados e dos arquivos enviados (provas escaneadas, certificados, biblioteca), gravado num bucket FORA da hospedagem do servidor.
- **O servidor não cai mais junto com o banco.** Se o banco ficar fora do ar, o portal responde "temporariamente indisponível" na hora (em vez de travar) e volta sozinho quando o banco voltar. O frontend mostra uma faixa de aviso no topo.
- **Verificações de saúde** para monitoramento externo:
  - `GET /api/health` — o processo está de pé (sempre 200).
  - `GET /api/health/banco` — 200 se o banco responde; 503 se não.
  - `GET /api/health/backup` — 503 se o último backup tem mais de 36 horas.

O backup só liga quando as variáveis abaixo existem. Sem elas, o portal funciona como antes.

## Configurar o bucket (uma vez, ~15 minutos)

Recomendado: **Cloudflare R2** (10 GB grátis; sem cobrança de download).

1. Crie a conta em cloudflare.com (se ainda não tiver) e abra **R2 Object Storage**. O R2 pede um cartão para ativar, mas não cobra dentro do plano grátis.
2. **Create bucket** → nome sugerido: `portal-td-backup` → deixe privado (padrão).
3. Em **R2 → Manage API Tokens → Create API token**:
   - Permissão: **Object Read & Write**
   - Escopo: **somente o bucket `portal-td-backup`**
   - Anote o **Access Key ID**, o **Secret Access Key** e o endereço (**S3 API endpoint**), parecido com `https://<codigo>.r2.cloudflarestorage.com`.
4. No serviço do **backend** na Railway (Variables), crie:

| Variável | Valor |
|---|---|
| `BACKUP_S3_ENDPOINT` | o endpoint do passo 3 |
| `BACKUP_S3_BUCKET` | `portal-td-backup` |
| `BACKUP_S3_ACCESS_KEY_ID` | Access Key ID |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret Access Key |
| `BACKUP_S3_REGION` | `auto` |
| `BACKUP_ALERTA_EMAIL` | (opcional) e-mail avisado se o backup falhar |
| `BACKUP_DIAS_DIARIOS` | (opcional) dias de backups diários guardados; padrão 14 |

Depois de salvar as variáveis o serviço reinicia. Nos registros deve aparecer: `Backup externo ligado (02h30 de Brasília, diário)`.

5. **Teste na hora** (sem esperar as 02h30): logado como coordenador/supervisor/superintendente, faça `POST /api/admin/jobs/rodar-backup`. Depois consulte `GET /api/admin/backup/status`. No bucket devem aparecer as pastas `db/`, `uploads/` e `status/`.

## O que fica guardado

- `db/AAAA/MM/portal-td_AAAA-MM-DD_HHMM.sql.gz` — dump completo do banco. Guarda os últimos 14 dias, mais o do dia 1 de cada mês por 12 meses (e nunca menos de 3).
- `uploads/...` — cópia dos arquivos enviados. Só acrescenta e atualiza; **nunca apaga** do bucket, mesmo que o arquivo seja removido do servidor.
- `status/ultimo-backup.json` — resultado do último backup.

Os dados são pessoais (LGPD): mantenha o bucket privado e o token restrito a esse bucket. O R2 já criptografa em repouso.

## Monitoramento gratuito (recomendado)

Em **uptimerobot.com** (plano grátis), crie 2 monitores HTTP(s) de 5 em 5 minutos, com aviso por e-mail:

1. `https://<endereço-do-backend>/api/health/banco` — avisa quando o banco cai.
2. `https://<endereço-do-backend>/api/health/backup` — avisa quando o backup está atrasado.

Na Railway, se quiser, defina o **Healthcheck Path** do backend como `/api/health` (não use `/api/health/banco`, para a Railway não reiniciar o servidor à toa quando só o banco caiu).

## Restaurar (passo a passo)

Os comandos rodam na pasta `backend/` de um computador ou serviço com Node 20+ e as variáveis do banco de DESTINO (`MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT`) e do bucket (`BACKUP_S3_*`). Rode `npm install` antes, na primeira vez.

**1. Ver os backups disponíveis**

    node src/scripts/restaurarBackup.js --listar

**2. Restaurar o banco** (copie a chave desejada da lista):

    node src/scripts/restaurarBackup.js --chave db/2026/10/portal-td_2026-10-22_0230.sql.gz --confirmo

- Sem `--confirmo` nada é alterado.
- Se o banco de destino já tem tabelas, o script para e pede `--forcar` (a restauração recria cada tabela do zero, apagando os dados atuais dela). Para restaurar num banco novo e vazio, não precisa.

**3. Restaurar os arquivos enviados**

    node src/scripts/restaurarBackup.js --uploads --confirmo

Baixa para a pasta de uploads (`UPLOADS_DIR`, padrão `./uploads`) o que estiver faltando ou diferente.

**Alternativa sem o script:** baixe o `.sql.gz` pelo painel do R2 e rode `gunzip -c arquivo.sql.gz | mysql -h <host> -u <usuario> -p <banco>`.

### Se a hospedagem atual cair de vez (mudar de provedor)

1. Crie um MySQL novo no novo provedor e um serviço Node com o código do repositório.
2. Configure as mesmas variáveis do backend (inclusive `JWT_SECRET`, para os logins continuarem válidos) apontando para o banco novo.
3. Restaure o banco (passo 2) e os uploads (passo 3).
4. Aponte o frontend (variável `NEXT_PUBLIC_API_URL` na Vercel) para o endereço novo do backend.

## Limites conhecidos

- O backup é diário: em uma falha, podem se perder até ~24 h de lançamentos. Banco gerenciado com recuperação a qualquer ponto no tempo (fase 2) reduz isso para minutos.
- Uma sincronização de uploads grande demais para 20 minutos continua no dia seguinte (o que sobrar aparece em `restantes` no status).
- Uma queda geral do bucket (R2) não afeta o portal; só o backup daquele dia falha e o aviso é enviado, se configurado.
