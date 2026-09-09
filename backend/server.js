// =========================
// Dependências e Setup
// =========================
const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const {
    db,
    inicializarBanco,
    salvarEventosIntuo,
    salvarEventosMemorial,
    salvarEdicaoEvento,
    removerEdicaoEvento,
    executarCruzamentoSQLite,
    obterEventosHall,
    obterEventoPorSala
} = require('./database');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const BUBBLE_API_URL = process.env.BUBBLE_API_URL;
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN;

// =========================
// Diretórios e Configs
// =========================
app.use(express.static(path.join(__dirname, '..', 'painel')));

const VIDEO_CONFIG_PATH = path.join(__dirname, '..', 'painel', 'video-config.json');
const VIDEO_UPLOAD_DIR = path.join(__dirname, '..', 'painel', 'videos');
const DEFAULT_VIDEOS_HALL = ['videos/video1.mp4', 'videos/video2.mp4'];
const DEFAULT_VIDEOS_SALA = ['videos/video-sala1.mp4', 'videos/video-sala2.mp4'];

fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

// =========================
// Multer Storage
// =========================
const storage = multer.diskStorage({
    destination: VIDEO_UPLOAD_DIR,
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
        cb(null, `${Date.now()}-${safeName}`);
    }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// =========================
// Funções utilitárias
// =========================
function lerConfiguracaoVideos() {
    try {
        if (!fs.existsSync(VIDEO_CONFIG_PATH)) {
            return { hall: DEFAULT_VIDEOS_HALL, sala: DEFAULT_VIDEOS_SALA };
        }
        const raw = fs.readFileSync(VIDEO_CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            hall: Array.isArray(parsed.hall) && parsed.hall.length > 0 ? parsed.hall : DEFAULT_VIDEOS_HALL,
            sala: Array.isArray(parsed.sala) && parsed.sala.length > 0 ? parsed.sala : DEFAULT_VIDEOS_SALA
        };
    } catch (err) {
        return { hall: DEFAULT_VIDEOS_HALL, sala: DEFAULT_VIDEOS_SALA };
    }
}

function salvarConfiguracaoVideos(config) {
    fs.writeFileSync(VIDEO_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// =========================
// Gerenciamento de Clientes SSE (Auto-Refresh no Front)
// =========================
let sseClients = [];

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    sseClients.push(res);
    
    req.on('close', () => {
        sseClients = sseClients.filter(client => client !== res);
    });
});

function dispararAtualizacaoParaFrontend() {
    sseClients.forEach(client => {
        client.write(`data: atualizar\n\n`);
    });
}

// =========================
// Integração Intuo e Memorial com SQLite3 (Auto-Refresh e Cruzamento)
// =========================
let intuoCache = [];

async function executarPainelSSD(dataEspecifica, forcarIntuo = true) {
    try {
        const dataAtual = (typeof dataEspecifica === 'string' && dataEspecifica.length === 10) 
            ? dataEspecifica 
            : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            
        const [ano, mes, dia] = dataAtual.split('-').map(Number);

        const inicioDoDia = new Date(ano, mes - 1, dia, 0, 0, 0).toISOString();
        const fimDoDia = new Date(ano, mes - 1, dia, 23, 59, 59).toISOString();

        let sincronizarIntuo = forcarIntuo;
        if (!sincronizarIntuo) {
            const totalIntuoHoje = await new Promise((res) => {
                db.get("SELECT COUNT(*) as total FROM intuo_eventos WHERE data_referencia = ?", [dataAtual], (err, row) => {
                    res(row ? row.total : 0);
                });
            });
            if (totalIntuoHoje === 0) {
                console.log(`⚠️ [AUTO-HEALING] Nenhum registro da Intuo encontrado no banco para ${dataAtual}. Ativando busca da Intuo...`);
                sincronizarIntuo = true;
            }
        }

        if (sincronizarIntuo) {
            console.log(`📡 [SINCRONIZAÇÃO COMPLETA] Buscando dados da Intuo + Memorial para ${dataAtual}...`);
            // 1. Busca e salva dados da INTUO no SQLite (Janela de 3 dias para cobrir velórios contínuos)
            try {
                const dataFormatadaIntuo = dataAtual;

                const payloadIntuo = {
                    "idConsulta": 4885,
                    "usarNomenclaturaBancoDados": true,
                    "parametros": [
                        { "Item1": "ch_tipo_consulta", "Item2": "ALL" },
                        { "Item1": "ch_tipo_filtro_data", "Item2": "ALL" },
                        { "Item1": "dt_inicial", "Item2": "" }, 
                        { "Item1": "dt_final", "Item2": "" },   
                        { "Item1": "ch_texto_pesquisa", "Item2": "" },
                        { "Item1": "nm_número_pesquisa", "Item2": "0" },
                        { "Item1": "nm_id_usuário", "Item2": "9" },
                        { "Item1": "nm_status", "Item2": "0" } 
                    ]
                };

                console.log(`📡 [INTUO] Consultando API da Intuo para data ${dataAtual}...`);

                function buscarIntuoStream(payload) {
                    const payloadStr = JSON.stringify(payload);
                    return new Promise((resolve, reject) => {
                        const req = https.request({
                            hostname: 'api-bosquedaesperanca.intuo.app',
                            port: 443,
                            path: '/iVertexServices/DataAdminDIO/ObterDadosConsulta',
                            method: 'POST',
                            agent: false,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': '7E30CE1DC3D202B0B9A2841694D3EDB44FB7C8',
                                'token': '7E30CE1DC3D202B0B9A2841694D3EDB44FB7C8',
                                'User-Agent': 'Mozilla/5.0',
                                'Connection': 'close',
                                'Content-Length': Buffer.byteLength(payloadStr)
                            },
                            timeout: 180000
                        }, res => {
                            let chunks = [];
                            res.on('data', c => chunks.push(c));
                            res.on('end', () => {
                                try {
                                    const parsed = JSON.parse(Buffer.concat(chunks).toString());
                                    resolve(parsed.ResponseData || []);
                                } catch(e) {
                                    reject(e);
                                }
                            });
                        });
                        req.on('error', reject);
                        req.on('timeout', () => {
                            req.destroy(new Error('Timeout de 180s na Intuo'));
                        });
                        req.write(payloadStr);
                        req.end();
                    });
                }

                async function buscarIntuoComRetry(payload, maxTentativas = 3) {
                    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
                        try {
                            return await buscarIntuoStream(payload);
                        } catch (err) {
                            if (tentativa === maxTentativas) throw err;
                            console.warn(`⚠️ [INTUO] Tentativa ${tentativa} falhou (${err.message}). Nova tentativa em 3s...`);
                            await new Promise(r => setTimeout(r, 3000));
                        }
                    }
                }

                const todosOsDados = await buscarIntuoComRetry(payloadIntuo);

                // Peneira principal: Velório, Sepultamento, Inumação, Cremação e Traslado
                const servicosDesejados = ["VELÓRIO", "SEPULTAMENTO", "CREMAÇÃO", "INUMAÇÃO", "INUMAÇÃO DIRETA", "SEPULTAMENTO DIRETO", "CREMAÇÃO DIRETA", "TRASLADOS"];
                const agoraMs = Date.now();
                const TEMPO_MINIMO_CRIACAO_MS = 15 * 60 * 1000; // Tolerância de 15 minutos para tickets novos

                const dadosFiltrados = todosOsDados.filter(item => {
                    const tipo = String(item.ch_nome_tipo || '').toUpperCase();
                    const servico = String(item.ch_nome_serviço || '').toUpperCase();
                    const ehServicoDesejado = servicosDesejados.some(s => tipo.includes(s) || servico.includes(s));
                    const ehDeHoje = (item.dt_previsão_início && item.dt_previsão_início.startsWith(dataAtual)) ||
                                     (item.dt_previsão_término && item.dt_previsão_término.startsWith(dataAtual));

                    // Regra: tickets criados há menos de 15 minutos são ignorados temporariamente para evitar erros
                    if (item.dt_cadastro) {
                        const dataCadastroMs = new Date(item.dt_cadastro).getTime();
                        if (!isNaN(dataCadastroMs)) {
                            const diferencaMs = agoraMs - dataCadastroMs;
                            if (diferencaMs >= 0 && diferencaMs < TEMPO_MINIMO_CRIACAO_MS) {
                                const minutosRestantes = Math.ceil((TEMPO_MINIMO_CRIACAO_MS - diferencaMs) / 60000);
                                console.log(`⏳ [INTUO] Ticket #${item.nm_id} (${item.ch_nome_contato_relacionado || 'Falecido'}) criado recentemente (${Math.round(diferencaMs / 60000)} min atrás). Aguardando mais ${minutosRestantes} min para processar.`);
                                return false;
                            }
                        }
                    }

                    return ehServicoDesejado && ehDeHoje;
                });

                await salvarEventosIntuo(dadosFiltrados, dataAtual);
                console.log(`✅ [INTUO -> SQLITE] ${dadosFiltrados.length} evento(s) da Intuo persistidos no banco.`);
            } catch (erroIntuo) {
                console.error("❌ [INTUO] Falha na requisição da Intuo:", erroIntuo.message);
            }
        } else {
            console.log(`📡 [SINCRONIZAÇÃO BUBBLE] Atualizando Memorial Bubble e aplicando cache inteligente da Intuo para ${dataAtual}...`);
        }

        // 2. Busca e salva dados do MEMORIAL (Bubble) no SQLite
        try {
            if (BUBBLE_API_URL && BUBBLE_TOKEN) {
                const respostaBubble = await axios.get(BUBBLE_API_URL, {
                    headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` },
                    params: { 
                        constraints: JSON.stringify([
                            { key: "data_inicio", constraint_type: "less than", value: fimDoDia }, 
                            { key: "data_fim", constraint_type: "greater than", value: inicioDoDia }
                        ]) 
                    },
                    timeout: 5000
                });

                const memoriais = respostaBubble.data?.response?.results || [];
                await salvarEventosMemorial(memoriais, 'bubble');
                console.log(`✅ [MEMORIAL -> SQLITE] ${memoriais.length} registro(s) persistidos no banco.`);
            }
        } catch (erroBubble) {
            console.warn("⚠️ [MEMORIAL] Bubble indisponível ou offline:", erroBubble.message);
        }

        // 3. Executa Cruzamento e Consolidação no SQLite
        const consolidados = await executarCruzamentoSQLite(dataAtual);
        intuoCache = consolidados;
        console.log(`🚀 [CRUZAMENTO] ${consolidados.length} evento(s) consolidados para ${dataAtual} prontos para exibição.`);

        // 4. Notifica as telas conectadas via SSE
        dispararAtualizacaoParaFrontend();

        return consolidados;
    } catch (e) { 
        console.error("❌ [SINCRONIZAÇÃO] Erro ao sincronizar dados:", e.message); 
    }
}

// =========================
// Inicialização e Agendamento Diário da Intuo (07:00, 12:00 e 15:00)
// + Polling Contínuo do Bubble a cada 2 minutos
// =========================
let jaExecutou07h = false;
let jaExecutou12h = false;
let jaExecutou15h = false;

function checarAgendamentosDiarios() {
    const agora = new Date();
    const horaBrasilStr = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    const [h, m] = horaBrasilStr.split(':').map(Number);

    // 1ª Sincronização diária Intuo: 07:00 da manhã
    if (h === 7 && m === 0) {
        if (!jaExecutou07h) {
            jaExecutou07h = true;
            console.log(`⏰ [AGENDAMENTO 07:00] Iniciando 1ª sincronização diária da manhã (Intuo + Memorial)...`);
            executarPainelSSD(null, true);
        }
    } else {
        jaExecutou07h = false;
    }

    // 2ª Sincronização diária Intuo: 12:00 do meio-dia
    if (h === 12 && m === 0) {
        if (!jaExecutou12h) {
            jaExecutou12h = true;
            console.log(`⏰ [AGENDAMENTO 12:00] Iniciando 2ª sincronização diária do meio-dia (Intuo + Memorial)...`);
            executarPainelSSD(null, true);
        }
    } else {
        jaExecutou12h = false;
    }

    // 3ª Sincronização diária Intuo: 15:00 da tarde
    if (h === 15 && m === 0) {
        if (!jaExecutou15h) {
            jaExecutou15h = true;
            console.log(`⏰ [AGENDAMENTO 15:00] Iniciando 3ª sincronização diária da tarde (Intuo + Memorial)...`);
            executarPainelSSD(null, true);
        }
    } else {
        jaExecutou15h = false;
    }
}

// 1. Executa na inicialização do servidor (completa: Intuo + Bubble)
inicializarBanco().then(() => {
    console.log('✅ [SQLITE] Banco de dados pronto. Executando sincronização inicial completa...');
    executarPainelSSD(null, true);

    // 2. Inicia o monitoramento dos horários diários da Intuo (07:00, 12:00 e 15:00)
    setInterval(checarAgendamentosDiarios, 30000);
    console.log('📅 [AGENDADOR] Sincronizações da Intuo programadas para: 07:00, 12:00 e 15:00 (Horário de Brasília).');

    // 3. Polling inteligente e contínuo do Bubble a cada 2 minutos (mantendo cache SQLite da Intuo)
    setInterval(() => {
        executarPainelSSD(null, false);
    }, 2 * 60 * 1000);
    console.log('🔄 [BUBBLE POLLING] Atualização contínua do Memorial ativa a cada 2 minutos.');
}).catch(err => {
    console.error('❌ [SQLITE] Erro na inicialização:', err.message);
});

// =========================
// Rotas da API
// =========================

// =========================
// Rotas de Vídeos
// =========================

app.get('/api/video-config', (req, res) => {
    try {
        const config = lerConfiguracaoVideos();
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/video-config', (req, res) => {
    try {
        const config = req.body;
        if (!config || (!Array.isArray(config.hall) && !Array.isArray(config.sala))) {
            return res.status(400).json({ error: "Formato inválido" });
        }
        salvarConfiguracaoVideos(config);
        res.json({ success: true, message: "Configuração de vídeos salva com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/video-upload', upload.single('videoFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Nenhum arquivo enviado" });
        }
        const caminhoRelativo = `videos/${req.file.filename}`;
        res.json({
            success: true,
            path: caminhoRelativo,
            filename: req.file.filename
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Rotas amigáveis para acesso direto nas TVs e navegadores
app.get('/hall', (req, res) => {
    res.sendFile(path.join(__dirname, '../painel/index.html'));
});

app.get('/sala/:id', (req, res) => {
    const salaId = req.params.id;
    res.redirect(`/sala.html?sala=${encodeURIComponent(salaId)}`);
});

// Rota para exportar agenda completa do dia em Excel (.xlsx)
app.get('/api/exportar/excel', async (req, res) => {
    try {
        const dataAlvo = req.query.data || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const dados = await obterEventosHall(dataAlvo);
        
        const formatarHoraUniversal = (str) => {
            if (!str) return '--:--';
            const s = String(str).trim();
            if (s.endsWith('Z')) {
                return new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            }
            const limpo = s.replace(/\.\d+$/, '');
            return limpo.includes('T') ? limpo.split('T')[1].slice(0, 5) : limpo.slice(0, 5);
        };

        const dadosFiltrados = (dados || []).filter(item => {
            const tipo = String(item.tipo_servico || '').toUpperCase();
            const dest = String(item.destino || '').toUpperCase();
            const salaRaw = item.sala ? String(item.sala).trim().toLowerCase() : '';
            const ehSemSala = !salaRaw || salaRaw === 'direto' || salaRaw === 'n/d' || salaRaw === '-' || salaRaw === 'null';

            const ehCremacao = tipo.includes('CREMA') || dest.includes('CREMA');
            const ehVelorio = tipo.includes('VELÓRIO') || (!ehSemSala && item.id_memorial);

            if (ehCremacao && ehSemSala && !ehVelorio) {
                return false;
            }
            return true;
        });

        const formatados = dadosFiltrados.map((item, idx) => {
            let horario = '--:--';
            if (item.data_inicio && item.data_fim) {
                const hi = formatarHoraUniversal(item.data_inicio);
                const hf = formatarHoraUniversal(item.data_fim);
                horario = `${hi} às ${hf}`;
            }

            const salaRaw = item.sala ? String(item.sala).trim() : '';
            const salaLower = salaRaw.toLowerCase();
            let salaExibicao = 'Direto';
            if (salaRaw && salaRaw !== '-' && salaLower !== 'n/d' && salaRaw !== 'null') {
                if (salaLower.includes('imersiva') || salaRaw === '3' || salaLower === 'sala 3') {
                    salaExibicao = 'Sala Imersiva';
                } else if (salaLower.includes('sala') || salaLower.includes('direto')) {
                    salaExibicao = salaRaw;
                } else {
                    salaExibicao = `Sala ${salaRaw}`;
                }
            }

            return {
                'Nº': idx + 1,
                'Homenageado': item.nome || 'Não informado',
                'Sala': salaExibicao,
                'Tipo de Serviço': item.tipo_servico || 'VELÓRIO',
                'Horário': horario,
                'Local / Quadra': item.destino || 'Consulte a ADM',
                'Origem': item.origem_dados || 'SISTEMA'
            };
        });

        const ws = XLSX.utils.json_to_sheet(formatados);
        
        // Ajusta largura das colunas
        ws['!cols'] = [
            { wch: 5 },   // Nº
            { wch: 38 },  // Homenageado
            { wch: 14 },  // Sala
            { wch: 24 },  // Tipo de Serviço
            { wch: 18 },  // Horário
            { wch: 20 },  // Local / Quadra
            { wch: 26 }   // Origem
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Agenda do Dia');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', `attachment; filename=agenda_bosque_${dataAlvo}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (e) {
        console.error('❌ [API /api/exportar/excel] Erro:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Rota principal do Painel do Hall e Agenda (Consome dados cruzados com suporte a query ?data=YYYY-MM-DD)
app.get('/api/hall', async (req, res) => {
    try {
        const dataAlvo = req.query.data;
        const dados = await obterEventosHall(dataAlvo);
        res.json(dados);
    } catch (e) {
        console.error("❌ [API /api/hall] Erro ao consultar SQLite:", e.message);
        res.json(intuoCache || []);
    }
});

// Rota para salvar edição manual de eventos (sobrescreve campos com persistência segura)
app.post('/api/eventos/editar', async (req, res) => {
    try {
        const dados = req.body;
        if (!dados || (!dados.chave_cruzamento && !dados.nome_falecido)) {
            return res.status(400).json({ sucesso: false, erro: "Chave ou nome do homenageado é obrigatório para edição." });
        }

        const resultado = await salvarEdicaoEvento(dados);
        
        // Re-executa consolidação e avisa as TVs
        const dataAlvo = dados.data_referencia || (dados.data_inicio ? dados.data_inicio.slice(0, 10) : null);
        await executarPainelSSD(dataAlvo, false);

        res.json({ sucesso: true, mensagem: "Evento editado com sucesso!", dados: resultado });
    } catch (e) {
        console.error("❌ [API /api/eventos/editar] Erro:", e.message);
        res.status(500).json({ sucesso: false, erro: e.message });
    }
});

// Rota para restaurar padrão original da Intuo/Bubble (remove override manual)
app.post('/api/eventos/restaurar', async (req, res) => {
    try {
        const { chave_cruzamento, data_referencia } = req.body || {};
        if (!chave_cruzamento) {
            return res.status(400).json({ sucesso: false, erro: "chave_cruzamento é obrigatória" });
        }

        const resultado = await removerEdicaoEvento(chave_cruzamento);
        await executarPainelSSD(data_referencia, false);

        res.json({ sucesso: true, mensagem: "Edição revertida para os dados originais da Intuo/Bubble!", dados: resultado });
    } catch (e) {
        console.error("❌ [API /api/eventos/restaurar] Erro:", e.message);
        res.status(500).json({ sucesso: false, erro: e.message });
    }
});

// Rota para TV individual de cada Sala (Consome dados cruzados do SQLite)
app.get('/api/sala/:id', async (req, res) => {
    try {
        const numeroSala = req.params.id;
        const evento = await obterEventoPorSala(numeroSala);

        if (!evento) {
            return res.json({ status: "disponivel", sala: numeroSala });
        }

        res.json({
            status: "ocupado",
            sala: evento.sala || numeroSala,
            nome: evento.nome,
            foto: evento.foto,
            destino: evento.destino,
            tipo_servico: evento.tipo_servico,
            hora_inicio: evento.hora_inicio,
            hora_termino: evento.hora_termino,
            data_nascimento: evento.data_nascimento,
            data_falecimento: evento.data_falecimento,
            data_inicio: evento.data_inicio,
            data_fim: evento.data_fim,
            data_fim_raw: evento.data_fim_raw || evento.data_fim,
            id_memorial: evento.id_memorial || null,
            qr_code_memorial: evento.qr_code_memorial || null,
            link_memorial: evento.link_memorial || null,
            velorio_online: evento.velorio_online || null,
            origem: evento.origem_dados
        });
    } catch (e) {
        console.error("❌ [API /api/sala] Erro:", e.message);
        res.status(500).json({ status: "erro", mensagem: e.message });
    }
});

// Rota para forçar sincronização ou receber webhook
app.post('/api/sincronizar', async (req, res) => {
    try {
        const { intuo, memorial, data } = req.body || {};
        const dataAlvo = data || req.query.data;

        if (intuo && Array.isArray(intuo)) {
            await salvarEventosIntuo(intuo, dataAlvo);
        }
        if (memorial && Array.isArray(memorial)) {
            await salvarEventosMemorial(memorial, 'webhook');
        }

        const resultado = await executarPainelSSD(dataAlvo);
        res.json({ sucesso: true, data: dataAlvo || 'hoje', mensagem: "Dados sincronizados e cruzados com sucesso!", total: resultado?.length || 0 });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
});

app.get('/api/sincronizar', async (req, res) => {
    try {
        const dataAlvo = req.query.data;
        const resultado = await executarPainelSSD(dataAlvo);
        res.json({ sucesso: true, data: dataAlvo || 'hoje', mensagem: "Dados sincronizados e cruzados com sucesso!", total: resultado?.length || 0 });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: e.message });
    }
});

// Rota de diagnóstico para ver o estado das tabelas no SQLite
app.get('/api/dados-banco', (req, res) => {
    db.serialize(() => {
        db.all("SELECT COUNT(*) as total_intuo FROM intuo_eventos", [], (e1, r1) => {
            db.all("SELECT COUNT(*) as total_memorial FROM memorial_eventos", [], (e2, r2) => {
                db.all("SELECT COUNT(*) as total_consolidado FROM painel_consolidado", [], (e3, r3) => {
                    db.all("SELECT * FROM painel_consolidado", [], (e4, rowsConsolidados) => {
                        res.json({
                            status_banco: "online",
                            contadores: {
                                intuo: r1 ? r1[0].total_intuo : 0,
                                memorial: r2 ? r2[0].total_memorial : 0,
                                consolidado: r3 ? r3[0].total_consolidado : 0
                            },
                            eventos_consolidados: rowsConsolidados || []
                        });
                    });
                });
            });
        });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'painel', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor rodando na porta ${PORT} (Integrado com SQLite3 e Auto-Refresh)`));