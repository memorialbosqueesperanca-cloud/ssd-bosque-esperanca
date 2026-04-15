require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const API_PORT = process.env.API_PORT || 3000;
const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'painel')));

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO ---
function formatarData(isoString) {
    if (!isoString) return "--.--.----";
    const data = new Date(isoString);
    // Garante que a data seja lida em UTC para evitar erro de "um dia antes"
    const dataFormatada = data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    return dataFormatada.replace(/\//g, '.');
}

function formatarHora(isoString) {
    if (!isoString) return "--:--";
    const data = new Date(isoString);
    return data.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        timeZone: 'America/Sao_Paulo' 
    });
}

// --- ROTA 1: PORTA DA SALA (Individual) ---
app.get('/api/sala/:id', async (req, res) => {
    const salaSolicitada = req.params.id;
    try {
        const response = await axios.get(BUBBLE_API_URL, {
            headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` },
            params: {
                constraints: JSON.stringify([
                    { key: "sala_cerimonia", constraint_type: "equals", value: salaSolicitada },
                    { key: "visivel", constraint_type: "equals", value: true }
                ])
            }
        });
        const memorial = response.data.response.results[0];
        if (memorial) {
            return res.json({
                sala: memorial.sala_cerimonia,
                nome: memorial.falecido_nome,
                destino: memorial["local da sepultura"] || "Consulte a recepção",
                foto: memorial["Foto falecido"] ? `https:${memorial["Foto falecido"]}` : "https://via.placeholder.com/1080?text=Bosque+da+Esperanca",
                qrCode: memorial.qrcode ? `https:${memorial.qrcode}` : null,
                data_nascimento: formatarData(memorial["data nascimento"]),
                data_falecimento: formatarData(memorial["data falecimento"]),
                hora_inicio: formatarHora(memorial.data_inicio),
                hora_termino: formatarHora(memorial.data_fim)
            });
        }
        res.json({ nome: "Sala disponível", sala: salaSolicitada, foto: "" });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// --- ROTA 2: PAINEL DO HALL (Somente ativos hoje, incluindo 30min após encerramento) ---
app.get('/api/hall', async (req, res) => {
    try {
        const agora = new Date();
        // Limite inferior: início do dia de hoje
        const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0).toISOString();
        // Limite superior para data_inicio: fim do dia
        const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59).toISOString();
        const response = await axios.get(BUBBLE_API_URL, {
            headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` },
            params: {
                constraints: JSON.stringify([
                    { key: "visivel", constraint_type: "equals", value: true },
                    { key: "data_inicio", constraint_type: "less than", value: fimDoDia },
                    { key: "data_fim", constraint_type: "greater than", value: inicioDoDia }
                ])
            }
        });
        const lista = response.data.response.results.map(item => ({
            nome: item.falecido_nome,
            sala: item.sala_cerimonia,
            foto: item["Foto falecido"] || null,
            destino: item["local da sepultura"] || null,
            data_inicio: item.data_inicio || null,
            data_fim: item.data_fim || null
        }));
        res.json(lista);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'painel', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));
