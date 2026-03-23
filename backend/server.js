require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Preparado para chamadas iVertex/Bubble
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- SIMULAÇÃO DE BANCO DE DADOS (MOCK) ---
// Representa o que viria do iVertex e do Bubble
const dadosOperacionais = [
    { sala: "01", nome: "João da Silva", tipo: "Sepultamento", local: "Quadra 04", inicio: "08:00" },
    { sala: "02", nome: "Maria Oliveira", tipo: "Cremação", local: "Bloco A", inicio: "10:00" }
];

const dadosMemoriais = [
    { nome: "João da Silva", foto: "https://via.placeholder.com/400", qrCode: "https://memorial.com/joao" },
    { nome: "Maria Oliveira", foto: "https://via.placeholder.com/400", qrCode: "https://memorial.com/maria" }
];

// --- ROTAS DA API ---

// 1. Rota para o Painel do Hall (Lista de todas as salas)
app.get('/api/hall', (req, res) => {
    res.json(dadosOperacionais);
});

// 2. Rota para a Porta da Sala (Com o Cruzamento de Dados)
app.get('/api/sala/:id', (req, res) => {
    const salaId = req.params.id;

    // A. Busca no iVertex (Simulado)
    const velorio = dadosOperacionais.find(v => v.sala === salaId);

    if (!velorio) {
        return res.status(404).json({ erro: "Sala vazia ou não encontrada" });
    }

    // B. Cruzamento: Busca no Bubble pelo Nome (Simulado)
    const memorial = dadosMemoriais.find(m => m.nome === velorio.nome);

    // C. Resposta Final Unificada
    const respostaFinal = {
        sala: velorio.sala,
        nome: velorio.nome,
        destino: `${velorio.tipo} - ${velorio.local}`,
        horario: velorio.inicio,
        // Se encontrar no Bubble usa a foto, senão usa uma imagem padrão do Bosque
        foto: memorial ? memorial.foto : "https://via.placeholder.com/400?text=Bosque+da+Esperanca",
        qrCode: memorial ? memorial.qrCode : "https://bosquedaesperanca.com.br"
    };

    res.json(respostaFinal);
});

app.listen(PORT, () => {
    console.log(`Servidor SSD Bosque da Esperança rodando na porta ${PORT}`);
});
