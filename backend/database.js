const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'ssd_bosque.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco SQLite:', err.message);
    } else {
        console.log('Banco SQLite pronto em:', DB_PATH);
    }
});

function inicializarBanco() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS intuo_eventos (
                    id_intuo TEXT PRIMARY KEY,
                    protocolo TEXT,
                    nome_falecido TEXT NOT NULL,
                    tipo_servico TEXT,
                    sala_recurso TEXT,
                    destino TEXT,
                    data_inicio TEXT,
                    data_fim TEXT,
                    status TEXT,
                    data_referencia TEXT,
                    raw_json TEXT,
                    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS memorial_eventos (
                    id_memorial TEXT PRIMARY KEY,
                    nome_falecido TEXT NOT NULL,
                    sala_cerimonia TEXT,
                    foto_url TEXT,
                    local_sepultura TEXT,
                    data_inicio TEXT,
                    data_fim TEXT,
                    data_nascimento TEXT,
                    data_falecimento TEXT,
                    origem TEXT DEFAULT 'bubble',
                    visivel INTEGER DEFAULT 1,
                    raw_json TEXT,
                    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS painel_consolidado (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chave_cruzamento TEXT UNIQUE,
                    id_intuo TEXT,
                    id_memorial TEXT,
                    nome_falecido TEXT NOT NULL,
                    sala TEXT,
                    sala_normalizada TEXT,
                    foto_url TEXT,
                    destino TEXT,
                    tipo_servico TEXT,
                    data_inicio TEXT,
                    data_fim TEXT,
                    data_nascimento TEXT,
                    data_falecimento TEXT,
                    status_evento TEXT,
                    origem_dados TEXT,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`CREATE INDEX IF NOT EXISTS idx_intuo_data ON intuo_eventos(data_inicio, data_referencia)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_memorial_data ON memorial_eventos(data_inicio)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_consolidado_sala ON painel_consolidado(sala_normalizada, data_inicio)`, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

inicializarBanco();

function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
        .replace(/\(.*?\)/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizarSala(sala) {
    let s = String(sala || '').toLowerCase();
    if (s.includes('imersiva')) return '3';
    return s.replace(/\D/g, '') || s.trim();
}

const mapaNomesQuadras = {
    'PAIN II': 'PAINEIRAS II',
    'PAIN': 'PAINEIRAS',
    'PAINEIRAS II': 'PAINEIRAS II',
    'PAINEIRAS': 'PAINEIRAS',
    'FLAMBOY': 'FLAMBOYANT',
    'FLAMBOYANT': 'FLAMBOYANT',
    'BOUN': 'BOUGAINVILLE',
    'BOUGAINVILLE': 'BOUGAINVILLE',
    'ANGICO': 'ANGICO',
    'ACACIA': 'ACÁCIA',
    'ACÁCIA': 'ACÁCIA',
    'HIBISCO': 'HIBISCO',
    'IPÊ': 'IPÊ',
    'IPE': 'IPÊ',
    'FICUS': 'FICUS',
    'ANGELIM': 'ANGELIM',
    'BURITIS': 'BURITIS',
    'MANACA': 'MANACÁ',
    'MANACÁ': 'MANACÁ'
};

function formatarLocalCemiterio(texto, tipoServico) {
    if (!texto) {
        if (tipoServico && String(tipoServico).toUpperCase().includes('CREMA')) return 'Cremação';
        return 'Consulte a ACM';
    }
    let s = String(texto).trim();
    if (/^sala\s*\d+/i.test(s) || s === 'N/D' || s === 'Direto' || s === '-' || s === 'null' || s === 'Consulte a recepção' || s === 'Consulte a ACM') {
        if (tipoServico && String(tipoServico).toUpperCase().includes('CREMA')) return 'Cremação';
        return 'Consulte a ACM';
    }
    
    if (/crema[çc][ãa]o/i.test(s)) return 'Cremação';
    
    // Formato Intuo completo: "CEM: BOSQUE . QD: 13-PAIN II . SQ: 13 . JAZ: 348 . GAV: 2"
    if (s.includes('QD:')) {
        const matchQd = s.match(/QD:\s*([^.\n]+)/i);
        if (matchQd) {
            let qd = matchQd[1].trim().replace(/^\d+-/, '').trim().toUpperCase();
            return mapaNomesQuadras[qd] || qd;
        }
    }
    
    // Ex: "Quadra 16-ANGICO - Jazigo 6153" ou "Quadra ANGICO - Jazigo 6152"
    if (/jazigo/i.test(s) || /quadra/i.test(s)) {
        let parte = s;
        if (/jazigo/i.test(parte)) {
            parte = parte.split(/jazigo/i)[0].replace(/[-–\s]+$/, '');
        }
        if (/quadra/i.test(parte)) {
            parte = parte.replace(/^.*quadra\s*/i, '');
        }
        let qd = parte.trim().replace(/^\d+-/, '').trim().toUpperCase();
        if (mapaNomesQuadras[qd]) return mapaNomesQuadras[qd];
        if (qd) return qd;
    }
    
    const nomeUpper = s.toUpperCase();
    if (mapaNomesQuadras[nomeUpper]) return mapaNomesQuadras[nomeUpper];
    
    return s;
}

function salvarEventosIntuo(registrosIntuo, dataReferencia) {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(registrosIntuo) || registrosIntuo.length === 0) {
            return resolve(0);
        }

        const dataRef = dataReferencia || new Date().toISOString().split('T')[0];

        db.serialize(() => {
            db.run("DELETE FROM intuo_eventos WHERE data_referencia = ?", [dataRef]);

            const stmt = db.prepare(`
                INSERT INTO intuo_eventos (
                    id_intuo, protocolo, nome_falecido, tipo_servico,
                    sala_recurso, destino, data_inicio, data_fim,
                    status, data_referencia, raw_json, atualizado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id_intuo) DO UPDATE SET
                    protocolo = excluded.protocolo,
                    nome_falecido = excluded.nome_falecido,
                    tipo_servico = excluded.tipo_servico,
                    sala_recurso = excluded.sala_recurso,
                    destino = excluded.destino,
                    data_inicio = excluded.data_inicio,
                    data_fim = excluded.data_fim,
                    status = excluded.status,
                    data_referencia = excluded.data_referencia,
                    raw_json = excluded.raw_json,
                    atualizado_em = CURRENT_TIMESTAMP
            `);

            const agoraMs = Date.now();
            const TEMPO_MINIMO_MS = 15 * 60 * 1000;

            registrosIntuo.forEach((item, index) => {
                if (item.dt_cadastro) {
                    const dataCadMs = new Date(item.dt_cadastro).getTime();
                    if (!isNaN(dataCadMs) && (agoraMs - dataCadMs >= 0) && (agoraMs - dataCadMs < TEMPO_MINIMO_MS)) {
                        return; // Ignora tickets criados há menos de 15 minutos
                    }
                }

                const idIntuo = String(item.nm_id || item.id_origem || item.id || ('INTUO-' + dataRef + '-' + index));
                const nome = item['ch_nome_contato_relacionado_atendimento'] || item['ch_nome_contato_relacionado'] || item.nome_falecido || item.nome || item.homenageado || 'Não Informado';
                const rawTipo = String(item['ch_nome_tipo'] || item.tipo_servico || 'SEPULTAMENTO').toUpperCase();
                const servicoNome = String(item['ch_nome_serviço'] || item.servico || '').toUpperCase();
                const recurso = String(item['ch_nome_recurso'] || item.sala || item.local || '');

                let tipoFinal = rawTipo;
                let salaFinal = 'Direto';
                let destinoFinal = 'Consulte a ACM';

                if (rawTipo.includes('INUMAÇÃO DIRETA') || servicoNome.includes('INUMAÇÃO DIRETA') || rawTipo.includes('SEPULTAMENTO DIRETO')) {
                    tipoFinal = 'SEPULTAMENTO DIRETO';
                    salaFinal = 'Direto';
                    destinoFinal = formatarLocalCemiterio(recurso, tipoFinal);
                } else if (rawTipo.includes('VELÓRIO')) {
                    tipoFinal = 'VELÓRIO';
                    salaFinal = recurso.replace(/SALA\s*/i, '').trim() || recurso;
                    destinoFinal = 'Consulte a ACM';
                } else if (rawTipo.includes('INUMAÇÃO') || rawTipo.includes('SEPULTAMENTO')) {
                    tipoFinal = 'SEPULTAMENTO';
                    if (/sala\s*\d+/i.test(recurso)) {
                        salaFinal = recurso.replace(/SALA\s*/i, '').trim();
                    } else {
                        salaFinal = 'Direto';
                        destinoFinal = formatarLocalCemiterio(recurso, tipoFinal);
                    }
                } else if (rawTipo.includes('CREMAÇÃO') || servicoNome.includes('CREMAÇÃO')) {
                    tipoFinal = 'CREMAÇÃO';
                    const textoGeral = `${recurso} ${servicoNome} ${rawTipo} ${item.ch_nome_grupo_serviço || ''} ${item.ch_descrição || ''} ${item.ch_observações || ''}`;
                    const match = textoGeral.match(/sala\s*0?(\d+)/i);
                    if (match) {
                        salaFinal = match[1];
                    } else if (textoGeral.toUpperCase().includes('IMERSIVA')) {
                        salaFinal = '3';
                    } else if (recurso && !recurso.toUpperCase().includes('CREMATÓRIO') && recurso !== 'N/D' && recurso !== '-' && !recurso.toUpperCase().includes('LOCALIZAÇÃO')) {
                        salaFinal = recurso.replace(/SALA\s*/i, '').trim();
                    } else {
                        salaFinal = 'Direto';
                    }
                    destinoFinal = 'Cremação';
                }

                const inicio = item['dt_previsão_início'] || item.data_inicio || item.horario_inicio || null;
                const fim = item['dt_previsão_término'] || item.data_fim || item.horario_termino || null;
                const status = item['ch_status'] || item.status || 'Ativo';

                stmt.run(
                    idIntuo,
                    String(item.protocolo || ''),
                    nome.trim(),
                    tipoFinal,
                    salaFinal,
                    destinoFinal,
                    inicio,
                    fim,
                    status,
                    dataRef,
                    JSON.stringify(item)
                );
            });

            stmt.finalize((err) => {
                if (err) {
                    console.error('Erro ao salvar Intuo:', err.message);
                    return reject(err);
                }
                resolve(registrosIntuo.length);
            });
        });
    });
}

function salvarEventosMemorial(registrosMemorial, origem = 'bubble') {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(registrosMemorial) || registrosMemorial.length === 0) {
            return resolve(0);
        }

        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO memorial_eventos (
                    id_memorial, nome_falecido, sala_cerimonia, foto_url,
                    local_sepultura, data_inicio, data_fim, data_nascimento,
                    data_falecimento, origem, visivel, raw_json, atualizado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id_memorial) DO UPDATE SET
                    nome_falecido = excluded.nome_falecido,
                    sala_cerimonia = excluded.sala_cerimonia,
                    foto_url = excluded.foto_url,
                    local_sepultura = excluded.local_sepultura,
                    data_inicio = excluded.data_inicio,
                    data_fim = excluded.data_fim,
                    data_nascimento = excluded.data_nascimento,
                    data_falecimento = excluded.data_falecimento,
                    origem = excluded.origem,
                    visivel = excluded.visivel,
                    raw_json = excluded.raw_json,
                    atualizado_em = CURRENT_TIMESTAMP
            `);

            registrosMemorial.forEach((item, index) => {
                const idMemorial = String(item._id || item.id || item.id_memorial || ('MEM-' + index));
                const nome = item.falecido_nome || item.nome || item.nome_falecido || 'Homenageado';
                const sala = item.sala_cerimonia || item.sala || '-';
                
                let foto = item['Foto falecido'] || item.foto || item.foto_url || null;
                if (foto && typeof foto === 'string' && foto.startsWith('//')) {
                    foto = 'https:' + foto;
                }

                const rawLocal = item['local da sepultura'] || item.destino || item.local_sepultura;
                const localSepultura = formatarLocalCemiterio(rawLocal);
                const inicio = item.data_inicio || item.hora_inicio || null;
                const fim = item.data_fim || item.hora_termino || null;
                const visivel = item.visivel !== undefined ? (item.visivel ? 1 : 0) : 1;

                stmt.run(
                    idMemorial,
                    nome.trim(),
                    sala,
                    foto,
                    localSepultura,
                    inicio,
                    fim,
                    item.data_nascimento || null,
                    item.data_falecimento || null,
                    origem,
                    visivel,
                    JSON.stringify(item)
                );
            });

            stmt.finalize((err) => {
                if (err) {
                    console.error('Erro ao salvar Memorial:', err.message);
                    return reject(err);
                }
                resolve(registrosMemorial.length);
            });
        });
    });
}

function formatarHora(isoString) {
    if (!isoString) return '--:--';
    const s = String(isoString).trim();
    if (s.endsWith('Z')) {
        return new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    }
    const limpo = s.replace(/\.\d+$/, '');
    return limpo.includes('T') ? limpo.split('T')[1].slice(0, 5) : limpo.slice(0, 5);
}

function formatarData(isoString) {
    if (!isoString || isoString === 'N/A' || isoString === 'null') return '--.--.----';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).replace(/\//g, '.');
}

function extrairDataBrasil(isoString) {
    if (!isoString) return '';
    try {
        const s = String(isoString).trim();
        if (s.endsWith('Z')) {
            return new Date(s).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        }
        return s.split('T')[0].split(' ')[0];
    } catch(e) {
        return String(isoString).slice(0, 10);
    }
}

function parseParaTimestampLocal(str) {
    if (!str) return 0;
    const s = String(str).trim();
    if (s.endsWith('Z')) {
        return new Date(s).getTime();
    }
    const limpo = s.replace(/\.\d+$/, '');
    return new Date(`${limpo}-03:00`).getTime();
}

function executarCruzamentoSQLite(dataReferencia) {
    return new Promise((resolve, reject) => {
        const dataRef = dataReferencia || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        db.all('SELECT * FROM memorial_eventos WHERE visivel = 1', [], (errMem, memoriais) => {
            if (errMem) return reject(errMem);

            db.all("SELECT * FROM intuo_eventos WHERE status != 'Cancelado'", [], (errIntuo, intuos) => {
                if (errIntuo) return reject(errIntuo);

                // Filtra estritamente pelo dia do evento no fuso do Brasil (data_inicio ou data_fim)
                const memoriaisDoDia = (memoriais || []).filter(m => {
                    const dtIni = extrairDataBrasil(m.data_inicio);
                    const dtFim = extrairDataBrasil(m.data_fim);
                    return dtIni === dataRef || dtFim === dataRef;
                });

                const intuosDoDia = (intuos || []).filter(i => {
                    const dtIni = extrairDataBrasil(i.data_inicio);
                    const dtFim = extrairDataBrasil(i.data_fim);
                    return dtIni === dataRef || dtFim === dataRef;
                });

                const mapaPorPessoa = new Map();

                // 1. Agrupa memoriais do dia (Prioridade 1: Dados do Bubble)
                memoriaisDoDia.forEach(m => {
                    const nomeLimpo = normalizarTexto(m.nome_falecido);
                    const chave = nomeLimpo;

                    const destinoMemorial = formatarLocalCemiterio(m.local_sepultura);
                    const salaMemorial = (m.sala_cerimonia && m.sala_cerimonia !== 'N/D' && m.sala_cerimonia !== '-' && m.sala_cerimonia !== 'null') ? m.sala_cerimonia : 'Direto';

                    mapaPorPessoa.set(chave, {
                        chave_cruzamento: chave,
                        id_intuo: null,
                        id_memorial: m.id_memorial,
                        nome_falecido: m.nome_falecido,
                        sala: salaMemorial,
                        sala_normalizada: normalizarSala(salaMemorial),
                        foto_url: m.foto_url,
                        destino: destinoMemorial,
                        tipo_servico: 'VELÓRIO',
                        data_inicio: m.data_inicio,
                        data_fim: m.data_fim,
                        data_nascimento: m.data_nascimento || '--.--.----',
                        data_falecimento: m.data_falecimento || '--.--.----',
                        status_evento: 'Ativo',
                        origem_dados: 'MEMORIAL'
                    });
                });

                // 2. Ordena Intuo: Velórios com salas numéricas primeiro, depois velórios gerais, depois Sepultamento/Cremação, depois buffet/apoio
                const intuosOrdenados = [...intuosDoDia].sort((a, b) => {
                    const peso = (item) => {
                        let raw = {};
                        try { raw = JSON.parse(item.raw_json || '{}'); } catch(e) {}
                        const grupo = (raw.ch_nome_grupo_serviço || '').toUpperCase();
                        const tipo = (item.tipo_servico || '').toUpperCase();
                        const recurso = String(item.sala_recurso || '').toUpperCase();
                        const ehSalaNumerica = /sala\s*\d+|\b\d+\b/i.test(recurso) && !recurso.includes('IMERSIVA');
                        
                        if (ehSalaNumerica) return 1;
                        if (grupo.includes('VELÓRIO') || (item.sala_recurso && item.sala_recurso !== 'Direto')) return 2;
                        if (grupo.includes('SEPULTAMENTO') || tipo.includes('SEPULTAMENTO') || tipo.includes('CREMA')) return 3;
                        return 4;
                    };
                    return peso(a) - peso(b);
                });

                // 3. Cruza com os eventos da Intuo do dia
                intuosOrdenados.forEach(i => {
                    const nomeLimpo = normalizarTexto(i.nome_falecido);
                    const chave = nomeLimpo;

                    let raw = {};
                    try { raw = JSON.parse(i.raw_json || '{}'); } catch(e) {}
                    const grupoServico = (raw.ch_nome_grupo_serviço || '').toUpperCase();
                    const nomeServico = (raw.ch_nome_serviço || '').toUpperCase();
                    const ehBuffetOuApoio = grupoServico.includes('BUFFET') || nomeServico.includes('KIT LANCHE') || nomeServico.includes('CAFETERIA');

                    const ehVelorio = (grupoServico.includes('VELÓRIO') || nomeServico.includes('SALA DE CERIMÔNIA') || (i.sala_recurso && i.sala_recurso !== 'Direto')) && !ehBuffetOuApoio;
                    const ehCremacao = (i.tipo_servico && i.tipo_servico.includes('CREMA')) || nomeServico.includes('CREMAÇÃO');
                    const ehSepultamento = (grupoServico.includes('SEPULTAMENTO') || (i.tipo_servico && (i.tipo_servico.includes('SEPULTAMENTO') || i.tipo_servico.includes('INUMAÇÃO'))));

                    if (mapaPorPessoa.has(chave)) {
                        const reg = mapaPorPessoa.get(chave);
                        reg.id_intuo = i.id_intuo || reg.id_intuo;
                        reg.origem_dados = reg.id_memorial ? 'CRUZADO (MEMORIAL + INTUO)' : 'INTUO';

                        if (ehVelorio) {
                            reg.tipo_servico = 'VELÓRIO';
                            const salaAtualEhNumerica = /sala\s*\d+|\b\d+\b/i.test(String(reg.sala || '')) && !String(reg.sala || '').toUpperCase().includes('IMERSIVA');
                            const novaSalaEhNumerica = /sala\s*\d+|\b\d+\b/i.test(String(i.sala_recurso || '')) && !String(i.sala_recurso || '').toUpperCase().includes('IMERSIVA');

                            if (i.sala_recurso && i.sala_recurso !== 'Direto') {
                                if (!salaAtualEhNumerica || novaSalaEhNumerica || reg.sala === 'Direto') {
                                    reg.sala = i.sala_recurso;
                                    reg.sala_normalizada = normalizarSala(i.sala_recurso);
                                }
                            }
                            if (i.data_inicio && (!reg.data_inicio || reg.origem_dados === 'INTUO')) {
                                reg.data_inicio = i.data_inicio;
                            }
                            if (i.data_fim && (!reg.data_fim || reg.origem_dados === 'INTUO')) {
                                reg.data_fim = i.data_fim;
                            }
                        }

                        if (ehCremacao) {
                            reg.destino = 'Cremação';
                        } else if (ehSepultamento) {
                            const destIntuo = formatarLocalCemiterio(i.destino, 'SEPULTAMENTO');
                            if (destIntuo && destIntuo !== 'Consulte a ACM') {
                                reg.destino = destIntuo;
                            }
                        }
                    } else {
                        if (ehBuffetOuApoio) return; // Não gera entrada solta para serviços de alimentação

                        const ehDireto = !i.sala_recurso || i.sala_recurso === 'Direto' || !ehVelorio;
                        let tipoServicoFinal = ehVelorio ? 'VELÓRIO' : (ehCremacao ? 'CREMAÇÃO' : (ehDireto ? 'SEPULTAMENTO DIRETO' : i.tipo_servico));
                        let destFinal = ehCremacao ? 'Cremação' : formatarLocalCemiterio(i.destino, tipoServicoFinal);

                        mapaPorPessoa.set(chave, {
                            chave_cruzamento: chave,
                            id_intuo: i.id_intuo,
                            id_memorial: null,
                            nome_falecido: i.nome_falecido,
                            sala: ehDireto ? 'Direto' : i.sala_recurso,
                            sala_normalizada: ehDireto ? 'direto' : normalizarSala(i.sala_recurso),
                            foto_url: null,
                            destino: destFinal,
                            tipo_servico: tipoServicoFinal,
                            data_inicio: i.data_inicio,
                            data_fim: i.data_fim,
                            data_nascimento: '--.--.----',
                            data_falecimento: '--.--.----',
                            status_evento: i.status || 'Ativo',
                            origem_dados: 'INTUO'
                        });
                    }
                });

                const listaFinal = Array.from(mapaPorPessoa.values()).filter(item => {
                    const tipo = String(item.tipo_servico || '').toUpperCase();
                    const dest = String(item.destino || '').toUpperCase();
                    const salaNorm = String(item.sala_normalizada || '').toLowerCase();
                    const sala = String(item.sala || '').trim().toLowerCase();
                    const ehSemSala = !sala || sala === 'direto' || salaNorm === 'direto' || sala === 'n/d' || sala === '-' || sala === 'null';

                    // Regra: toda cremação que for direta e não associada a velório não aparece
                    const ehCremacao = tipo.includes('CREMA') || dest.includes('CREMA');
                    const ehVelorio = tipo.includes('VELÓRIO') || (!ehSemSala && item.id_memorial);

                    if (ehCremacao && ehSemSala && !ehVelorio) {
                        return false;
                    }

                    return true;
                });

                db.serialize(() => {
                    db.run('DELETE FROM painel_consolidado');

                    const stmt = db.prepare(`
                        INSERT INTO painel_consolidado (
                            chave_cruzamento, id_intuo, id_memorial, nome_falecido,
                            sala, sala_normalizada, foto_url, destino, tipo_servico,
                            data_inicio, data_fim, data_nascimento, data_falecimento,
                            status_evento, origem_dados, atualizado_em
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `);

                    listaFinal.forEach(item => {
                        stmt.run(
                            item.chave_cruzamento,
                            item.id_intuo,
                            item.id_memorial,
                            item.nome_falecido,
                            item.sala,
                            item.sala_normalizada,
                            item.foto_url,
                            item.destino,
                            item.tipo_servico,
                            item.data_inicio,
                            item.data_fim,
                            item.data_nascimento,
                            item.data_falecimento,
                            item.status_evento,
                            item.origem_dados
                        );
                    });

                    stmt.finalize((errFinal) => {
                        if (errFinal) return reject(errFinal);
                        console.log('✨ [SQLITE] Cruzamento finalizado: ' + listaFinal.length + ' registros consolidados.');
                        resolve(listaFinal);
                    });
                });
            });
        });
    });
}

function obterEventosHall() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                nome_falecido AS nome,
                sala,
                foto_url AS foto,
                destino,
                tipo_servico,
                data_inicio,
                data_fim,
                data_nascimento,
                data_falecimento,
                origem_dados
            FROM painel_consolidado
            ORDER BY data_inicio ASC
        `, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function obterEventoPorSala(numeroSala, horaReferencia = new Date()) {
    return new Promise((resolve, reject) => {
        const salaLimpa = normalizarSala(numeroSala);
        db.all(`
            SELECT 
                nome_falecido AS nome,
                sala,
                foto_url AS foto,
                destino,
                tipo_servico,
                data_inicio,
                data_fim,
                data_nascimento,
                data_falecimento,
                origem_dados
            FROM painel_consolidado
            WHERE sala_normalizada = ? OR sala = ?
            ORDER BY data_inicio ASC
        `, [salaLimpa, String(numeroSala)], (err, rows) => {
            if (err) return reject(err);
            if (!rows || rows.length === 0) return resolve(null);

            const eventosDaSala = [...rows].sort((a, b) => {
                const tA = parseParaTimestampLocal(a.data_inicio);
                const tB = parseParaTimestampLocal(b.data_inicio);
                return tA - tB;
            });

            const agoraMs = (horaReferencia instanceof Date ? horaReferencia.getTime() : parseParaTimestampLocal(horaReferencia));
            const MARGEM_PREPARACAO_MS = 45 * 60 * 1000; // 45 min antes do início
            const TOLERANCIA_ENCERRAMENTO_MS = 20 * 60 * 1000; // 20 min após término

            // Procura o evento ativo ou em preparação no momento
            const eventoAtivo = eventosDaSala.find(e => {
                if (!e.data_inicio || !e.data_fim) return false;
                const ini = parseParaTimestampLocal(e.data_inicio);
                const fim = parseParaTimestampLocal(e.data_fim);
                return agoraMs >= (ini - MARGEM_PREPARACAO_MS) && agoraMs <= (fim + TOLERANCIA_ENCERRAMENTO_MS);
            });

            // Se não houver velório ativo no momento (intervalo entre reservas ou antes/depois da agenda)
            if (!eventoAtivo) {
                return resolve(null);
            }

            const horaInicio = formatarHora(eventoAtivo.data_inicio);
            const horaTermino = formatarHora(eventoAtivo.data_fim);
            const dataNasc = formatarData(eventoAtivo.data_nascimento);
            const dataFalec = formatarData(eventoAtivo.data_falecimento);

            resolve({
                ...eventoAtivo,
                hora_inicio: horaInicio,
                hora_termino: horaTermino,
                data_nascimento: dataNasc,
                data_falecimento: dataFalec,
                data_fim_raw: eventoAtivo.data_fim
            });
        });
    });
}

module.exports = {
    db,
    inicializarBanco,
    salvarEventosIntuo,
    salvarEventosMemorial,
    executarCruzamentoSQLite,
    obterEventosHall,
    obterEventoPorSala
};