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
    const elCardMemorial = document.getElementById('card-qr-memorial');
    const elCardVelorio = document.getElementById('card-qr-velorio');
    const elQrMemorial = document.getElementById('qr-memorial');
    const elQrVelorio = document.getElementById('qr-velorio');
    const elTitMemorial = document.getElementById('titulo-qr-memorial');
    const elTitVelorio = document.getElementById('titulo-qr-velorio');

    // 1. QR Code do Memorial (específico do homenageado quando cadastrado no Bubble)
    const temMemorial = Boolean(
        dados.id_memorial ||
        dados.qr_code_memorial ||
        dados.link_memorial ||
        dados.qrCode
    );

    if (temMemorial) {
        let qrMemorialSrc = dados.qr_code_memorial || dados.qrCode;
        if (!qrMemorialSrc && dados.link_memorial) {
            qrMemorialSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(dados.link_memorial)}`;
        } else if (!qrMemorialSrc && dados.id_memorial) {
            qrMemorialSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`https://memorialbosque.com.br/memorial/${dados.id_memorial}`)}`;
        }

        if (elCardMemorial && elQrMemorial && qrMemorialSrc) {
            elCardMemorial.style.display = 'flex';
            elQrMemorial.src = qrMemorialSrc;
            if (elTitMemorial) elTitMemorial.innerText = "MEMORIAL";
        } else if (elCardMemorial) {
            elCardMemorial.style.display = 'none';
        }
    } else {
        // Quando NÃO houver memorial cadastrado, esconde o card do Memorial
        if (elCardMemorial) {
            elCardMemorial.style.display = 'none';
        }
    }

    // 2. QR Code do Velório On-line (Apenas se constar na Intuo)
    const temVelorioOnline = Boolean(
        dados.velorio_online &&
        typeof dados.velorio_online === 'string' &&
        dados.velorio_online.trim().length > 3 &&
        dados.velorio_online.trim().toLowerCase() !== 'null' &&
        dados.velorio_online.trim().toLowerCase() !== 'undefined'
    );

    if (temVelorioOnline) {
        const linkVelorio = dados.velorio_online.startsWith('http')
            ? dados.velorio_online
            : `https://${dados.velorio_online}`;
        const qrVelorioUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(linkVelorio)}`;

        if (elCardVelorio && elQrVelorio) {
            elCardVelorio.style.display = 'flex';
            elQrVelorio.src = qrVelorioUrl;
            if (elTitVelorio) elTitVelorio.innerText = "VELÓRIO ON-LINE";
        }
    } else {
        // Quando NÃO constar velório online na Intuo, esconde o card
        if (elCardVelorio) {
            elCardVelorio.style.display = 'none';
        }
    }

    // 3. QR Flora & Redes (Rodapé Inferior)
    const urlFlora = "https://bosqueesperanca.com.br/flora/";
    const qrFloraUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlFlora)}`;
    const elQrFlora = document.getElementById('qr-flora');
    if (elQrFlora) {
        elQrFlora.src = qrFloraUrl;
    }

    const urlRedes = "https://linktr.ee/bosquedaesperanca";
    const qrRedesUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlRedes)}`;
    const elQrRedes = document.getElementById('qr-redes');
    if (elQrRedes) {
        elQrRedes.src = qrRedesUrl;
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

    // Nome da sala no badge: exibe APENAS "SALA X" ou "SALA IMERSIVA"
    const badgeSala = document.getElementById('badge-sala-nome');
    if (badgeSala) {
        const nomeFormatado = String(paramSala).toLowerCase().includes('imersiva') || paramSala === '3' 
            ? 'SALA IMERSIVA' 
            : `SALA ${paramSala}`;
        badgeSala.innerText = nomeFormatado.toUpperCase();
    }

    // Carrega os dados da Agenda do Dia
    await carregarAgendaDoDia();

    // Carrega vídeos de sala e inicia o ciclo
    await iniciarCicloVideosSala();
}

// 4. CARREGA E RENDERIZA A AGENDA DO DIA
let paginacaoIntervalSala = null;
const ITENS_POR_PAGINA_SALA = 5;
const TEMPO_POR_PAGINA_SALA = 15000; // 15 segundos por página

function formatarDestinoAgenda(destinoTexto, tipoServico) {
    const mapaNomesQuadras = {
        'PAIN II': 'PAINEIRAS II', 'PAIN': 'PAINEIRAS', 'PAINEIRAS II': 'PAINEIRAS II', 'PAINEIRAS': 'PAINEIRAS',
        'FLAMBOY': 'FLAMBOYANT', 'FLAMBOYANT': 'FLAMBOYANT', 'BOUN': 'BOUGAINVILLE', 'BOUGAINVILLE': 'BOUGAINVILLE',
        'ANGICO': 'ANGICO', 'ACACIA': 'ACÁCIA', 'ACÁCIA': 'ACÁCIA', 'HIBISCO': 'HIBISCO',
        'IPÊ': 'IPÊ', 'IPE': 'IPÊ', 'FICUS': 'FICUS', 'ANGELIM': 'ANGELIM',
        'BURITIS': 'BURITIS', 'MANACA': 'MANACÁ', 'MANACÁ': 'MANACÁ', 'MAGNOLIA': 'MAGNÓLIA', 'MAGNÓLIA': 'MAGNÓLIA'
    };

    if (destinoTexto && destinoTexto !== 'Consulte a ACM' && destinoTexto !== 'Consulte a recepção' && destinoTexto !== 'Direto') {
        if (/crema[çc][ãa]o/i.test(destinoTexto)) {
            return 'Cremação';
        } else if (destinoTexto.includes('QD:')) {
            const matchQd = destinoTexto.match(/QD:\s*([^.\n]+)/i);
            if (matchQd) {
                let qd = matchQd[1].trim().replace(/^\d+-/, '').trim().toUpperCase();
                return mapaNomesQuadras[qd] || qd;
            }
        } else if (/jazigo/i.test(destinoTexto) || /quadra/i.test(destinoTexto)) {
            let parte = destinoTexto;
            if (/jazigo/i.test(parte)) parte = parte.split(/jazigo/i)[0].replace(/[-–\s]+$/, '');
            if (/quadra/i.test(parte)) parte = parte.replace(/^.*quadra\s*/i, '');
            let qd = parte.trim().replace(/^\d+-/, '').trim().toUpperCase();
            return mapaNomesQuadras[qd] || qd;
        } else {
            const upper = destinoTexto.trim().toUpperCase();
            return mapaNomesQuadras[upper] || upper;
        }
    } else {
        if (tipoServico && String(tipoServico).toUpperCase().includes('CREMA')) {
            return 'Cremação';
        }
        return 'Consulte a ACM';
    }
}

function criarCardAgenda(item) {
    const status = calcularStatus(item.data_inicio, item.data_fim);
    const salaStr = item.sala ? String(item.sala).trim() : '';
    const salaLower = salaStr.toLowerCase();
    let sala = 'Direto';
    if (salaStr && salaStr !== '-' && salaLower !== 'n/d' && salaStr !== 'null') {
        if (salaLower.includes('imersiva') || salaStr === '3' || salaLower === 'sala 3') {
            sala = 'Sala Imersiva';
        } else if (salaLower.includes('sala') || salaLower.includes('direto')) {
            sala = salaStr;
        } else {
            sala = `Sala ${salaStr}`;
        }
    }

    const foto = item.foto || 'videos/logo_bosque.png';
    const horario = formatarHorario(item.data_inicio, item.data_fim);
    const destinoFormatado = formatarDestinoAgenda(item.destino, item.tipo_servico);

    const card = document.createElement('div');
    card.className = 'agenda-card' + (status.texto === 'Encerrado' ? ' agenda-card--encerrado' : '');
    card.innerHTML = `
        <img class="card-foto" src="${foto}" alt="Foto" onerror="this.src='videos/logo_bosque.png'">
        <div class="card-info">
            <div class="card-row-top">
                <div class="card-nome">${item.nome || 'Homenageado'}</div>
                <div class="card-status" style="color: ${status.cor};">${status.texto}</div>
            </div>
            <div class="card-row-bottom">
                <div class="card-meta">
                    <span class="card-sala">${sala}</span>
                    <span class="card-horario">${horario}</span>
                </div>
                <div class="card-destino">${destinoFormatado}</div>
            </div>
        </div>
    `;
    return card;
}

function iniciarPaginacaoSala(cards) {
    const grid = document.getElementById('agenda-grid-cards');
    if (!grid) return;

    clearInterval(paginacaoIntervalSala);
    
    // Limpa grid e remove linhas invisíveis anteriores
    grid.innerHTML = '';
    cards.forEach(c => grid.appendChild(c));

    let indicador = document.getElementById('indicador-paginacao-sala');
    if (!indicador) {
        indicador = document.createElement('div');
        indicador.id = 'indicador-paginacao-sala';
        indicador.className = 'indicador-paginacao-sala';
        grid.parentNode.appendChild(indicador);
    }

    const totalPaginas = Math.ceil(cards.length / ITENS_POR_PAGINA_SALA);

    // Ajusta o tempo de exibição da agenda antes de chamar os vídeos baseado na quantidade de páginas
    if (totalPaginas > 0) {
        agendarProximoVideoSala(totalPaginas);
    }

    // Se houver apenas 1 página (até 5 itens)
    if (cards.length <= ITENS_POR_PAGINA_SALA) {
        cards.forEach(card => {
            card.style.display = 'flex';
        });
        indicador.style.display = 'none';

        const itensFaltando = ITENS_POR_PAGINA_SALA - cards.length;
        for (let i = 0; i < itensFaltando; i++) {
            const dummy = document.createElement('div');
            dummy.className = 'agenda-card linha-invisivel';
            dummy.style.visibility = 'hidden';
            grid.appendChild(dummy);
        }
        return;
    }

    indicador.style.display = 'block';
    let paginaAtual = 0;

    function mostrarPaginaSala(novaPagina, animar = true, paginaAnterior = 0) {
        const isVoltando = novaPagina < paginaAnterior;
        const distanciaAnimacao = '30px';

        let textoIndicador = `Exibindo página ${novaPagina + 1} de ${totalPaginas}`;
        if (novaPagina === totalPaginas - 1) {
            textoIndicador = `Página ${novaPagina + 1} de ${totalPaginas} &nbsp;&nbsp;|&nbsp;&nbsp; <span style="color: var(--cor-dourado, #FAA507);">Retornando ao início...</span>`;
        }

        const aplicarTrocaDeItens = () => {
            cards.forEach(card => card.style.display = 'none');
            grid.querySelectorAll('.linha-invisivel').forEach(e => e.remove());

            const inicio = novaPagina * ITENS_POR_PAGINA_SALA;
            const fim = inicio + ITENS_POR_PAGINA_SALA;
            const itensPagina = cards.slice(inicio, fim);

            itensPagina.forEach(card => {
                card.style.display = 'flex';
            });

            const itensFaltando = ITENS_POR_PAGINA_SALA - itensPagina.length;
            for (let i = 0; i < itensFaltando; i++) {
                const dummy = document.createElement('div');
                dummy.className = 'agenda-card linha-invisivel';
                dummy.style.visibility = 'hidden';
                grid.appendChild(dummy);
            }

            indicador.innerHTML = textoIndicador;
        };

        if (!animar) {
            aplicarTrocaDeItens();
            grid.style.transform = 'translateY(0)';
            grid.style.opacity = '1';
            return;
        }

        // Animação de Saída (Slide & Fade)
        grid.style.transition = 'transform 0.4s ease-in, opacity 0.3s ease-in';
        indicador.style.opacity = '0';

        if (isVoltando) {
            grid.style.transform = `translateY(${distanciaAnimacao})`;
        } else {
            grid.style.transform = `translateY(-${distanciaAnimacao})`;
        }
        grid.style.opacity = '0';

        setTimeout(() => {
            aplicarTrocaDeItens();

            // Preparação para Entrada
            grid.style.transition = 'none';
            if (isVoltando) {
                grid.style.transform = `translateY(-${distanciaAnimacao})`;
            } else {
                grid.style.transform = `translateY(${distanciaAnimacao})`;
            }

            void grid.offsetHeight; // Trigger reflow

            // Animação de Entrada
            grid.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease-out';
            grid.style.transform = 'translateY(0)';
            grid.style.opacity = '1';
            indicador.style.opacity = '1';
        }, 400);
    }

    mostrarPaginaSala(paginaAtual, false);

    paginacaoIntervalSala = setInterval(() => {
        if (!modoSalaDisponivel) {
            clearInterval(paginacaoIntervalSala);
            return;
        }
        let paginaAnterior = paginaAtual;
        paginaAtual++;
        if (paginaAtual >= totalPaginas) {
            paginaAtual = 0;
        }
        mostrarPaginaSala(paginaAtual, true, paginaAnterior);
    }, TEMPO_POR_PAGINA_SALA);
}

async function carregarAgendaDoDia() {
    try {
        const res = await fetch('/api/hall');
        if (!res.ok) return;
        const lista = await res.json();

        const grid = document.getElementById('agenda-grid-cards');
        const indicador = document.getElementById('indicador-paginacao-sala');
        if (!grid) return;
        grid.innerHTML = '';

        if (!Array.isArray(lista) || lista.length === 0) {
            grid.innerHTML = `<div style="text-align: center; color: #718096; font-size: 1.2rem; font-weight: 600; padding: 40px; width: 100%;">Nenhuma cerimônia programada no momento.</div>`;
            if (indicador) indicador.style.display = 'none';
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
            grid.innerHTML = `<div style="text-align: center; color: #718096; font-size: 1.2rem; font-weight: 600; padding: 40px; width: 100%;">Nenhuma cerimônia programada no momento.</div>`;
            if (indicador) indicador.style.display = 'none';
            return;
        }

        // 3. Ordenação idêntica ao painel principal (Hall / Index)
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

        // 4. Cria os elementos dos cards
        const cards = listaValida.map(item => criarCardAgenda(item));

        // 5. Inicia o esquema de paginação de 5 itens por página
        iniciarPaginacaoSala(cards);

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

function agendarProximoVideoSala(totalPaginas = 1) {
    clearTimeout(timerAlternanciaVideo);
    const tempoExibicao = Math.max(30000, totalPaginas * TEMPO_POR_PAGINA_SALA);
    timerAlternanciaVideo = setTimeout(() => {
        if (!modoSalaDisponivel) return;
        reproduzirVideoSala();
    }, tempoExibicao);
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
    };
}

function pararCicloVideosSala() {
    clearTimeout(timerAlternanciaVideo);
    clearInterval(paginacaoIntervalSala);
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

function calcularStatus(data_inicio, data_fim) {
    const agora = new Date();
    const inicio = new Date(data_inicio);
    const fim = new Date(data_fim);
    
    const trintaMinAntes = new Date(fim.getTime() - 30 * 60 * 1000);
    const vinteMinDepois = new Date(fim.getTime() + 20 * 60 * 1000);

    if (agora < inicio) {
        return { texto: 'Previsto', cor: '#3B82F6' }; // Azul
    } else if (agora < trintaMinAntes) {
        return { texto: 'Em andamento', cor: '#01813D' }; // Verde
    } else if (agora >= trintaMinAntes && agora <= vinteMinDepois) {
        return { texto: 'Encerrando', cor: '#FAA507' }; // Laranja
    } else {
        return { texto: 'Encerrado', cor: '#cf0303' }; // Vermelho
    }
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

