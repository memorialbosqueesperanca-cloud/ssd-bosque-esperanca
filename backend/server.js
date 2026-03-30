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
    const salaSolicitada = req.params.id;

    try {
        // Busca no Bubble por: sala_cerimonia igual à solicitada E visivel = true
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
                horario: "Horário sob consulta", // Campo de horário não identificado no print, podemos adicionar depois
                foto: memorial["Foto falecido"] ? `https:${memorial["Foto falecido"]}` : "https://via.placeholder.com/1080?text=Bosque+da+Esperanca",
                qrCode: `https://portalmemorial.com.br/memorial/${memorial._id}` // Usando o ID único do Bubble para o link
            });
        }

        res.json({ nome: "Sala disponível", sala: salaSolicitada, foto: "" });

    } catch (error) {
        console.error("Erro Bubble:", error.message);
        res.status(500).json({ erro: "Erro ao conectar com banco de dados" });
    }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
