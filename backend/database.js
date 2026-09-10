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
                    qr_code_memorial TEXT,
                    link_memorial TEXT,
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
                    qr_code_memorial TEXT,
                    link_memorial TEXT,
                    destino TEXT,
                    tipo_servico TEXT,
                    data_inicio TEXT,
                    data_fim TEXT,
                    data_nascimento TEXT,
                    data_falecimento TEXT,
                    status_evento TEXT,
                    origem_dados TEXT,
                    editado_manualmente INTEGER DEFAULT 0,
                    visivel INTEGER DEFAULT 1,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS eventos_edicoes (
                    id_edicao INTEGER PRIMARY KEY AUTOINCREMENT,
                    chave_cruzamento TEXT UNIQUE,
                    id_intuo TEXT,
                    id_memorial TEXT,
                    nome_falecido TEXT,
                    sala TEXT,
                    sala_normalizada TEXT,
                    destino TEXT,
                    tipo_servico TEXT,
                    data_inicio TEXT,
                    data_fim TEXT,
                    velorio_online TEXT,
                    foto_url TEXT,
                    link_memorial TEXT,
                    visivel INTEGER DEFAULT 1,
                    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Migrações seguras caso o arquivo SQLite já exista
            db.run(`ALTER TABLE memorial_eventos ADD COLUMN qr_code_memorial TEXT`, () => {});
            db.run(`ALTER TABLE memorial_eventos ADD COLUMN link_memorial TEXT`, () => {});
            db.run(`ALTER TABLE intuo_eventos ADD COLUMN velorio_online TEXT`, () => {});
            db.run(`ALTER TABLE painel_consolidado ADD COLUMN qr_code_memorial TEXT`, () => {});
            db.run(`ALTER TABLE painel_consolidado ADD COLUMN link_memorial TEXT`, () => {});
            db.run(`ALTER TABLE painel_consolidado ADD COLUMN velorio_online TEXT`, () => {});
            db.run(`ALTER TABLE painel_consolidado ADD COLUMN editado_manualmente INTEGER DEFAULT 0`, () => {});
            db.run(`ALTER TABLE painel_consolidado ADD COLUMN visivel INTEGER DEFAULT 1`, () => {});

            // Limpeza preventiva de registros de PET
            db.run(`DELETE FROM intuo_eventos WHERE tipo_servico LIKE '%PET%' OR sala_recurso LIKE '%PET%' OR raw_json LIKE '%"ch_nome_tipo":"%PET%' OR raw_json LIKE '%"ch_nome_serviço":"%PET%' OR raw_json LIKE '%"ch_nome_grupo_serviço":"%PET%' OR raw_json LIKE '%"ch_nome_recurso":"%PET%'`, () => {});
            db.run(`DELETE FROM painel_consolidado WHERE tipo_servico LIKE '%PET%' OR sala LIKE '%PET%' OR destino LIKE '%PET%'`, () => {});

            db.run(`CREATE INDEX IF NOT EXISTS idx_intuo_data ON intuo_eventos(data_inicio, data_referencia)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_memorial_data ON memorial_eventos(data_inicio)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_edicoes_chave ON eventos_edicoes(chave_cruzamento)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_consolidado_sala ON painel_consolidado(sala_normalizada, data_inicio)`, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

inicializarBanco();

function ehServicoPet(item, raw) {
    if (!item) return false;
    let rawObj = raw;
    if (!rawObj && item.raw_json) {
        try {
            rawObj = typeof item.raw_json === 'string' ? JSON.parse(item.raw_json) : item.raw_json;
        } catch (e) {
            rawObj = {};
        }
    }
    rawObj = rawObj || {};

    const tipo = String(rawObj.ch_nome_tipo || item.tipo_servico || item.tipo || '').toUpperCase();
    const servico = String(rawObj.ch_nome_serviço || item.servico || item.nome_servico || '').toUpperCase();
    const grupo = String(rawObj.ch_nome_grupo_serviço || item.grupo_servico || '').toUpperCase();
    const recurso = String(rawObj.ch_nome_recurso || item.sala_recurso || item.sala || '').toUpperCase();
    const obs = String(rawObj.ch_observações || item.observacoes || '').toUpperCase();
    const dest = String(item.destino || '').toUpperCase();

    // Identifica se o serviço é Cremação PET ou qualquer atendimento PET
    if (
        tipo.includes('PET') ||
        servico.includes('PET') ||
        grupo.includes('PET') ||
        recurso.includes('PET') ||
        obs.includes('PLANO PET') ||
        dest.includes('PET')
    ) {
        return true;
    }
    return false;
}

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

function calcularSimilaridade(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const s1 = String(str1).toLowerCase().trim();
    const s2 = String(str2).toLowerCase().trim();
    if (s1 === s2) return 1;

    // Se uma string contém a outra e o tamanho é muito próximo
    if (s1.includes(s2) || s2.includes(s1)) {
        const proporcao = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
        if (proporcao >= 0.75) return proporcao;
    }

    const len1 = s1.length;
    const len2 = s2.length;
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deleção
                matrix[i][j - 1] + 1,      // inserção
                matrix[i - 1][j - 1] + cost // substituição
            );
        }
    }

    const distancia = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : 1 - (distancia / maxLen);
}

function buscarChaveNoMapa(chaveBusca, salaBusca, mapaPorPessoa) {
    if (!chaveBusca) return null;
    if (mapaPorPessoa.has(chaveBusca)) return chaveBusca;

    const salaBuscaNorm = normalizarSala(salaBusca);
    const tokensBusca = chaveBusca.split(' ').filter(t => t.length > 2);
    const primeiroNome = tokensBusca[0] || '';
    const ultimoNome = tokensBusca[tokensBusca.length - 1] || '';

    let melhorChave = null;
    let maiorSimilaridade = 0;

    for (const [chaveExistente, regExistente] of mapaPorPessoa.entries()) {
        const sim = calcularSimilaridade(chaveBusca, chaveExistente);
        const salaExistenteNorm = normalizarSala(regExistente.sala);
        const mesmaSala = Boolean(salaBuscaNorm && salaExistenteNorm && salaBuscaNorm !== 'direto' && salaBuscaNorm === salaExistenteNorm);

        const tokensExistente = chaveExistente.split(' ').filter(t => t.length > 2);
        const primeiroNomeEx = tokensExistente[0] || '';
        const ultimoNomeEx = tokensExistente[tokensExistente.length - 1] || '';
        const mesmoPrimeiroEUltimo = (primeiroNome && primeiroNome === primeiroNomeEx) && (ultimoNome && ultimoNome === ultimoNomeEx);

        // Caso 1: Mesma sala e primeiro + último nome iguais (ex: Luiz ... Silveira na Sala 7) -> Match certo
        if (mesmaSala && mesmoPrimeiroEUltimo) {
            return chaveExistente;
        }

        // Caso 2: Mesma sala e similaridade >= 0.70
        if (mesmaSala && sim >= 0.70) {
            if (sim > maiorSimilaridade) {
                maiorSimilaridade = sim;
                melhorChave = chaveExistente;
            }
        }

        // Caso 3: Similaridade alta >= 0.85 mesmo que sem sala
        if (sim >= 0.85) {
            if (sim > maiorSimilaridade) {
                maiorSimilaridade = sim;
                melhorChave = chaveExistente;
            }
        }
    }

    if (melhorChave && (maiorSimilaridade >= 0.70 || (salaBuscaNorm && salaBuscaNorm !== 'direto'))) {
        return melhorChave;
    }

    return null;
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
        if (tipoServico && String(tipoServico).toUpperCase().includes('CREMA')) return 'CREMAÇÃO';
        return 'CONSULTE A ADM';
    }
    let s = String(texto).trim();
    if (/^sala\s*\d+/i.test(s) || s === 'N/D' || s === 'Direto' || s === '-' || s === '--' || s === 'null' || s === 'Consulte a recepção' || s === 'Consulte a ACM' || s === 'Consulte a ADM') {
        if (tipoServico && String(tipoServico).toUpperCase().includes('CREMA')) return 'CREMAÇÃO';
        return 'CONSULTE A ADM';
    }
    
    if (/crema[çc][ãa]o/i.test(s)) return 'CREMAÇÃO';
    
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

function salvarEventosIntuo(registrosIntuo, dataReferenciaPadrao) {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(registrosIntuo) || registrosIntuo.length === 0) {
            return resolve(0);
        }

        const dataRefPadrao = dataReferenciaPadrao || new Date().toISOString().split('T')[0];

        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO intuo_eventos (
                    id_intuo, protocolo, nome_falecido, tipo_servico,
                    sala_recurso, destino, data_inicio, data_fim,
                    status, data_referencia, velorio_online, raw_json, atualizado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                    velorio_online = excluded.velorio_online,
                    raw_json = excluded.raw_json,
                    atualizado_em = CURRENT_TIMESTAMP
            `);

            const agoraMs = Date.now();
            const TEMPO_MINIMO_MS = 15 * 60 * 1000;

            registrosIntuo.forEach((item, index) => {
                if (ehServicoPet(item)) {
                    return; // Não processa nem salva Cremação PET ou serviços de pets
                }

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
                let salaFinal = 'DIRETO';
                let destinoFinal = 'CONSULTE A ADM';

                if (rawTipo.includes('INUMAÇÃO DIRETA') || servicoNome.includes('INUMAÇÃO DIRETA') || rawTipo.includes('SEPULTAMENTO DIRETO')) {
                    tipoFinal = 'SEPULTAMENTO DIRETO';
                    salaFinal = 'DIRETO';
                    destinoFinal = formatarLocalCemiterio(recurso, tipoFinal);
                } else if (rawTipo.includes('VELÓRIO')) {
                    tipoFinal = 'VELÓRIO';
                    salaFinal = recurso.replace(/SALA\s*/i, '').trim() || recurso;
                    destinoFinal = 'CONSULTE A ADM';
                } else if (rawTipo.includes('INUMAÇÃO') || rawTipo.includes('SEPULTAMENTO')) {
                    tipoFinal = 'SEPULTAMENTO';
                    if (/sala\s*\d+/i.test(recurso)) {
                        salaFinal = recurso.replace(/SALA\s*/i, '').trim();
                    } else {
                        salaFinal = 'DIRETO';
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
                        salaFinal = 'DIRETO';
                    }
                    destinoFinal = 'CREMAÇÃO';
                }

                // Identifica se há Velório On-line / Transmissão cadastrada na Intuo
                let velorioOnline = null;
                if (item.velorio_online && typeof item.velorio_online === 'string' && item.velorio_online.trim().length > 3) {
                    velorioOnline = item.velorio_online.trim();
                } else if (item.link_transmissao && typeof item.link_transmissao === 'string' && item.link_transmissao.trim().length > 3) {
                    velorioOnline = item.link_transmissao.trim();
                } else if (item.link_velorio_online && typeof item.link_velorio_online === 'string' && item.link_velorio_online.trim().length > 3) {
                    velorioOnline = item.link_velorio_online.trim();
                } else if (item.url_transmissao && typeof item.url_transmissao === 'string' && item.url_transmissao.trim().length > 3) {
                    velorioOnline = item.url_transmissao.trim();
                } else {
                    const textoBusca = `${item.ch_observações || ''} ${item.ch_descrição || ''} ${item.ch_detalhes_painel || ''} ${item.ch_nome_serviço || ''} ${item.ch_nome_grupo_serviço || ''}`;
                    const urlMatch = textoBusca.match(/https?:\/\/[^\s"'<>]+(?:adiau|transmissao|stream|aovivo|camera)[^\s"'<>]+/i);
                    if (urlMatch) {
                        velorioOnline = urlMatch[0];
                    } else if (/vel[oó]rio\s*(?:on-?line|ao\s*vivo)|transmiss[aã]o\s*ao\s*vivo/i.test(textoBusca)) {
                        velorioOnline = "https://www.adiau.com.br/embed/?hash=beFS6qSdk8HJKlKV5gqzYh93#!";
                    }
                }

                const inicio = item['dt_previsão_início'] || item.data_inicio || item.horario_inicio || null;
                const fim = item['dt_previsão_término'] || item.data_fim || item.horario_termino || null;
                const status = item['ch_status'] || item.status || 'Ativo';
                const itemDataRef = extrairDataBrasil(inicio) || extrairDataBrasil(fim) || dataRefPadrao;

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
                    itemDataRef,
                    velorioOnline,
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
                    qr_code_memorial, link_memorial, local_sepultura,
                    data_inicio, data_fim, data_nascimento,
                    data_falecimento, origem, visivel, raw_json, atualizado_em
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id_memorial) DO UPDATE SET
                    nome_falecido = excluded.nome_falecido,
                    sala_cerimonia = excluded.sala_cerimonia,
                    foto_url = excluded.foto_url,
                    qr_code_memorial = excluded.qr_code_memorial,
                    link_memorial = excluded.link_memorial,
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

                let qrMemorial = item.qrcode || item.qr_code || item.qrCode || null;
                if (qrMemorial && typeof qrMemorial === 'string' && !qrMemorial.startsWith('data:') && !qrMemorial.startsWith('http')) {
                    qrMemorial = 'data:image/png;base64,' + qrMemorial;
                }

                const linkMemorial = item.link_memorial || item.url || (item.Slug ? `https://memorialbosque.com.br/memorial/${item.Slug}` : (idMemorial ? `https://memorialbosque.com.br/memorial/${idMemorial}` : null));

                const rawLocal = item['local da sepultura'] || item.destino || item.local_sepultura;
                const localSepultura = formatarLocalCemiterio(rawLocal);
                const inicio = item.data_inicio || item.hora_inicio || null;
                const fim = item.data_fim || item.hora_termino || null;
                const ehArquivado = item.arquivado === true || item.arquivado === 'true' || item.arquivado === 1;
                const visivel = (item.visivel !== undefined ? (item.visivel ? 1 : 0) : 1) && (!ehArquivado ? 1 : 0);

                stmt.run(
                    idMemorial,
                    nome.trim(),
                    sala,
                    foto,
                    qrMemorial,
                    linkMemorial,
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

function diagnosticarCruzamento(dataReferencia, memoriaisDoDia, intuosDoDia, mapaPorPessoa, listaFinal) {

    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              🔎 DIAGNÓSTICO INTUO × BUBBLE                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    console.log('\n📅 DATA DE REFERÊNCIA:', dataReferencia);

    // ============================================================
    // 1. RESUMO
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 1. RESUMO ━━━━━━━━━━━━━━');

    console.log('Bubble do dia:', memoriaisDoDia.length);
    console.log('Intuo do dia:', intuosDoDia.length);
    console.log('Mapa após cruzamento:', mapaPorPessoa.size);
    console.log('Lista final:', listaFinal.length);

    // ============================================================
    // 2. BUBBLE
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 2. BUBBLE ━━━━━━━━━━━━━━');

    memoriaisDoDia.forEach((m, index) => {
        console.log(
            `[BUBBLE ${index + 1}]`,
            {
                id_memorial: m.id_memorial,
                nome: m.nome_falecido,
                sala: m.sala_cerimonia,
                inicio: m.data_inicio,
                fim: m.data_fim,
                destino: m.local_sepultura
            }
        );
    });

    // ============================================================
    // 3. INTUO
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 3. INTUO ━━━━━━━━━━━━━━');

    intuosDoDia.forEach((i, index) => {

        let raw = {};

        try {
            raw = JSON.parse(i.raw_json || '{}');
        } catch (e) {}

        const grupoServico =
            String(raw.ch_nome_grupo_serviço || '').toUpperCase();

        const nomeServico =
            String(raw.ch_nome_serviço || '').toUpperCase();

        const nomeNormalizado =
            normalizarTexto(i.nome_falecido);

        const existeNoBubble =
            memoriaisDoDia.some(m =>
                normalizarTexto(m.nome_falecido) === nomeNormalizado
            );

        console.log(
            `[INTUO ${index + 1}]`,
            {
                id_intuo: i.id_intuo,
                nome: i.nome_falecido,
                nome_normalizado: nomeNormalizado,

                existe_no_bubble: existeNoBubble,

                tipo: i.tipo_servico,
                grupo_servico: grupoServico,
                nome_servico: nomeServico,

                sala: i.sala_recurso,

                inicio: i.data_inicio,
                fim: i.data_fim,

                destino: i.destino,

                status: i.status,

                velorio_online: i.velorio_online
            }
        );
    });

    // ============================================================
    // 4. ANALISA CADA INTUO
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 4. RASTREAMENTO INTUO ━━━━━━━━━━━━━━');

    intuosDoDia.forEach((i, index) => {

        const nomeNormalizado =
            normalizarTexto(i.nome_falecido);

        const chave = nomeNormalizado;

        const existeNoMapaAntes =
            mapaPorPessoa.has(chave);

        let raw = {};

        try {
            raw = JSON.parse(i.raw_json || '{}');
        } catch (e) {}

        const grupoServico =
            String(raw.ch_nome_grupo_serviço || '').toUpperCase();

        const nomeServico =
            String(raw.ch_nome_serviço || '').toUpperCase();

        const ehBuffetOuApoio =
            grupoServico.includes('BUFFET') ||
            nomeServico.includes('KIT LANCHE') ||
            nomeServico.includes('CAFETERIA');

        const ehVelorio =
            (
                grupoServico.includes('VELÓRIO') ||
                nomeServico.includes('SALA DE CERIMÔNIA') ||
                (
                    i.sala_recurso &&
                    i.sala_recurso !== 'Direto'
                )
            ) &&
            !ehBuffetOuApoio;

        const ehCremacao =
            (i.tipo_servico &&
                i.tipo_servico.includes('CREMA')) ||
            nomeServico.includes('CREMAÇÃO');

        const ehSepultamento =
            grupoServico.includes('SEPULTAMENTO') ||
            (
                i.tipo_servico &&
                (
                    i.tipo_servico.includes('SEPULTAMENTO') ||
                    i.tipo_servico.includes('INUMAÇÃO')
                )
            );

        console.log('\n────────────────────────────────────────');

        console.log(`🔎 INTUO #${index + 1}`);

        console.log('Nome:', i.nome_falecido);
        console.log('Chave:', chave);

        console.log('Existe no mapa:', existeNoMapaAntes);

        console.log('Buffet/Apoio:', ehBuffetOuApoio);
        console.log('É Velório:', ehVelorio);
        console.log('É Cremação:', ehCremacao);
        console.log('É Sepultamento:', ehSepultamento);

        if (ehBuffetOuApoio) {

            console.log(
                '🚫 RESULTADO: IGNORADO COMO BUFFET/APOIO'
            );

            return;
        }

        if (existeNoMapaAntes) {

            const registro = mapaPorPessoa.get(chave);

            console.log(
                '🔗 RESULTADO: CRUZADO COM BUBBLE'
            );

            console.log({
                id_memorial: registro.id_memorial,
                id_intuo: registro.id_intuo,
                origem: registro.origem_dados
            });

        } else {

            console.log(
                '🆕 RESULTADO: REGISTRO EXCLUSIVO DA INTUO'
            );

            console.log(
                '⚠️ Este registro deveria criar uma entrada independente.'
            );
        }
    });

    // ============================================================
    // 5. MAPA FINAL
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 5. MAPA FINAL ━━━━━━━━━━━━━━');

    Array.from(mapaPorPessoa.values()).forEach((item, index) => {

        console.log(`[MAPA ${index + 1}]`, {
            nome: item.nome_falecido,

            id_memorial: item.id_memorial,
            id_intuo: item.id_intuo,

            origem: item.origem_dados,

            tipo: item.tipo_servico,

            sala: item.sala,
            sala_normalizada: item.sala_normalizada,

            inicio: item.data_inicio,
            fim: item.data_fim,

            destino: item.destino
        });
    });

    // ============================================================
    // 6. ANALISA O FILTRO FINAL
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 6. FILTRO FINAL ━━━━━━━━━━━━━━');

    Array.from(mapaPorPessoa.values()).forEach(item => {

        const tipo =
            String(item.tipo_servico || '').toUpperCase();

        const dest =
            String(item.destino || '').toUpperCase();

        const salaNorm =
            String(item.sala_normalizada || '').toLowerCase();

        const sala =
            String(item.sala || '').trim().toLowerCase();

        const ehSemSala =
            !sala ||
            sala === 'direto' ||
            salaNorm === 'direto' ||
            sala === 'n/d' ||
            sala === '-' ||
            sala === 'null';

        const ehCremacao =
            tipo.includes('CREMA') ||
            dest.includes('CREMA');

        const ehVelorio =
            tipo.includes('VELÓRIO') ||
            (!ehSemSala && item.id_memorial);

        const seriaRemovido =
            ehCremacao &&
            ehSemSala &&
            !ehVelorio;

        if (seriaRemovido) {

            console.log(
                '❌ REMOVIDO DO PAINEL:',
                {
                    nome: item.nome_falecido,
                    id_intuo: item.id_intuo,
                    id_memorial: item.id_memorial,
                    origem: item.origem_dados,

                    tipo: item.tipo_servico,
                    destino: item.destino,

                    sala: item.sala,
                    sala_normalizada: item.sala_normalizada,

                    motivo:
                        'CREMAÇÃO DIRETA SEM SALA E SEM VELÓRIO'
                }
            );

        } else {

            console.log(
                '✅ PASSOU PELO FILTRO:',
                {
                    nome: item.nome_falecido,
                    id_intuo: item.id_intuo,
                    id_memorial: item.id_memorial,
                    origem: item.origem_dados
                }
            );
        }
    });

    // ============================================================
    // 7. SOMENTE INTUO
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 7. INTUO SOMENTE ━━━━━━━━━━━━━━');

    const somenteIntuo =
        Array.from(mapaPorPessoa.values())
            .filter(item =>
                item.id_intuo &&
                !item.id_memorial
            );

    console.log(
        `Encontrados ${somenteIntuo.length} registros exclusivos da Intuo.`
    );

    somenteIntuo.forEach(item => {

        const apareceNaListaFinal =
            listaFinal.some(
                final =>
                    final.id_intuo === item.id_intuo
            );

        console.log({
            nome: item.nome_falecido,
            id_intuo: item.id_intuo,

            tipo: item.tipo_servico,
            sala: item.sala,

            aparece_na_lista_final:
                apareceNaListaFinal,

            status:
                apareceNaListaFinal
                    ? '✅ SERÁ EXIBIDO'
                    : '❌ NÃO CHEGOU AO PAINEL'
        });
    });

    // ============================================================
    // 8. INTUO QUE ESTÁ NO BANCO MAS NÃO ESTÁ NO MAPA
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 8. INTUO PERDIDA NO CRUZAMENTO ━━━━━━━━━━━━━━');

    intuosDoDia.forEach(i => {

        const chave =
            normalizarTexto(i.nome_falecido);

        const registro =
            mapaPorPessoa.get(chave);

        const existeNoMapa =
            !!registro;

        const correspondeAoRegistro =
            registro &&
            registro.id_intuo === i.id_intuo;

        if (!existeNoMapa || !correspondeAoRegistro) {

            console.log(
                '🚨 POSSÍVEL REGISTRO PERDIDO:',
                {
                    nome: i.nome_falecido,
                    id_intuo: i.id_intuo,
                    chave,

                    existe_no_mapa: existeNoMapa,

                    registro_atual_no_mapa:
                        registro
                            ? {
                                nome: registro.nome_falecido,
                                id_intuo: registro.id_intuo,
                                id_memorial: registro.id_memorial,
                                origem: registro.origem_dados
                            }
                            : null
                }
            );
        }
    });

    // ============================================================
    // 9. RESULTADO FINAL
    // ============================================================

    console.log('\n━━━━━━━━━━━━━━ 9. RESULTADO FINAL ━━━━━━━━━━━━━━');

    const finalIntuo =
        listaFinal.filter(item =>
            item.id_intuo
        );

    const finalBubble =
        listaFinal.filter(item =>
            item.id_memorial
        );

    const finalCruzados =
        listaFinal.filter(item =>
            item.id_intuo &&
            item.id_memorial
        );

    const finalSomenteIntuo =
        listaFinal.filter(item =>
            item.id_intuo &&
            !item.id_memorial
        );

    console.log({
        total_painel: listaFinal.length,

        registros_com_intuo:
            finalIntuo.length,

        registros_com_bubble:
            finalBubble.length,

        cruzados:
            finalCruzados.length,

        somente_intuo:
            finalSomenteIntuo.length
    });

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                 🏁 FIM DO DIAGNÓSTICO                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

function executarCruzamentoSQLite(dataReferencia) {
    return new Promise((resolve, reject) => {
        const dataRef = dataReferencia || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        db.all('SELECT * FROM memorial_eventos', [], (errMem, memoriais) => {
            if (errMem) return reject(errMem);

            db.all("SELECT * FROM intuo_eventos WHERE status != 'Cancelado'", [], (errIntuo, intuos) => {
                if (errIntuo) return reject(errIntuo);

                db.all("SELECT * FROM eventos_edicoes", [], (errEd, edicoes) => {
                    if (errEd) return reject(errEd);

                    // Filtra estritamente pelo dia do evento no fuso do Brasil (data_inicio ou data_fim)
                    const memoriaisDoDia = (memoriais || []).filter(m => {
                        const dtIni = extrairDataBrasil(m.data_inicio);
                        const dtFim = extrairDataBrasil(m.data_fim);
                        return dtIni === dataRef || dtFim === dataRef;
                    });

                    const intuosDoDia = (intuos || []).filter(i => {
                        if (ehServicoPet(i)) return false;
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
                            qr_code_memorial: m.qr_code_memorial,
                            link_memorial: m.link_memorial,
                            velorio_online: null,
                            destino: destinoMemorial,
                            tipo_servico: 'VELÓRIO',
                            data_inicio: m.data_inicio,
                            data_fim: m.data_fim,
                            data_nascimento: m.data_nascimento || '--.--.----',
                            data_falecimento: m.data_falecimento || '--.--.----',
                            status_evento: 'Ativo',
                            origem_dados: 'MEMORIAL',
                            editado_manualmente: 0,
                            visivel: 1
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

                        const chaveEncontrada = buscarChaveNoMapa(chave, i.sala_recurso, mapaPorPessoa);

                        if (chaveEncontrada) {
                            const reg = mapaPorPessoa.get(chaveEncontrada);
                            reg.id_intuo = i.id_intuo || reg.id_intuo;
                            reg.origem_dados = reg.id_memorial ? 'CRUZADO (MEMORIAL + INTUO)' : 'INTUO';

                            if (i.velorio_online) {
                                reg.velorio_online = i.velorio_online;
                            }

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
                                qr_code_memorial: null,
                                link_memorial: null,
                                velorio_online: i.velorio_online || null,
                                destino: destFinal,
                                tipo_servico: tipoServicoFinal,
                                data_inicio: i.data_inicio,
                                data_fim: i.data_fim,
                                data_nascimento: '--.--.----',
                                data_falecimento: '--.--.----',
                                status_evento: i.status || 'Ativo',
                                origem_dados: 'INTUO',
                                editado_manualmente: 0,
                                visivel: 1
                            });
                        }
                    });

                    // 4. Aplica Overrides e Edições Manuais (Persistência Segura)
                    const mapaEdicoes = new Map();
                    (edicoes || []).forEach(ed => {
                        if (ed.chave_cruzamento) mapaEdicoes.set(ed.chave_cruzamento, ed);
                        if (ed.id_intuo) mapaEdicoes.set(`intuo_${ed.id_intuo}`, ed);
                        if (ed.id_memorial) mapaEdicoes.set(`mem_${ed.id_memorial}`, ed);
                    });

                    mapaPorPessoa.forEach((reg, chave) => {
                        let ed = mapaEdicoes.get(chave) || (reg.id_intuo && mapaEdicoes.get(`intuo_${reg.id_intuo}`)) || (reg.id_memorial && mapaEdicoes.get(`mem_${reg.id_memorial}`));
                        if (!ed) {
                            for (const [chaveEd, objEd] of mapaEdicoes.entries()) {
                                if (calcularSimilaridade(chave, chaveEd) >= 0.85) {
                                    ed = objEd;
                                    break;
                                }
                            }
                        }
                        if (ed) {
                            if (ed.nome_falecido) reg.nome_falecido = ed.nome_falecido;
                            if (ed.sala) {
                                reg.sala = ed.sala;
                                reg.sala_normalizada = normalizarSala(ed.sala);
                            }
                            if (ed.destino) reg.destino = formatarLocalCemiterio(ed.destino, reg.tipo_servico);
                            if (ed.tipo_servico) reg.tipo_servico = ed.tipo_servico;
                            if (ed.data_inicio) reg.data_inicio = ed.data_inicio;
                            if (ed.data_fim) reg.data_fim = ed.data_fim;
                            if (ed.velorio_online !== undefined && ed.velorio_online !== null) reg.velorio_online = ed.velorio_online;
                            if (ed.foto_url) reg.foto_url = ed.foto_url;
                            if (ed.link_memorial) reg.link_memorial = ed.link_memorial;
                            if (ed.visivel !== undefined) reg.visivel = ed.visivel;
                            reg.editado_manualmente = 1;
                            reg.origem_dados = reg.origem_dados.includes('EDITADO') ? reg.origem_dados : `${reg.origem_dados} (EDITADO)`;
                        }
                    });

                    // Inclui edições manuais que foram criadas para essa data específica (sem correspondente Intuo/Bubble)
                    (edicoes || []).forEach(ed => {
                        if (!mapaPorPessoa.has(ed.chave_cruzamento)) {
                            const dtIni = extrairDataBrasil(ed.data_inicio);
                            const dtFim = extrairDataBrasil(ed.data_fim);
                            if (dtIni === dataRef || dtFim === dataRef) {
                                mapaPorPessoa.set(ed.chave_cruzamento, {
                                    chave_cruzamento: ed.chave_cruzamento,
                                    id_intuo: ed.id_intuo || null,
                                    id_memorial: ed.id_memorial || null,
                                    nome_falecido: ed.nome_falecido,
                                    sala: ed.sala || 'Direto',
                                    sala_normalizada: normalizarSala(ed.sala || 'Direto'),
                                    foto_url: ed.foto_url || null,
                                    qr_code_memorial: null,
                                    link_memorial: ed.link_memorial || null,
                                    velorio_online: ed.velorio_online || null,
                                    destino: formatarLocalCemiterio(ed.destino, ed.tipo_servico),
                                    tipo_servico: ed.tipo_servico || 'VELÓRIO',
                                    data_inicio: ed.data_inicio,
                                    data_fim: ed.data_fim,
                                    data_nascimento: '--.--.----',
                                    data_falecimento: '--.--.----',
                                    status_evento: 'Ativo',
                                    origem_dados: 'MANUAL (EDITADO)',
                                    editado_manualmente: 1,
                                    visivel: ed.visivel !== undefined ? ed.visivel : 1
                                });
                            }
                        }
                    });

                    const listaSemFiltro = Array.from(mapaPorPessoa.values()).filter(item => {
                        if (item.visivel === 0) return false;
                        if (ehServicoPet(item)) return false;
                        return true;
                    });

                    // Desduplicação inteligente final
                    const mapaDesduplicado = new Map();
                    listaSemFiltro.forEach(item => {
                        let chaveExistente = null;
                        for (const [k, exist] of mapaDesduplicado.entries()) {
                            const mesmaSala = item.sala_normalizada && exist.sala_normalizada && item.sala_normalizada !== 'direto' && item.sala_normalizada === exist.sala_normalizada;
                            const sim = calcularSimilaridade(item.nome_falecido, exist.nome_falecido);
                            if ((mesmaSala && sim >= 0.70) || sim >= 0.88) {
                                chaveExistente = k;
                                break;
                            }
                        }

                        if (chaveExistente) {
                            const exist = mapaDesduplicado.get(chaveExistente);
                            if (item.id_memorial && !exist.id_memorial) {
                                exist.id_memorial = item.id_memorial;
                                exist.foto_url = item.foto_url || exist.foto_url;
                                exist.qr_code_memorial = item.qr_code_memorial || exist.qr_code_memorial;
                                exist.link_memorial = item.link_memorial || exist.link_memorial;
                                exist.origem_dados = 'CRUZADO (MEMORIAL + INTUO)';
                            }
                            if (item.id_intuo && !exist.id_intuo) {
                                exist.id_intuo = item.id_intuo;
                                exist.origem_dados = exist.id_memorial ? 'CRUZADO (MEMORIAL + INTUO)' : 'INTUO';
                            }
                            if (item.destino && item.destino !== 'CONSULTE A ADM' && exist.destino === 'CONSULTE A ADM') {
                                exist.destino = item.destino;
                            }
                            if (item.velorio_online && !exist.velorio_online) {
                                exist.velorio_online = item.velorio_online;
                            }
                        } else {
                            mapaDesduplicado.set(item.chave_cruzamento || normalizarTexto(item.nome_falecido), { ...item });
                        }
                    });

                    const listaFinal = Array.from(mapaDesduplicado.values());

                    // DIAGNÓSTICO
                    diagnosticarCruzamento(
                        dataRef,
                        memoriaisDoDia,
                        intuosDoDia,
                        mapaPorPessoa,
                        listaFinal
                    );

                    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

                    if (dataRef === hoje) {
                        db.serialize(() => {
                            db.run('DELETE FROM painel_consolidado');

                            const stmt = db.prepare(`
                                INSERT INTO painel_consolidado (
                                    chave_cruzamento, id_intuo, id_memorial, nome_falecido,
                                    sala, sala_normalizada, foto_url, qr_code_memorial, link_memorial, velorio_online, destino, tipo_servico,
                                    data_inicio, data_fim, data_nascimento, data_falecimento,
                                    status_evento, origem_dados, editado_manualmente, visivel, atualizado_em
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                                    item.qr_code_memorial,
                                    item.link_memorial,
                                    item.velorio_online,
                                    item.destino,
                                    item.tipo_servico,
                                    item.data_inicio,
                                    item.data_fim,
                                    item.data_nascimento,
                                    item.data_falecimento,
                                    item.status_evento,
                                    item.origem_dados,
                                    item.editado_manualmente ? 1 : 0,
                                    item.visivel !== undefined ? item.visivel : 1
                                );
                            });

                            stmt.finalize((errFinal) => {
                                if (errFinal) return reject(errFinal);
                                console.log('✨ [SQLITE] Cruzamento finalizado para ' + dataRef + ': ' + listaFinal.length + ' registros consolidados.');
                                resolve(listaFinal);
                            });
                        });
                    } else {
                        console.log('✨ [SQLITE] Cruzamento histórico/futuro finalizado para ' + dataRef + ': ' + listaFinal.length + ' registros.');
                        resolve(listaFinal);
                    }
                });
            });
        });
    });
}

function salvarEdicaoEvento(dados) {
    return new Promise((resolve, reject) => {
        if (!dados || (!dados.chave_cruzamento && !dados.nome_falecido)) {
            return reject(new Error('chave_cruzamento ou nome_falecido é obrigatório'));
        }

        const chave = dados.chave_cruzamento || normalizarTexto(dados.nome_falecido);
        const salaNorm = dados.sala ? normalizarSala(dados.sala) : 'direto';

        const sql = `
            INSERT INTO eventos_edicoes (
                chave_cruzamento, id_intuo, id_memorial, nome_falecido,
                sala, sala_normalizada, destino, tipo_servico,
                data_inicio, data_fim, velorio_online, foto_url,
                link_memorial, visivel, atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(chave_cruzamento) DO UPDATE SET
                id_intuo = coalesce(excluded.id_intuo, eventos_edicoes.id_intuo),
                id_memorial = coalesce(excluded.id_memorial, eventos_edicoes.id_memorial),
                nome_falecido = excluded.nome_falecido,
                sala = excluded.sala,
                sala_normalizada = excluded.sala_normalizada,
                destino = excluded.destino,
                tipo_servico = excluded.tipo_servico,
                data_inicio = excluded.data_inicio,
                data_fim = excluded.data_fim,
                velorio_online = excluded.velorio_online,
                foto_url = excluded.foto_url,
                link_memorial = excluded.link_memorial,
                visivel = excluded.visivel,
                atualizado_em = CURRENT_TIMESTAMP
        `;

        db.run(sql, [
            chave,
            dados.id_intuo || null,
            dados.id_memorial || null,
            dados.nome_falecido ? dados.nome_falecido.trim() : null,
            dados.sala || null,
            salaNorm,
            dados.destino || null,
            dados.tipo_servico || null,
            dados.data_inicio || null,
            dados.data_fim || null,
            dados.velorio_online !== undefined ? dados.velorio_online : null,
            dados.foto_url || null,
            dados.link_memorial || null,
            dados.visivel !== undefined ? (dados.visivel ? 1 : 0) : 1
        ], function(err) {
            if (err) return reject(err);
            resolve({ sucesso: true, id_edicao: this.lastID, chave_cruzamento: chave });
        });
    });
}

function removerEdicaoEvento(chaveCruzamento) {
    return new Promise((resolve, reject) => {
        if (!chaveCruzamento) return resolve({ sucesso: false, mensagem: "Chave não informada" });
        const chave = normalizarTexto(chaveCruzamento);
        db.run("DELETE FROM eventos_edicoes WHERE chave_cruzamento = ? OR chave_cruzamento = ?", [chaveCruzamento, chave], function(err) {
            if (err) return reject(err);
            resolve({ sucesso: true, removido: this.changes > 0 });
        });
    });
}

async function obterEventosHall(dataReferencia) {
    const dataRef = dataReferencia || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Se for solicitado um dia específico diferente de hoje, roda o cruzamento para aquela data sob demanda
    if (dataRef !== hoje) {
        const eventosData = await executarCruzamentoSQLite(dataRef);
        return eventosData.map(e => ({
            chave_cruzamento: e.chave_cruzamento,
            nome: e.nome_falecido,
            sala: e.sala,
            foto: e.foto_url,
            id_memorial: e.id_memorial,
            id_intuo: e.id_intuo,
            qr_code_memorial: e.qr_code_memorial,
            link_memorial: e.link_memorial,
            velorio_online: e.velorio_online,
            destino: e.destino,
            tipo_servico: e.tipo_servico,
            data_inicio: e.data_inicio,
            data_fim: e.data_fim,
            data_nascimento: e.data_nascimento,
            data_falecimento: e.data_falecimento,
            origem_dados: e.origem_dados,
            editado_manualmente: e.editado_manualmente || 0
        }));
    }

    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                chave_cruzamento,
                id_intuo,
                nome_falecido AS nome,
                sala,
                foto_url AS foto,
                id_memorial,
                qr_code_memorial,
                link_memorial,
                velorio_online,
                destino,
                tipo_servico,
                data_inicio,
                data_fim,
                data_nascimento,
                data_falecimento,
                origem_dados,
                editado_manualmente
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
                chave_cruzamento,
                nome_falecido AS nome,
                sala,
                foto_url AS foto,
                id_memorial,
                qr_code_memorial,
                link_memorial,
                velorio_online,
                destino,
                tipo_servico,
                data_inicio,
                data_fim,
                data_nascimento,
                data_falecimento,
                origem_dados,
                editado_manualmente
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
    salvarEdicaoEvento,
    removerEdicaoEvento,
    executarCruzamentoSQLite,
    obterEventosHall,
    obterEventoPorSala
};