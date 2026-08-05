const express = require('express');
const axios = require('axios');
const router = express.Router();

// --- ROTA IVERTEX 1: LISTAR CONSULTAS DISPONÍVEIS ---
// Note que aqui usamos apenas '/consultas', pois o '/api/ivertex' será definido no server.js
router.get('/DataAdminDIO/ListarConsultasDisponiveis', async (req, res) => {
    try {
        const IVERTEX_API_URL = process.env.IVERTEX_API_URL;
        const IVERTEX_TOKEN = process.env.IVERTEX_TOKEN;

        const config = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (IVERTEX_TOKEN) {
            config.headers['Authorization'] = `Bearer ${IVERTEX_TOKEN}`;
        }

        const response = await axios.get(`${IVERTEX_API_URL}/DataAdminDIO/ListarConsultasDisponiveis`, config);
        
        console.log(`Sucesso! O iVertex retornou a lista de consultas.`);
        res.json(response.data);
    } catch (e) { 
        console.error("ERRO NA API DO IVERTEX:", e.response ? e.response.data : e.message);
        res.status(500).json({ erro: "Falha ao buscar consultas da Ivertex", detalhe: e.message }); 
    }
});

module.exports = router;