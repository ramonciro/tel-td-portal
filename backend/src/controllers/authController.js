const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // ou 'bcrypt', dependendo do seu package.json
const pool = require('../lib/db'); // ajuste o caminho do seu pool de banco de dados
const jwt = require('jsonwebtoken'); // Para a próxima correção de tokens

// 1. Endpoint Seguro de Login
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [email]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
        }

        const user = users[0];

        // Compara a senha enviada em texto plano com o Hash armazenado no banco
        const senhaValida = await bcrypt.compare(String(senha), String(user.senha));

        if (!senhaValida) {
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        // Lógica de geração de token (preparando para a correção do JWT)
        const token = jwt.sign(
            { id: user.id, perfil: user.perfil }, 
            process.env.JWT_SECRET || 'fallback-rotacionar-urgente', 
            { expiresIn: '8h' }
        );

        res.json({ token, user: { id: user.id, nome: user.nome, perfil: user.perfil } });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// 2. Endpoint Seguro de Alteração de Senha
router.post('/alterar-senha', async (req, res) => {
    const { idUsuario, novaSenha } = req.body;

    try {
        // Gera o Hash da nova senha com 12 salt rounds (Padrão ouro de segurança)
        const salt = await bcrypt.genSalt(12);
        const senhaCriptografada = await bcrypt.hash(String(novaSenha), salt);

        await pool.query('UPDATE usuarios SET senha = ?, precisa_trocar_senha = 0 WHERE id = ?', [senhaCriptografada, idUsuario]);

        res.json({ message: 'Senha atualizada com segurança!' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro ao processar a troca de senha.' });
    }
});

module.exports = router;
