require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN;

app.get('/api/sala/:id', async (req, res) => {
    const salaId = req.params.id;

    try {
        // 1. TENTATIVA NO BUBBLE (Busca por Sala Ativa)
        // Vamos buscar no Bubble quem está marcado para esta sala hoje
        const bubbleResponse = await axios.get(BUBBLE_API_URL, {
            headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` },
            params: {
                constraints: JSON.stringify([
                    { key: "sala_numero_text", constraint_type: "equals", value: salaId },
                    { key: "status_ativo_boolean", constraint_type: "equals", value: true }
                ])
            }
        });

        const memorial = bubbleResponse.data.response.results[0];

        if (memorial) {
            // Se achou no Bubble, montamos o objeto completo
            return res.json({
                sala: salaId,
                nome: memorial.nome_falecido_text || "Homenagem Especial",
                destino: memorial.local_sepultamento_text || "Consulte a Recepção",
                horario: memorial.horario_inicio_text || "--:--",
                foto: memorial.foto_falecido || "https://via.placeholder.com/1080?text=Bosque+da+Esperanca",
                qrCode: `https://portalmemorial.com.br/memorial/${memorial.slug}`
            });
        }

        // 2. SE NÃO ACHAR NO BUBBLE, RETORNA STATUS DE ESPERA
        res.json({
            sala: salaId,
            nome: "Sala disponível",
            destino: "Bosque da Esperança",
            horario: "",
            foto: "https://via.placeholder.com/1080?text=Bosque+da+Esperanca",
            qrCode: "https://bosquedaesperanca.com.br"
        });

    } catch (error) {
        console.error("Erro na integração:", error.message);
        res.status(500).json({ erro: "Erro ao processar dados" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor SSD rodando na porta ${PORT}`);
});
