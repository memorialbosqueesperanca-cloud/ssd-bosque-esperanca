require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const API_PORT = process.env.API_PORT || 5000;
const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'painel')));

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO E STATUS ---
function formatarData(isoString) {
    if (!isoString) return "--.--.----";
    const data = new Date(isoString);
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

function converterHoraParaData(horaString) {
    const dataBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return new Date(`${dataBR}T${horaString}:00-03:00`);
}

function calcularStatus(dataInicio, dataFim) {
    const agora = new Date();
    if (agora > dataFim) {
        return "encerrado";
    } else if (agora >= dataInicio && agora <= dataFim) {
        return "em andamento";
    } else {
        return "agendado";
    }
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

// --- ROTA 2: PAINEL DO HALL ---
app.get('/api/hall', async (req, res) => {
    try {
        const agora = new Date();
        const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0).toISOString();
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

        // 1. DADOS MANUAIS SIMULANDO O BUBBLE (usando as chaves exatas da API)
        const dadosBaseManuais = [
            { 
                "falecido_nome": "José Alencar de Guiar Pereira", 
                "sala_cerimonia": "1", 
                "data_inicio": converterHoraParaData("12:00").toISOString(), 
                "data_fim": converterHoraParaData("16:00").toISOString(), 
                "local da sepultura": "Ipê",
                "Foto falecido": null
            },
            { 
                "falecido_nome": "Rosa Do Menino Jesus", 
                "sala_cerimonia": "7", 
                "data_inicio": converterHoraParaData("11:00").toISOString(), 
                "data_fim": converterHoraParaData("15:00").toISOString(), 
                "local da sepultura": "Angico",
                "Foto falecido": null
            },
            { 
                "falecido_nome": "Teodoro Elias Barbosa", 
                "sala_cerimonia": "DIRETO", 
                "data_inicio": converterHoraParaData("15:30").toISOString(), 
                "data_fim": converterHoraParaData("15:35").toISOString(), 
                "local da sepultura": "Hibisco",
                "Foto falecido": null
            }
        ];

        // 2. FUNDIR OS DADOS ANTES DO MAP
        // Garantimos que a API e os dados manuais passem pela exata mesma lógica
        const resultadosBubble = response.data.response.results || [];
        const dadosCompletos = [...resultadosBubble, ...dadosBaseManuais];
        
        // 3. MAPEAR E CALCULAR TUDO JUNTO
        const lista = dadosCompletos.map(item => {
            const dInicio = new Date(item.data_inicio);
            const dFim = new Date(item.data_fim);
            
            // Tratamento para não exibir "Sala" antes de "DIRETO"
            let nomeSala = item.sala_cerimonia || "";
            if (nomeSala.toUpperCase() === "DIRETO") {
                nomeSala = "DIRETO";
            } else if (!nomeSala.toLowerCase().includes("sala")) {
                nomeSala = "Sala " + nomeSala; 
            }
            
            return {
                nome: item.falecido_nome,
                sala: nomeSala,
                foto: item["Foto falecido"] || null,
                destino: item["local da sepultura"] || null,
                data_inicio: item.data_inicio || null,
                data_fim: item.data_fim || null,
                status: calcularStatus(dInicio, dFim)
            };
        });

        console.log(`Sucesso! Processados ${resultadosBubble.length} do Bubble e ${dadosBaseManuais.length} manuais.`);
        
        res.json(lista);

    } catch (e) { 
        console.error("ERRO NA API DO BUBBLE:", e.response ? e.response.data : e.message);
        res.status(500).json({ erro: e.message }); 
    }
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'painel', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));