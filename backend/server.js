const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN;

// Configurações da API do iVertex (Adicione no seu arquivo .env futuramente)
const IVERTEX_API_URL = process.env.IVERTEX_API_URL;
const IVERTEX_TOKEN = process.env.IVERTEX_TOKEN;

app.use(express.static(path.join(__dirname, '..', 'painel')));

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

// Função auxiliar para buscar dados do iVertex (Estrutura base preparada)
async function buscarDadosIVertex(dataInicio, dataFim) {
    if (!IVERTEX_API_URL) return []; // Retorna vazio se a API ainda não estiver configurada no .env
    try {
        // Substitua pelo endpoint e regras de autenticação reais do iVertex
        // const response = await axios.get(IVERTEX_API_URL, {
        //     headers: { 'Authorization': `Bearer ${IVERTEX_TOKEN}` },
        //     params: { data_inicio: dataInicio, data_fim: dataFim } // Ajuste os parâmetros de data do iVertex
        // });
        // return response.data; // Supondo que a resposta venha em um array
        return []; // Mantendo retorno vazio até a implementação real
    } catch (e) {
        console.error("Erro ao buscar dados no iVertex:", e.message);
        return [];
    }
}

// ROTA 1: PORTA DA SALA
app.get('/api/sala/:id', async (req, res) => {
    const salaSolicitada = req.params.id;
    try {
        const agora = new Date();
        const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0).toISOString();
        const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59).toISOString();

        // 1. Busca no iVertex (para o caso de serviços que só existem lá)
        const dadosIVertex = await buscarDadosIVertex(inicioDoDia, fimDoDia);
        // Encontra o registro desta sala no iVertex (ajuste 'sala_id' conforme o retorno da API deles)
        const infoIVertex = dadosIVertex.find(v => String(v.sala_id) === String(salaSolicitada));

        // 2. Busca no Bubble
        const response = await axios.get(BUBBLE_API_URL, {
            headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` },
            params: {
                constraints: JSON.stringify([
                    { key: "sala_cerimonia", constraint_type: "equals", value: salaSolicitada },
                    { key: "visivel", constraint_type: "equals", value: true },
                    { key: "data_inicio", constraint_type: "less than", value: fimDoDia },
                    { key: "data_fim", constraint_type: "greater than", value: inicioDoDia }
                ])
            }
        });

        const memorial = response.data.response.results[0];

        if (memorial) {
            return res.json({
                sala: memorial.sala_cerimonia,
                nome: memorial.falecido_nome,
                destino: memorial["local da sepultura"] || (infoIVertex ? infoIVertex.local_sepultura : "Consulte a recepção"),
                foto: memorial["Foto falecido"] ? (memorial["Foto falecido"].startsWith('//') ? `https:${memorial["Foto falecido"]}` : memorial["Foto falecido"]) : null,
                qrCode: memorial.qrcode ? (memorial.qrcode.startsWith('//') ? `https:${memorial.qrcode}` : memorial.qrcode) : null,
                velorio_online: infoIVertex ? infoIVertex.velorio_online : memorial.velorio_online,
                data_nascimento: formatarData(memorial["data nascimento"]),
                data_falecimento: formatarData(memorial["data falecimento"]),
                hora_inicio: formatarHora(memorial.data_inicio), // Ex: infoIVertex ? formatarHora(infoIVertex.data_inicio) : ...
                hora_termino: formatarHora(memorial.data_fim),   // Ex: infoIVertex ? formatarHora(infoIVertex.data_fim) : ...
                data_inicio_raw: memorial.data_inicio,
                data_fim_raw: memorial.data_fim 
            });
        } else if (infoIVertex) {
            // Se NÃO tem no Bubble, mas TEM no iVertex: Monta o painel básico da sala
            return res.json({
                sala: salaSolicitada,
                nome: infoIVertex.nome || "Homenageado",
                destino: infoIVertex.local_sepultura || "Consulte a recepção",
                foto: null, // Sem foto, o front-end usará a logo do Bosque
                
                // QR Code da Flora
                qrCode: "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent("https://bosqueesperanca.com.br/flora/"), 
                is_ivertex_only: true, // Flag para avisar a tela que não há memorial do Bubble
                velorio_online: infoIVertex.velorio_online || null,
                
                data_nascimento: "--.--.----", 
                data_falecimento: "--.--.----",
                hora_inicio: formatarHora(infoIVertex.data_inicio),
                hora_termino: formatarHora(infoIVertex.data_fim),
                data_inicio_raw: infoIVertex.data_inicio,
                data_fim_raw: infoIVertex.data_fim
            });
        }

        // Se não houver nada agendado para HOJE nesta sala em NENHUM dos sistemas
        res.json({ status: "disponivel", mensagem: "SALA EM PREPARAÇÃO" });

    } catch (e) {
        console.error("Erro na rota da sala:", e.message);
        res.status(500).json({ erro: e.message });
    }
});

// ROTA 2: PAINEL DO HALL
app.get('/api/hall', async (req, res) => {
    try {
        // --- CONFIGURAÇÃO DE DATAS (HOJE) ---
        const agora = new Date();
        
        // Criamos o início do dia de hoje (00:00:00)
        const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0).toISOString();
        
        // Criamos o fim do dia de hoje (23:59:59)
        const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59).toISOString();

        console.log(`>>> Filtrando entre: ${inicioDoDia} e ${fimDoDia}`);

        // 1. Busca os dados operacionais do iVertex
        const dadosIVertex = await buscarDadosIVertex(inicioDoDia, fimDoDia);

        // 2. Busca os dados do memorial no Bubble.io
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

        const resultados = response.data.response.results;

        console.log(`>>> Sucesso! ${resultados.length} registros para hoje.`);

        // 3. Cruzamento dos Dados (Merge entre Bubble e iVertex)
        const listaCruzada = [];
        const nomesProcessados = new Set();

        // PASSO 1: Processa os falecidos que vieram do Bubble (Velórios com Sala e Memorial)
        resultados.forEach(item => {
            const nomeFalecido = item.falecido_nome || "Homenageado";

            // Garante que nenhum falecido seja duplicado (verificação pelo nome)
            if (!nomesProcessados.has(nomeFalecido.toLowerCase())) {
                nomesProcessados.add(nomeFalecido.toLowerCase());

                // Exemplo de cruzamento: Busca os dados operacionais da sala no iVertex
                // const infoIVertex = dadosIVertex.find(v => String(v.sala_id) === String(item.sala_cerimonia));
                
                listaCruzada.push({
                    nome: nomeFalecido,
                    sala: item.sala_cerimonia || "-",
                    foto: item["Foto falecido"] ? (item["Foto falecido"].startsWith('//') ? `https:${item["Foto falecido"]}` : item["Foto falecido"]) : null,
                    
                    // Se infoIVertex existir, usamos o dado dele. Se não, fallback pro Bubble
                    destino: item["local da sepultura"] || "Consulte a recepção", // Ex: infoIVertex ? infoIVertex.quadra : item["local da sepultura"]
                    data_inicio: item.data_inicio, // Ex: infoIVertex ? infoIVertex.data_inicio : item.data_inicio
                    data_fim: item.data_fim // Ex: infoIVertex ? infoIVertex.data_fim : item.data_fim
                });
            }
        });

        // PASSO 2: Processa os falecidos exclusivos do iVertex (Direto, Cremação Direta, PBH, etc.)
        // Só vai adicionar se o nome não tiver sido inserido pelo Bubble no passo anterior
        if (Array.isArray(dadosIVertex)) {
            dadosIVertex.forEach(itemIVertex => {
                // ATENÇÃO: Substitua 'itemIVertex.nome' pelos campos reais da API do iVertex
                const nomeFalecido = itemIVertex.nome || "Homenageado";

                if (!nomesProcessados.has(nomeFalecido.toLowerCase())) {
                    nomesProcessados.add(nomeFalecido.toLowerCase());

                    // Verifica se o iVertex retornou uma sala de velório para este serviço
                    // Se sim, usa ela, senão, mostra que é direto/cremação.
                    const salaDesignada = itemIVertex.sala_id ? itemIVertex.sala_id : (itemIVertex.tipo_servico || "Direto");

                    listaCruzada.push({
                        nome: nomeFalecido,
                        sala: salaDesignada, 
                        
                        foto: null, 
                        
                        destino: itemIVertex.local_sepultura || "Consulte a recepção",
                        data_inicio: itemIVertex.data_inicio, 
                        data_fim: itemIVertex.data_fim
                    });
                }
            });
        }

        res.json(listaCruzada);
    } catch (e) {
        console.error("!!! ERRO NO FILTRO DE DATAS:", e.response ? e.response.data : e.message);
        res.status(500).json({ erro: "Erro ao filtrar dados" });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'painel', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));