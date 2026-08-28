const sqlite3 = require('../backend/node_modules/sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'backend', 'data', 'ssd_bosque.sqlite'));

db.serialize(() => {
    db.all("SELECT * FROM painel_consolidado", (err, rows) => {
        if (err) console.error(err);
        else console.log('Total consolidados:', rows.length);
        process.exit(0);
    });
});

function parseParaTimestampLocal(str) {
    if (!str) return 0;
    const limpo = String(str).replace(/Z$/i, '').replace(/\.\d+$/, '');
    return new Date(`${limpo}-03:00`).getTime();
}

function formatarHoraExibicao(str) {
    if (!str) return '--:--';
    const limpo = String(str).replace(/Z$/i, '').replace(/\.\d+$/, '');
    if (limpo.includes('T')) {
        return limpo.split('T')[1].slice(0, 5);
    }
    return limpo.slice(0, 5);
}

db.all("SELECT * FROM memorial_eventos WHERE visivel = 1", (errMem, memoriais) => {
    db.all("SELECT * FROM intuo_eventos WHERE status != 'Cancelado'", (errIntuo, intuos) => {
        const mapaPorPessoa = new Map();

        // 1. Memorial (Bubble)
        memoriais.forEach(m => {
            const chave = normalizarTexto(m.nome_falecido);
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

        // 2. Ordena Intuo: Velórios primeiro, depois Sepultamentos/Cremações, depois outros
        const intuosOrdenados = [...intuos].sort((a, b) => {
            const peso = (item) => {
                let raw = {};
                try { raw = JSON.parse(item.raw_json || '{}'); } catch(e) {}
                const grupo = (raw.ch_nome_grupo_serviço || '').toUpperCase();
                const tipo = (item.tipo_servico || '').toUpperCase();
                if (grupo.includes('VELÓRIO') || (item.sala_recurso && item.sala_recurso !== 'Direto')) return 1;
                if (grupo.includes('SEPULTAMENTO') || tipo.includes('SEPULTAMENTO') || tipo.includes('CREMA')) return 2;
                return 3;
            };
            return peso(a) - peso(b);
        });

        intuosOrdenados.forEach(i => {
            const chave = normalizarTexto(i.nome_falecido);
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
                reg.id_intuo = i.id_intuo;
                reg.origem_dados = 'CRUZADO (MEMORIAL + INTUO)';

                if (ehVelorio) {
                    reg.tipo_servico = 'VELÓRIO';
                    if (i.sala_recurso && i.sala_recurso !== 'Direto') {
                        reg.sala = i.sala_recurso;
                        reg.sala_normalizada = normalizarSala(i.sala_recurso);
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
                    const destFormatado = formatarLocalCemiterio(i.destino, 'SEPULTAMENTO');
                    if (destFormatado && destFormatado !== 'Consulte a ACM') {
                        reg.destino = destFormatado;
                    }
                }
            } else {
                if (ehBuffetOuApoio) return; // Não cria entrada solta de buffet

                const ehDireto = !i.sala_recurso || i.sala_recurso === 'Direto' || !ehVelorio;
                let tipoFinal = ehVelorio ? 'VELÓRIO' : (ehCremacao ? 'CREMAÇÃO' : (ehDireto ? 'SEPULTAMENTO DIRETO' : i.tipo_servico));
                let destFinal = ehCremacao ? 'Cremação' : formatarLocalCemiterio(i.destino, tipoFinal);

                mapaPorPessoa.set(chave, {
                    chave_cruzamento: chave,
                    id_intuo: i.id_intuo,
                    id_memorial: null,
                    nome_falecido: i.nome_falecido,
                    sala: ehDireto ? 'Direto' : i.sala_recurso,
                    sala_normalizada: ehDireto ? 'direto' : normalizarSala(i.sala_recurso),
                    foto_url: null,
                    destino: destFinal,
                    tipo_servico: tipoFinal,
                    data_inicio: i.data_inicio,
                    data_fim: i.data_fim,
                    data_nascimento: '--.--.----',
                    data_falecimento: '--.--.----',
                    status_evento: i.status || 'Ativo',
                    origem_dados: 'INTUO'
                });
            }
        });

        const listaConsolidada = Array.from(mapaPorPessoa.values()).filter(item => {
            const tipo = String(item.tipo_servico || '').toUpperCase();
            const dest = String(item.destino || '').toUpperCase();
            const salaNorm = String(item.sala_normalizada || '').toLowerCase();
            const sala = String(item.sala || '').trim().toLowerCase();
            const ehSemSala = !sala || sala === 'direto' || salaNorm === 'direto' || sala === 'n/d' || sala === '-' || sala === 'null';

            const ehCremacao = tipo.includes('CREMA') || dest.includes('CREMA');
            const ehVelorio = tipo.includes('VELÓRIO') || (!ehSemSala && item.id_memorial);

            if (ehCremacao && ehSemSala && !ehVelorio) {
                return false;
            }
            return true;
        });

        console.log('\n=== LISTA CONSOLIDADA FINAL (' + listaConsolidada.length + ' registros) ===');
        listaConsolidada.forEach(it => {
            console.log(`[${it.sala}] ${it.nome_falecido} | Tipo: ${it.tipo_servico} | Destino: ${it.destino} | ${formatarHoraExibicao(it.data_inicio)} às ${formatarHoraExibicao(it.data_fim)}`);
        });

        function obterEventoPorSala(numeroSala, horaSimulada = new Date()) {
            const salaLimpa = normalizarSala(numeroSala);
            const eventosDaSala = listaConsolidada.filter(item => {
                const sn = item.sala_normalizada;
                return (sn && sn === salaLimpa) || (String(item.sala).trim() === String(numeroSala).trim());
            });

            if (eventosDaSala.length === 0) return null;

            eventosDaSala.sort((a, b) => {
                const tA = parseParaTimestampLocal(a.data_inicio);
                const tB = parseParaTimestampLocal(b.data_inicio);
                return tA - tB;
            });

            const agoraMs = (horaSimulada instanceof Date ? horaSimulada.getTime() : parseParaTimestampLocal(horaSimulada));
            const MARGEM_PREPARACAO_MS = 45 * 60 * 1000; // 45 min antes
            const TOLERANCIA_ENCERRAMENTO_MS = 20 * 60 * 1000; // 20 min após

            const eventoAtivo = eventosDaSala.find(e => {
                if (!e.data_inicio || !e.data_fim) return false;
                const ini = parseParaTimestampLocal(e.data_inicio);
                const fim = parseParaTimestampLocal(e.data_fim);
                return agoraMs >= (ini - MARGEM_PREPARACAO_MS) && agoraMs <= (fim + TOLERANCIA_ENCERRAMENTO_MS);
            });

            if (eventoAtivo) {
                return { ...eventoAtivo, status: "ocupado" };
            }
            return null;
        }

        console.log('\n=== SIMULAÇÃO SALA 7 (Terezinha 10h-12h e Daisy 16:30-19:30) ===');
        console.log('10:30 (Velório Terezinha):', obterEventoPorSala('7', '2026-08-28T10:30:00')?.nome_falecido);
        console.log('12:15 (Tolerância saída Terezinha):', obterEventoPorSala('7', '2026-08-28T12:15:00')?.nome_falecido);
        console.log('13:00 (Intervalo vago > 1h30):', obterEventoPorSala('7', '2026-08-28T13:00:00')?.nome_falecido || 'SALA DISPONÍVEL');
        console.log('15:40 (Intervalo vago):', obterEventoPorSala('7', '2026-08-28T15:40:00')?.nome_falecido || 'SALA DISPONÍVEL');
        console.log('15:50 (Preparação Velório Daisy):', obterEventoPorSala('7', '2026-08-28T15:50:00')?.nome_falecido);
        console.log('17:00 (Velório Daisy):', obterEventoPorSala('7', '2026-08-28T17:00:00')?.nome_falecido);
        console.log('20:00 (Após encerramento total):', obterEventoPorSala('7', '2026-08-28T20:00:00')?.nome_falecido || 'SALA DISPONÍVEL');

        console.log('\n=== SIMULAÇÃO SALA 1 (Jorge até 13h e Maria 14:30-18:30) ===');
        console.log('11:00 (Velório Jorge Luiz):', obterEventoPorSala('1', '2026-08-28T11:00:00')?.nome_falecido);
        console.log('13:10 (Tolerância saída Jorge):', obterEventoPorSala('1', '2026-08-28T13:10:00')?.nome_falecido);
        console.log('13:30 (Intervalo de 1h30):', obterEventoPorSala('1', '2026-08-28T13:30:00')?.nome_falecido || 'SALA DISPONÍVEL');
        console.log('13:50 (Preparação Velório Maria da Glória):', obterEventoPorSala('1', '2026-08-28T13:50:00')?.nome_falecido);
        console.log('15:00 (Velório Maria da Glória):', obterEventoPorSala('1', '2026-08-28T15:00:00')?.nome_falecido);
        console.log('19:00 (Após encerramento total):', obterEventoPorSala('1', '2026-08-28T19:00:00')?.nome_falecido || 'SALA DISPONÍVEL');
    });
});

