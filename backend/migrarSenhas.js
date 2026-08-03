const bcrypt = require('bcryptjs');
const pool = require('./src/lib/db'); // Ajuste este caminho se o seu arquivo de conexão de banco estiver em outro lugar

async function migrarSenhas() {
    console.log("Iniciando a migração de senhas para Bcrypt...");
    const conexao = await pool.getConnection();

    try {
        await conexao.beginTransaction(); // Usa transação para garantir segurança

        // Busca apenas usuários onde a senha ainda não está criptografada
        // Senhas do bcrypt (cost=12) normalmente começam com "$2b$12$" ou "$2a$12$" e têm 60 caracteres
        const [usuarios] = await conexao.query(`
            SELECT id, senha 
            FROM usuarios 
            WHERE senha NOT LIKE '$2%' 
            AND senha IS NOT NULL
        `);

        if (usuarios.length === 0) {
            console.log("Nenhum usuário precisa de migração. Todas as senhas parecem ser hashes.");
            return;
        }

        console.log(`Encontrados ${usuarios.length} usuários com senha em texto plano. Criptografando...`);

        // Executa um loop atualizando a senha de cada um
        for (const user of usuarios) {
            const novaSenhaCriptografada = await bcrypt.hash(String(user.senha), 12);
            
            await conexao.query(
                'UPDATE usuarios SET senha = ? WHERE id = ?', 
                [novaSenhaCriptografada, user.id]
            );
        }

        await conexao.commit();
        console.log("Migração concluída com sucesso! Todas as senhas agora estão seguras.");

    } catch (erro) {
        await conexao.rollback();
        console.error("Erro durante a migração. Nenhuma alteração foi feita no banco.", erro);
    } finally {
        conexao.release();
        process.exit();
    }
}

migrarSenhas();
