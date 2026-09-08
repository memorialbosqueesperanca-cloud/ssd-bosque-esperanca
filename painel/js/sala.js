const urlParams = new URLSearchParams(window.location.search);
const paramSala = urlParams.get('numero') || urlParams.get('sala') || '1';
const numeroSala = paramSala.toLowerCase().includes('imersiva') ? '3' : paramSala;

let modoSalaDisponivel = false;
let timerAlternanciaVideo = null;
let playlistVideosSala = [];
let indiceVideoSala = 0;
const TEMPO_EXIBICAO_AGENDA = 45000; // 45 segundos exibindo a agenda antes de rodar o vídeo

// 1. GERENCIADOR PRINCIPAL DA TELA DE SALA
async function gerenciarTelaSala() {
    try {
        let apiRetornouDados = false;
        let dadosAPI = null;

        // 1.1 Tenta buscar da API primeiro
        try {
            const response = await fetch(`/api/sala/${numeroSala}`);
            if (response.ok) {
                const dados = await response.json();
                if (dados && dados.status === "ocupado" && dados.nome) {
                    dadosAPI = dados;
                    apiRetornouDados = true;
                }
            }
        } catch (erroFetch) {
            console.warn("Erro ao buscar dados da API da sala:", erroFetch);
        }

        // 1.2 Se a API retornou homenagem ativa
        if (apiRetornouDados && dadosAPI) {
            exibirDadosHomenagem(dadosAPI);
            return;
        }

        // 1.3 Fallback: Entrada manual local de emergência
        let entradaManual = null;
        try {
            const raw = localStorage.getItem('painel_emergencia_dados');
            if (raw) {
                const entradas = JSON.parse(raw);
                entradaManual = entradas.find(e => {
                    const numApenas = String(e.sala).replace(/\D/g, '');
                    const paramApenas = String(numeroSala).replace(/\D/g, '');
                    return (numApenas && paramApenas && numApenas === paramApenas) || 
                           (String(e.sala).toLowerCase() === String(paramSala).toLowerCase());
                });
            }
        } catch (err) {
            console.error("Erro ao ler localStorage de emergência:", err);
        }

        if (entradaManual) {
            const hi = entradaManual.hora_inicio || (entradaManual.data_inicio ? new Date(entradaManual.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--');
            const hf = entradaManual.hora_termino || (entradaManual.data_fim ? new Date(entradaManual.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--');

            exibirDadosHomenagem({
                status: "ocupado",
                nome: entradaManual.nome || "Homenageado",
                foto: entradaManual.foto,
                hora_inicio: hi,
                hora_termino: hf,
                data_nascimento: entradaManual.data_nascimento || "--.--.----",
                data_falecimento: entradaManual.data_falecimento || "--.--.----",
                destino: entradaManual.destino || "Consulte a recepção",
                data_fim_raw: entradaManual.data_fim
            });
            return;
        }

        // 1.4 Se não há velório ativo, exibe a Agenda do Dia + Vídeos de Sala
        ativarModoSalaDisponivel();

    } catch (erro) {
        console.error("Erro no fluxo da tela de sala:", erro);
    }
}

// 2. EXIBIÇÃO DE HOMENAGEM (VELÓRIO ATIVO)
function exibirDadosHomenagem(dados) {
    modoSalaDisponivel = false;
    pararCicloVideosSala();

    const blocoHomenagem = document.getElementById('bloco-homenagem');
    const blocoAgenda = document.getElementById('bloco-agenda-sala');
    const videoOverlay = document.getElementById('video-overlay-sala');

    if (blocoAgenda) blocoAgenda.style.display = 'none';
    if (videoOverlay) videoOverlay.style.display = 'none';
    if (blocoHomenagem) blocoHomenagem.style.display = 'flex';

    // Nome
    const elNome = document.getElementById('nome');
    if (elNome) elNome.innerText = dados.nome || 'Homenageado';

    // Foto
    const elFoto = document.getElementById('foto');
    if (elFoto) elFoto.src = dados.foto || "videos/logo_bosque.png";

    // Horários
    const elHoraIni = document.getElementById('hora-inicio');
    const elHoraFim = document.getElementById('hora-termino');
    if (elHoraIni) elHoraIni.innerText = dados.hora_inicio || (dados.data_inicio ? formatarHora(dados.data_inicio) : '--:--');
    if (elHoraFim) elHoraFim.innerText = dados.hora_termino || (dados.data_fim ? formatarHora(dados.data_fim) : '--:--');

    // Destino / Local
    const elDestino = document.getElementById('destino-local');
    if (elDestino) {
        let dest = dados.destino || "Consulte a ACM";
        const mapaNomesQuadras = {
            'PAIN II': 'PAINEIRAS II', 'PAIN': 'PAINEIRAS', 'PAINEIRAS II': 'PAINEIRAS II', 'PAINEIRAS': 'PAINEIRAS',
            'FLAMBOY': 'FLAMBOYANT', 'FLAMBOYANT': 'FLAMBOYANT', 'BOUN': 'BOUGAINVILLE', 'BOUGAINVILLE': 'BOUGAINVILLE',
            'ANGICO': 'ANGICO', 'ACACIA': 'ACÁCIA', 'ACÁCIA': 'ACÁCIA', 'HIBISCO': 'HIBISCO',
            'IPÊ': 'IPÊ', 'IPE': 'IPÊ', 'FICUS': 'FICUS', 'ANGELIM': 'ANGELIM',
            'BURITIS': 'BURITIS', 'MANACA': 'MANACÁ', 'MANACÁ': 'MANACÁ'
        };
        if (dest && dest !== 'Consulte a ACM' && dest !== 'Consulte a recepção' && dest !== 'Direto') {
            if (/crema[çc][ãa]o/i.test(dest)) {
                dest = 'Cremação';
            } else if (dest.includes('QD:')) {
                const matchQd = dest.match(/QD:\s*([^.\n]+)/i);
                if (matchQd) {
                    let qd = matchQd[1].trim().replace(/^\d+-/, '').trim().toUpperCase();
                    dest = mapaNomesQuadras[qd] || qd;
                }
            } else if (/jazigo/i.test(dest) || /quadra/i.test(dest)) {
                let parte = dest;
                if (/jazigo/i.test(parte)) parte = parte.split(/jazigo/i)[0].replace(/[-–\s]+$/, '');
                if (/quadra/i.test(parte)) parte = parte.replace(/^.*quadra\s*/i, '');
                let qd = parte.trim().replace(/^\d+-/, '').trim().toUpperCase();
                dest = mapaNomesQuadras[qd] || qd;
            } else {
                const upper = dest.toUpperCase();
                if (mapaNomesQuadras[upper]) dest = mapaNomesQuadras[upper];
            }
        } else {
            if (dados.tipo_servico && String(dados.tipo_servico).toUpperCase().includes('CREMA')) {
                dest = 'Cremação';
            } else {
                dest = 'Consulte a ACM';
            }
        }
        elDestino.innerText = dest;
    }

    // QR Codes
    const urlFlora = "https://bosqueesperanca.com.br/flora/";
    const qrFlora = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(urlFlora)}`;
    const qrMemorialUrl = dados.qrCode || `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://memorialbosque.com.br`;
    const linkVelorio = (typeof dados.velorio_online === 'string' && dados.velorio_online.length > 5) 
        ? dados.velorio_online 
        : "https://www.adiau.com.br/embed/?hash=beFS6qSdk8HJKlKV5gqzYh93#!";
    const qrVelorioUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(linkVelorio)}`;

    const elCardMemorial = document.getElementById('card-qr-memorial');
    const elCardVelorio = document.getElementById('card-qr-velorio');
    const elQrMemorial = document.getElementById('qr-memorial');
    const elQrVelorio = document.getElementById('qr-velorio');
    const elTitMemorial = document.getElementById('titulo-qr-memorial');
    const elTitVelorio = document.getElementById('titulo-qr-velorio');

    if (elCardMemorial && elQrMemorial) {
        elCardMemorial.style.display = 'flex';
        elQrMemorial.src = qrMemorialUrl;
        if (elTitMemorial) elTitMemorial.innerText = "MEMORIAL";
    }

    if (elCardVelorio && elQrVelorio) {
        elCardVelorio.style.display = 'flex';
        elQrVelorio.src = qrFlora;
        if (elTitVelorio) elTitVelorio.innerText = "FLORA";
    }

    // QR Redes
    const elQrRedes = document.getElementById('qr-redes');
    if (elQrRedes) {
        elQrRedes.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent("https://linktr.ee/bosquedaesperanca")}`;
    }
}

// 3. ATIVAÇÃO DO MODO SALA DISPONÍVEL (AGENDA DO DIA + VÍDEOS DE SALA)
async function ativarModoSalaDisponivel() {
    if (modoSalaDisponivel) return;
    modoSalaDisponivel = true;

    const blocoHomenagem = document.getElementById('bloco-homenagem');
    const blocoAgenda = document.getElementById('bloco-agenda-sala');

    if (blocoHomenagem) blocoHomenagem.style.display = 'none';
    if (blocoAgenda) blocoAgenda.style.display = 'flex';

    // Nome da sala no badge: exibe APENAS "SALA X"
    const badgeSala = document.getElementById('badge-sala-nome');
    if (badgeSala) {
        const nomeFormatado = String(paramSala).toLowerCase().includes('imersiva') || paramSala === '3' 
            ? 'SALA 3' 
            : `SALA ${paramSala}`;
        badgeSala.innerText = nomeFormatado.toUpperCase();
    }

    // Carrega os dados da Agenda do Dia
    await carregarAgendaDoDia();

    // Carrega vídeos de sala e inicia o ciclo
    await iniciarCicloVideosSala();
}

// 4. CARREGA E RENDERIZA A AGENDA DO DIA
async function carregarAgendaDoDia() {
    try {
        const res = await fetch('/api/hall');
        if (!res.ok) return;
        const lista = await res.json();

        const grid = document.getElementById('agenda-grid-cards');
        if (!grid) return;
        grid.innerHTML = '';

        if (!Array.isArray(lista) || lista.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #718096; font-size: 1.2rem; font-weight: 600; padding: 40px;">Nenhuma cerimônia programada no momento.</div>`;
            return;
        }

        // 1. Filtra velórios encerrados há mais de 3 horas
        const agoraFiltro = new Date().getTime();
        const tresHorasEmMs = 3 * 60 * 60 * 1000;
        
        let listaValida = lista.filter(item => {
            if (!item.data_fim) return true; 
            const fimTempo = new Date(item.data_fim).getTime();
            return (agoraFiltro - fimTempo) <= tresHorasEmMs;
        });

        // 2. Filtra cremação direta sem velório
        listaValida = listaValida.filter(item => {
            const tipo = String(item.tipo_servico || '').toUpperCase();
            const dest = String(item.destino || '').toUpperCase();
            const salaStr = item.sala ? String(item.sala).trim().toLowerCase() : '';
            const ehSemSala = !salaStr || salaStr === 'direto' || salaStr === 'n/d' || salaStr === '-' || salaStr === 'null';

            const ehCremacao = tipo.includes('CREMA') || dest.includes('CREMA');
            const ehVelorio = tipo.includes('VELÓRIO') || (!ehSemSala && item.id_memorial);

            if (ehCremacao && ehSemSala && !ehVelorio) {
                return false;
            }
            return true;
        });

        if (listaValida.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #718096; font-size: 1.2rem; font-weight: 600; padding: 40px;">Nenhuma cerimônia programada no momento.</div>`;
            return;
        }

        // 3. Ordenação idêntica ao painel principal
        const ordemStatus = { 'Encerrando': 0, 'Em andamento': 1, 'Previsto': 2, 'Encerrado': 3 };
        listaValida.sort((a, b) => {
            const sa = calcularStatus(a.data_inicio, a.data_fim).texto;
            const sb = calcularStatus(b.data_inicio, b.data_fim).texto;
            const statusDiff = (ordemStatus[sa] ?? 99) - (ordemStatus[sb] ?? 99);
            if (statusDiff !== 0) return statusDiff;

            const inicioA = new Date(a.data_inicio).getTime();
            const inicioB = new Date(b.data_inicio).getTime();
            const fimA = new Date(a.data_fim).getTime();
            const fimB = new Date(b.data_fim).getTime();

            if (sa === 'Encerrando') return fimA - fimB || inicioA - inicioB;
            if (sa === 'Em andamento' || sa === 'Previsto') return inicioA - inicioB || fimA - fimB;

            return fimA - fimB || inicioA - inicioB;
        });

        let listaCompleta = listaValida;
        let paginaAgenda = 0;
        
        // Calcula quantos cards cabem na tela sem criar barra de rolagem
        function calcularItensPorPagina() {
            const alturaDisponivel = grid.clientHeight || (window.innerHeight - 240);
            const alturaEstimadaCard = 88;
            const gap = 18;
            const qtd = Math.max(1, Math.floor((alturaDisponivel + gap) / (alturaEstimadaCard + gap)));
            return qtd;
        }

        const ITENS_POR_PAGINA_SALA = calcularItensPorPagina();
        const totalPaginas = Math.ceil(listaCompleta.length / ITENS_POR_PAGINA_SALA);

        function renderizarPaginaAgenda(p) {
            grid.innerHTML = '';
            const inicio = p * ITENS_POR_PAGINA_SALA;
            const fim = inicio + ITENS_POR_PAGINA_SALA;
            const itensPagina = listaCompleta.slice(inicio, fim);

            itensPagina.forEach(item => {
                const status = calcularStatus(item.data_inicio, item.data_fim);
                const salaStr = item.sala ? String(item.sala).trim() : '';
                const salaLower = salaStr.toLowerCase();
                let sala = 'Direto';
                if (salaStr && salaStr !== '-' && salaLower !== 'n/d' && salaStr !== 'null') {
                    if (salaLower.includes('imersiva')) {
                        sala = 'Imersiva';
                    } else if (salaStr === '3' || salaLower === 'sala 3') {
                        sala = 'Sala 3';
                    } else if (salaLower.includes('sala') || salaLower.includes('direto')) {
                        sala = salaStr;
                    } else {
                        sala = `Sala ${salaStr}`;
                    }
                }

                const foto = item.foto || 'videos/logo_bosque.png';
                const horario = formatarHorario(item.data_inicio, item.data_fim);

                let destinoFormatado = item.destino || 'Consulte a ACM';
                const mapaNomesQuadras = {
                    'PAIN II': 'PAINEIRAS II', 'PAIN': 'PAINEIRAS', 'PAINEIRAS II': 'PAINEIRAS II', 'PAINEIRAS': 'PAINEIRAS',
                    'FLAMBOY': 'FLAMBOYANT', 'FLAMBOYANT': 'FLAMBOYANT', 'BOUN': 'BOUGAINVILLE', 'BOUGAINVILLE': 'BOUGAINVILLE',
                    'ANGICO': 'ANGICO', 'ACACIA': 'ACÁCIA', 'ACÁCIA': 'ACÁCIA', 'HIBISCO': 'HIBISCO',
                    'IPÊ': 'IPÊ', 'IPE': 'IPÊ', 'FICUS': 'FICUS', 'ANGELIM': 'ANGELIM',
                    'BURITIS': 'BURITIS', 'MANACA': 'MANACÁ', 'MANACÁ': 'MANACÁ', 'MAGNOLIA': 'MAGNÓLIA', 'MAGNÓLIA': 'MAGNÓLIA'
                };
                if (destinoFormatado && destinoFormatado !== 'Consulte a ACM' && destinoFormatado !== 'Consulte a recepção' && destinoFormatado !== 'Direto') {
                    if (/crema[çc][ãa]o/i.test(destinoFormatado)) {
                        destinoFormatado = 'Cremação';
                    } else if (destinoFormatado.includes('QD:')) {
                        const matchQd = destinoFormatado.match(/QD:\s*([^.\n]+)/i);
                        if (matchQd) {
                            let qd = matchQd[1].trim().replace(/^\d+-/, '').trim().toUpperCase();
                            destinoFormatado = mapaNomesQuadras[qd] || qd;
                        }
                    } else if (/jazigo/i.test(destinoFormatado) || /quadra/i.test(destinoFormatado)) {
                        let parte = destinoFormatado;
                        if (/jazigo/i.test(parte)) parte = parte.split(/jazigo/i)[0].replace(/[-–\s]+$/, '');
                        if (/quadra/i.test(parte)) parte = parte.replace(/^.*quadra\s*/i, '');
                        let qd = parte.trim().replace(/^\d+-/, '').trim().toUpperCase();
                        destinoFormatado = mapaNomesQuadras[qd] || qd;
                    } else {
                        const upper = destinoFormatado.toUpperCase();
                        if (mapaNomesQuadras[upper]) destinoFormatado = mapaNomesQuadras[upper];
                    }
                } else {
                    if (item.tipo_servico && String(item.tipo_servico).toUpperCase().includes('CREMA')) {
                        destinoFormatado = 'Cremação';
                    } else {
                        destinoFormatado = 'Consulte a ACM';
                    }
                }

                const card = document.createElement('div');
                card.className = 'agenda-card' + (status.texto === 'Encerrado' ? ' agenda-card--encerrado' : '');
                card.innerHTML = `
                    <img class="card-foto" src="${foto}" alt="Foto" onerror="this.src='videos/logo_bosque.png'">
                    <div class="card-info">
                        <div class="card-nome">${item.nome || 'Homenageado'}</div>
                        <div class="card-meta">
                            <span class="card-sala">${sala}</span>
                            <span class="card-horario">${horario}</span>
                        </div>
                        <div class="card-destino">${destinoFormatado}</div>
                        <div class="card-status" style="color: ${status.cor};">${status.texto}</div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        renderizarPaginaAgenda(0);

        if (totalPaginas > 1) {
            clearInterval(window.timerPaginacaoAgendaSala);
            window.timerPaginacaoAgendaSala = setInterval(() => {
                if (!modoSalaDisponivel) {
                    clearInterval(window.timerPaginacaoAgendaSala);
                    return;
                }
                paginaAgenda = (paginaAgenda + 1) % totalPaginas;
                renderizarPaginaAgenda(paginaAgenda);
            }, 15000);
        }

    } catch (e) {
        console.warn("Erro ao carregar agenda do dia na sala:", e);
    }
}

// 5. CICLO DE VÍDEOS ESPECÍFICOS DE SALA
async function iniciarCicloVideosSala() {
    pararCicloVideosSala();

    try {
        const res = await fetch('/api/video-config');
        if (res.ok) {
            const cfg = await res.json();
            playlistVideosSala = Array.isArray(cfg.sala) && cfg.sala.length > 0 
                ? cfg.sala 
                : ['videos/video-sala1.mp4', 'videos/video-sala2.mp4'];
        }
    } catch (e) {
        playlistVideosSala = ['videos/video-sala1.mp4', 'videos/video-sala2.mp4'];
    }

    if (playlistVideosSala.length === 0) return;

    agendarProximoVideoSala();
}

function agendarProximoVideoSala() {
    clearTimeout(timerAlternanciaVideo);
    timerAlternanciaVideo = setTimeout(() => {
        if (!modoSalaDisponivel) return;
        reproduzirVideoSala();
    }, TEMPO_EXIBICAO_AGENDA);
}

function reproduzirVideoSala() {
    if (!modoSalaDisponivel || playlistVideosSala.length === 0) return;

    const overlay = document.getElementById('video-overlay-sala');
    const player = document.getElementById('video-sala-player');
    const source = document.getElementById('video-sala-source');

    if (!overlay || !player || !source) return;

    if (indiceVideoSala >= playlistVideosSala.length) {
        indiceVideoSala = 0;
    }

    source.src = playlistVideosSala[indiceVideoSala];
    player.muted = true;
    player.playsInline = true;
    player.load();
    overlay.style.display = 'flex';

    player.play().catch(err => {
        if (err && (err.name === 'AbortError' || String(err.message).includes('paused to save power'))) {
            return;
        }
        console.warn("Autoplay bloqueado ou erro no vídeo:", err.message || err);
        overlay.style.display = 'none';
        indiceVideoSala = (indiceVideoSala + 1) % playlistVideosSala.length;
        agendarProximoVideoSala();
    });

    player.onended = () => {
        overlay.style.display = 'none';
        indiceVideoSala = (indiceVideoSala + 1) % playlistVideosSala.length;
        // Recarrega agenda para manter dados frescos
        carregarAgendaDoDia();
        agendarProximoVideoSala();
    };
}

function pararCicloVideosSala() {
    clearTimeout(timerAlternanciaVideo);
    const overlay = document.getElementById('video-overlay-sala');
    const player = document.getElementById('video-sala-player');
    if (player) {
        player.pause();
        player.currentTime = 0;
    }
    if (overlay) overlay.style.display = 'none';
}

// 6. UTILITÁRIOS DE FORMATAÇÃO E STATUS
function formatarHora(isoString) {
    if (!isoString) return '--:--';
    const s = String(isoString).trim();
    if (s.endsWith('Z')) {
        return new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    }
    const limpo = s.replace(/\.\d+$/, '');
    return limpo.includes('T') ? limpo.split('T')[1].slice(0, 5) : limpo.slice(0, 5);
}

function formatarHorario(inicio, fim) {
    const hi = formatarHora(inicio);
    const hf = formatarHora(fim);
    return `${hi} às ${hf}`;
}

function calcularStatus(dataInicio, dataFim) {
    if (!dataInicio && !dataFim) {
        return { texto: 'Agendado', cor: '#01813D' };
    }
    const agora = new Date();
    const ini = dataInicio ? new Date(dataInicio) : null;
    const fim = dataFim ? new Date(dataFim) : null;

    if (fim && agora > fim) {
        return { texto: 'Encerrado', cor: '#718096' };
    }
    if (ini && agora >= ini && (!fim || agora <= fim)) {
        return { texto: 'Em andamento', cor: '#01813D' };
    }
    return { texto: 'Agendado', cor: '#FAA507' };
}

// 7. RELÓGIO E DATA EM TEMPO REAL
function atualizarRelogioEData() {
    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const opcoesDataCompleta = { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' };
    const dataCompletaTexto = agora.toLocaleDateString('pt-BR', opcoesDataCompleta).toUpperCase();
    const dataSimplesTexto = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const elRelogioAgenda = document.getElementById('agenda-relogio');
    const elDataAgenda = document.getElementById('agenda-data');
    const elRelogioHomenagem = document.getElementById('homenagem-relogio');
    const elDataHomenagem = document.getElementById('homenagem-data');

    if (elRelogioAgenda) elRelogioAgenda.innerText = horaFormatada;
    if (elDataAgenda) elDataAgenda.innerText = dataSimplesTexto;
    if (elRelogioHomenagem) elRelogioHomenagem.innerText = horaFormatada;
    if (elDataHomenagem) elDataHomenagem.innerText = dataCompletaTexto;
}
setInterval(atualizarRelogioEData, 1000);
atualizarRelogioEData();

// 8. SERVER-SENT EVENTS (SSE) PARA ATUALIZAÇÃO EM TEMPO REAL
try {
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = () => {
        console.log("⚡ [SSE] Atualização recebida do servidor.");
        gerenciarTelaSala();
    };
} catch(e) {}

// 9. TELA CHEIA AO DAR DUPLO CLIQUE
document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
});

// 10. RECARGA DIÁRIA (03:00)
setInterval(() => {
    const d = new Date();
    if (d.getHours() === 3 && d.getMinutes() === 0) {
        window.location.reload(true);
    }
}, 60000);

// Executa verificação periódica a cada 30 segundos
setInterval(gerenciarTelaSala, 30000);
gerenciarTelaSala();

