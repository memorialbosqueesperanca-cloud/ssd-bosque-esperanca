/* ==========================================================================
   SISTEMA BOSQUE DA ESPERANÇA - PAINEL DO HALL (VERSÃO LIVE)
   ========================================================================== */

// 1. RELÓGIO E DATA
function atualizarDataHora() {
    const agora = new Date();
    const opcoesData = { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' };
    let dataTexto = agora.toLocaleDateString('pt-BR', opcoesData).toUpperCase();

    const elTitulo = document.querySelector('.painel-header__titulo');
    const elRelogio = document.querySelector('.header-relogio');

    if (elTitulo) elTitulo.innerText = dataTexto;
    if (elRelogio) elRelogio.innerText = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// 2. CALCULA O STATUS COM BASE NO HORÁRIO ATUAL
function calcularStatus(data_inicio, data_fim) {
    const agora = new Date();
    const inicio = new Date(data_inicio);
    const fim = new Date(data_fim);
    
    const trintaMinAntes = new Date(fim.getTime() - 30 * 60 * 1000);
    const vinteMinDepois = new Date(fim.getTime() + 20 * 60 * 1000);

    if (agora < inicio) {
        return { texto: 'Previsto', cor: '#012b6f' }; // Azul
    } else if (agora < trintaMinAntes) {
        return { texto: 'Em andamento', cor: '#026732' }; // Verde original
    } else if (agora >= trintaMinAntes && agora <= vinteMinDepois) {
        return { texto: 'Encerrando', cor: '#dd9103' }; // Laranja
    } else {
        return { texto: 'Encerrado', cor: '#cf0303' }; // Vermelho
    }
}

// 3. FORMATA HORÁRIO
function formatarHoraUniversal(str) {
    if (!str) return '--:--';
    const s = String(str).trim();
    if (s.endsWith('Z')) {
        return new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    }
    const limpo = s.replace(/\.\d+$/, '');
    return limpo.includes('T') ? limpo.split('T')[1].slice(0, 5) : limpo.slice(0, 5);
}

function formatarHorario(data_inicio, data_fim) {
    if (!data_inicio || !data_fim) return 'Horário a definir';
    return `${formatarHoraUniversal(data_inicio)} às ${formatarHoraUniversal(data_fim)}`;
}

// 4. BUSCA NO BACKEND
async function buscarDados() {
    try {
        const response = await fetch('/api/hall');
        if (!response.ok) throw new Error('Erro ao buscar dados');
        const memoriais = await response.json();
        salvarCacheDadosAPI(memoriais);
        const dadosCompletos = mesclarEmergencia(memoriais);
        renderizar(dadosCompletos);
    } catch (err) {
        console.error("Erro ao carregar dados do Hall:", err);
        const memoriaisCache = carregarCacheDadosAPI();
        if (memoriaisCache.length > 0) {
            renderizar(mesclarEmergencia(memoriaisCache));
        } else {
            renderizar(mesclarEmergencia([]));
        }
    }
}

// 5. RENDERIZAÇÃO DA TABELA E PAGINAÇÃO
function renderizar(lista) {
    const corpo = document.getElementById('painel-corpo');
    if (!corpo) return;

    // Filtrar velórios encerrados há mais de 3 horas
    const agoraFiltro = new Date().getTime();
    const tresHorasEmMs = 3 * 60 * 60 * 1000;
    
    lista = lista.filter(item => {
        if (!item.data_fim) return true; 
        const fimTempo = new Date(item.data_fim).getTime();
        return (agoraFiltro - fimTempo) <= tresHorasEmMs;
    });

    if (lista.length === 0) {
        corpo.innerHTML = '<div class="info-row"><div class="text-default" style="width:100%; text-align:center;">Nenhuma homenagem agendada para hoje.</div></div>';
        return;
    }

    corpo.innerHTML = '';

    const ordemStatus = { 'Encerrando': 0, 'Em andamento': 1, 'Previsto': 2, 'Encerrado': 3 };
    lista.sort((a, b) => {
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

    const listaFiltrada = lista.filter(item => {
        const tipo = String(item.tipo_servico || '').toUpperCase();
        const dest = String(item.destino || '').toUpperCase();
        const salaStr = item.sala ? String(item.sala).trim().toLowerCase() : '';

        // Ignora serviços PET / Cremação PET
        if (tipo.includes('PET') || dest.includes('PET') || salaStr.includes('pet')) {
            return false;
        }
        return true;
    });

    listaFiltrada.forEach(item => {
        const linha = document.createElement('div');
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
            
        const foto = item.foto ? item.foto : 'videos/logo_bosque.png';

        linha.className = 'info-row' + (status.texto === 'Encerrado' ? ' info-row--encerrado' : '');
        
        if (item.isEmergencia) {
            linha.classList.add('info-row--emergencia');
            if (item.emergenciaIndex !== undefined) {
                linha.setAttribute('data-emergencia-index', item.emergenciaIndex);
            }
        }
        
        const salasEsquerda = ['5', '6', '7', '8'];
        const numeroApenas = String(item.sala).replace(/\D/g, '');
        const setaEsquerda = salasEsquerda.includes(numeroApenas);

        const svgSeta = setaEsquerda
            ? `<svg class="info-row__icon" viewBox="0 0 24 24"><path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`
            : `<svg class="info-row__icon" viewBox="0 0 24 24"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

        let destinoTexto = item.destino || "Consulte a ACM";
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

        if (destinoTexto && destinoTexto !== 'Consulte a ACM' && destinoTexto !== 'Consulte a recepção' && destinoTexto !== 'Direto') {
            if (/crema[çc][ãa]o/i.test(destinoTexto)) {
                destinoTexto = 'Cremação';
            } else if (destinoTexto.includes('QD:')) {
                const matchQd = destinoTexto.match(/QD:\s*([^.\n]+)/i);
                if (matchQd) {
                    let qd = matchQd[1].trim().replace(/^\d+-/, '').trim().toUpperCase();
                    destinoTexto = mapaNomesQuadras[qd] || qd;
                }
            } else if (/jazigo/i.test(destinoTexto) || /quadra/i.test(destinoTexto)) {
                let parte = destinoTexto;
                if (/jazigo/i.test(parte)) parte = parte.split(/jazigo/i)[0].replace(/[-–\s]+$/, '');
                if (/quadra/i.test(parte)) parte = parte.replace(/^.*quadra\s*/i, '');
                let qd = parte.trim().replace(/^\d+-/, '').trim().toUpperCase();
                destinoTexto = mapaNomesQuadras[qd] || qd;
            } else {
                const upper = destinoTexto.toUpperCase();
                if (mapaNomesQuadras[upper]) destinoTexto = mapaNomesQuadras[upper];
            }
        } else {
            if (item.tipo_servico && String(item.tipo_servico).toUpperCase().includes('CREMA')) {
                destinoTexto = 'Cremação';
            } else {
                destinoTexto = 'Consulte a ACM';
            }
        }

        const estiloTextoLongo = `white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2;`;

        linha.innerHTML = `
            ${svgSeta}
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${foto}" onerror="this.src='videos/logo_bosque.png'">
            </div>
            <div class="info-nome text-default" style="${estiloTextoLongo}">${item.nome || 'Homenageado'}</div>
            <div class="info-sala text-default" style="${estiloTextoLongo}">${sala}</div>
            <div class="info-horario text-default">${formatarHorario(item.data_inicio, item.data_fim)}</div>
            <div class="info-destino text-default" style="${estiloTextoLongo}">${destinoTexto}</div>
            <div class="info-status text-highlight" style="color:${status.cor};">${status.texto}</div>
        `;
        corpo.appendChild(linha);
    });

    iniciarPaginacao();
}

// 5.1 FUNÇÃO DE PAGINAÇÃO AUTOMÁTICA
let paginacaoInterval;

function iniciarPaginacao() {
    const ITENS_POR_PAGINA = 4; // Ajustado para 4 para testes
    const TEMPO_POR_PAGINA = 120000; // Alterado para 2 minutos
    let paginaAtual = 0;

    const painelCorpo = document.getElementById('painel-corpo');
    const todasLinhas = Array.from(painelCorpo.querySelectorAll('.info-row:not(.linha-invisivel)'));

    clearInterval(paginacaoInterval);
    
    document.querySelectorAll('.linha-invisivel').forEach(e => e.remove());
    let indicador = document.getElementById('indicador-paginacao');
    
    if (!indicador) {
        indicador = document.createElement('div');
        indicador.id = 'indicador-paginacao';
        indicador.style.textAlign = 'center';
        indicador.style.padding = '10px';
        indicador.style.color = '#888';
        indicador.style.fontSize = 'clamp(12px, 1.2vw, 16px)';
        indicador.style.fontWeight = '700';
        indicador.style.textTransform = 'uppercase';
        indicador.style.letterSpacing = '1px';
        indicador.style.transition = 'opacity 0.4s ease';
        painelCorpo.parentNode.insertBefore(indicador, painelCorpo.nextSibling);
    }

    const totalPaginas = Math.ceil(todasLinhas.length / ITENS_POR_PAGINA);

    // Ajusta o tempo de exibição do vídeo baseado na quantidade de páginas
    if (totalPaginas > 0) {
        tempoExibicaoTabela = totalPaginas * TEMPO_POR_PAGINA;
    } else {
        tempoExibicaoTabela = 15000;
    }

    // Aplicar linhas fantasmas mesmo se houver APENAS 1 página
    if (todasLinhas.length <= ITENS_POR_PAGINA) {
        todasLinhas.forEach(linha => linha.style.display = 'grid');
        indicador.style.display = 'none';
        
        const itensFaltando = ITENS_POR_PAGINA - todasLinhas.length;
        for (let i = 0; i < itensFaltando; i++) {
            const dummy = document.createElement('div');
            dummy.className = 'info-row linha-invisivel';
            dummy.style.visibility = 'hidden'; 
            painelCorpo.appendChild(dummy);
        }
        return; 
    }

    indicador.style.display = 'block';

    function mostrarPagina(novaPagina, animar = true, paginaAnterior = 0) {
        const isVoltando = novaPagina < paginaAnterior;
        const distanciaAnimação = '40px'; 
        
        let textoIndicador = `Exibindo página ${novaPagina + 1} de ${totalPaginas}`;
        if (novaPagina === totalPaginas - 1) {
            textoIndicador = `Página ${novaPagina + 1} de ${totalPaginas} &nbsp;&nbsp;|&nbsp;&nbsp; <span style="color: var(--cor-secundaria, #FAA507);">Retornando ao início...</span>`;
        }
        
        const aplicarTrocaDeItens = () => {
            todasLinhas.forEach(linha => linha.style.display = 'none');
            document.querySelectorAll('.linha-invisivel').forEach(e => e.remove());

            const inicio = novaPagina * ITENS_POR_PAGINA;
            const fim = inicio + ITENS_POR_PAGINA;
            const linhasPagina = todasLinhas.slice(inicio, fim);
            
            linhasPagina.forEach(linha => linha.style.display = 'grid');

            const itensFaltando = ITENS_POR_PAGINA - linhasPagina.length;
            for (let i = 0; i < itensFaltando; i++) {
                const dummy = document.createElement('div');
                dummy.className = 'info-row linha-invisivel';
                dummy.style.visibility = 'hidden'; 
                painelCorpo.appendChild(dummy);
            }

            indicador.innerHTML = textoIndicador;
        };

        if (!animar) {
            aplicarTrocaDeItens();
            painelCorpo.style.transform = 'translateY(0)';
            painelCorpo.style.opacity = '1';
            return;
        }

        // Saída
        painelCorpo.style.transition = 'transform 0.4s ease-in, opacity 0.3s ease-in';
        indicador.style.opacity = '0';
        
        if (isVoltando) {
            painelCorpo.style.transform = `translateY(${distanciaAnimação})`; 
        } else {
            painelCorpo.style.transform = `translateY(-${distanciaAnimação})`; 
        }
        painelCorpo.style.opacity = '0';

        setTimeout(() => {
            aplicarTrocaDeItens(); 

            // Entrada
            painelCorpo.style.transition = 'none'; 
            
            if (isVoltando) {
                painelCorpo.style.transform = `translateY(-${distanciaAnimação})`; 
            } else {
                painelCorpo.style.transform = `translateY(${distanciaAnimação})`; 
            }
            
            void painelCorpo.offsetHeight;

            painelCorpo.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease-out';
            painelCorpo.style.transform = 'translateY(0)'; 
            painelCorpo.style.opacity = '1'; 
            indicador.style.opacity = '1';
            
        }, 400); 
    }

    mostrarPagina(paginaAtual, false);

    paginacaoInterval = setInterval(() => {
        let paginaAnterior = paginaAtual;
        paginaAtual++;
        
        if (paginaAtual >= totalPaginas) {
            paginaAtual = 0; 
        }
        
        mostrarPagina(paginaAtual, true, paginaAnterior);
    }, TEMPO_POR_PAGINA);
}

// 6. INICIALIZAÇÃO E VÍDEOS
const urlParamsHall = new URLSearchParams(window.location.search);
const isModoSala = urlParamsHall.get('modo') === 'sala';

if (isModoSala) {
    window.addEventListener('DOMContentLoaded', () => {
        const btnEmergencia = document.getElementById('btn-emergencia');
        if (btnEmergencia) btnEmergencia.style.display = 'none';
    });
}

const VIDEO_CONFIG_URL = '/api/video-config';
const DEFAULT_VIDEOS_HALL = ['videos/video1.mp4', 'videos/video2.mp4'];
const DEFAULT_VIDEOS_SALA = ['videos/video-sala1.mp4', 'videos/video-sala2.mp4'];
const CACHE_VIDEO_KEY = 'painel_video_cache';

async function carregarConfiguracaoVideosServidor() {
    try {
        const response = await fetch(VIDEO_CONFIG_URL);
        if (!response.ok) throw new Error('Falha ao carregar configuração de vídeo');
        const config = await response.json();
        
        localStorage.setItem(CACHE_VIDEO_KEY, JSON.stringify(config));
        
        return {
            hall: Array.isArray(config.hall) && config.hall.length > 0 ? config.hall : DEFAULT_VIDEOS_HALL,
            sala: Array.isArray(config.sala) && config.sala.length > 0 ? config.sala : DEFAULT_VIDEOS_SALA
        };
    } catch (err) {
        console.warn('Falha ao carregar configuração de vídeos do servidor. Tentando cache...', err);
        const cacheRaw = localStorage.getItem(CACHE_VIDEO_KEY);
        if (cacheRaw) {
            try {
                const config = JSON.parse(cacheRaw);
                return {
                    hall: Array.isArray(config.hall) && config.hall.length > 0 ? config.hall : DEFAULT_VIDEOS_HALL,
                    sala: Array.isArray(config.sala) && config.sala.length > 0 ? config.sala : DEFAULT_VIDEOS_SALA
                };
            } catch (e) {}
        }
        return { hall: DEFAULT_VIDEOS_HALL, sala: DEFAULT_VIDEOS_SALA };
    }
}

let arquivosVideos = isModoSala ? DEFAULT_VIDEOS_SALA : DEFAULT_VIDEOS_HALL;
let tempoExibicaoTabela = 120000; // O valor será ajustado dinamicamente pela função iniciarPaginacao()
let indiceVideoAtual = 0;

async function aplicarConfiguracaoVideos() {
    const config = await carregarConfiguracaoVideosServidor();
    arquivosVideos = isModoSala ? config.sala : config.hall;
    if (!Array.isArray(arquivosVideos) || arquivosVideos.length === 0) {
        arquivosVideos = isModoSala ? DEFAULT_VIDEOS_SALA : DEFAULT_VIDEOS_HALL;
    }
}

// Verifica se é final de semana ou sexta-feira após as 18h
function isFinalDeSemanaSoVideo() {
    const hoje = new Date();
    const diaDaSemana = hoje.getDay(); // 0 = Domingo, 5 = Sexta, 6 = Sábado
    const hora = hoje.getHours();
    
    // Retorna true se for Sábado (6) ou Domingo (0)
    if (diaDaSemana === 0 || diaDaSemana === 6) {
        return true;
    }
    
    // Retorna true se for Sexta-feira (5) e a hora for 18h ou mais
    if (diaDaSemana === 5 && hora >= 18) {
        return true;
    }
    
    return false;
}

async function alternarConteudo() {
    await aplicarConfiguracaoVideos();
    
    if (indiceVideoAtual >= arquivosVideos.length) {
        indiceVideoAtual = 0;
    }

    const videoTag = document.getElementById('meuVideo');
    const sourceTag = document.getElementById('meuVideoSource');
    const overlay = document.getElementById('video-overlay');

    if (!videoTag || !overlay || arquivosVideos.length === 0) {
        setTimeout(alternarConteudo, tempoExibicaoTabela);
        return;
    }

    sourceTag.src = arquivosVideos[indiceVideoAtual];
    videoTag.muted = true;
    videoTag.playsInline = true;
    videoTag.load();
    overlay.style.display = 'block';
    
    videoTag.play().catch((err) => {
        // Trata interrupção benigna por economia de energia do Chrome / aba em segundo plano
        if (err && (err.name === 'AbortError' || String(err.message).includes('paused to save power'))) {
            // Não loga como erro crítico: o navegador apenas economizou energia na aba em segundo plano
            return;
        }

        console.warn("Erro ao reproduzir vídeo:", err.message || err);
        indiceVideoAtual = (indiceVideoAtual + 1) % arquivosVideos.length;
        
        // Tratamento de erro: se der falha, pula pro próximo
        if (isFinalDeSemanaSoVideo()) {
            setTimeout(alternarConteudo, 1000); 
        } else {
            overlay.style.display = 'none';
            setTimeout(alternarConteudo, tempoExibicaoTabela); 
        }
    });

    videoTag.onended = () => {
        indiceVideoAtual = (indiceVideoAtual + 1) % arquivosVideos.length;
        
        if (isFinalDeSemanaSoVideo()) {
            // Emenda o próximo vídeo imediatamente, sem voltar para a tabela
            alternarConteudo();
        } else {
            // Comportamento normal: oculta o vídeo e volta pra tabela
            overlay.style.display = 'none'; 
            setTimeout(alternarConteudo, tempoExibicaoTabela);
        }
    };
}

// --- PAINEL DE EMERGÊNCIA ---

let emergencyEntradas = [];
let editandoIndex = -1; 

const EMERGENCY_KEY = 'painel_emergencia_dados';
const CACHE_API_KEY = 'painel_hall_cache';

function salvarEntradasEmergencia() {
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(emergencyEntradas));
}

function salvarCacheDadosAPI(dados) {
    localStorage.setItem(CACHE_API_KEY, JSON.stringify({ timestamp: Date.now(), dados }));
}

function carregarCacheDadosAPI() {
    try {
        const raw = localStorage.getItem(CACHE_API_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.dados)) return [];
        return parsed.dados;
    } catch (err) {
        localStorage.removeItem(CACHE_API_KEY);
        return [];
    }
}

function carregarEntradasEmergencia() {
    try {
        const raw = localStorage.getItem(EMERGENCY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        
        const agora = new Date();
        const limite = new Date(agora.getTime() - 4 * 60 * 60 * 1000);
        emergencyEntradas = parsed.filter(e => new Date(e.data_fim) > limite);
        
        if (emergencyEntradas.length !== parsed.length) {
            salvarEntradasEmergencia(); 
        }
        
        return emergencyEntradas;
    } catch (err) {
        localStorage.removeItem(EMERGENCY_KEY);
        return [];
    }
}

function normalizarTextoParaComparacao(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function mesclarEmergencia(dadosAPI) {
    if (!Array.isArray(dadosAPI)) dadosAPI = [];
    
    if (dadosAPI.length > 0) {
        let houveExclusao = false;
        const entradasValidas = emergencyEntradas.filter(manual => {
            const nomeManual = normalizarTextoParaComparacao(manual.nome);
            const numSalaManual = String(manual.sala).replace(/\D/g, '');
            const inicioManual = new Date(manual.data_inicio);
            const fimManual = new Date(manual.data_fim);
            
            const conflitoComAPI = dadosAPI.some(apiItem => {
                const nomeAPI = normalizarTextoParaComparacao(apiItem.nome);
                
                // 1. Mesmo falecido já retornado pela API oficial
                if (nomeManual && nomeAPI && (nomeManual === nomeAPI || nomeAPI.includes(nomeManual) || nomeManual.includes(nomeAPI))) {
                    return true;
                }

                // 2. Mesma sala com sobreposição de horário
                const numSalaAPI = String(apiItem.sala).replace(/\D/g, '');
                if (numSalaManual && numSalaAPI && numSalaManual === numSalaAPI) {
                    const inicioAPI = new Date(apiItem.data_inicio);
                    const fimAPI = new Date(apiItem.data_fim);
                    return (inicioManual < fimAPI && fimManual > inicioAPI);
                }
                
                return false;
            });
            
            if (conflitoComAPI) houveExclusao = true;
            return !conflitoComAPI;
        });
        
        if (houveExclusao) {
            emergencyEntradas = entradasValidas;
            salvarEntradasEmergencia();
            if (typeof atualizarStatusEmergencia === 'function') {
                setTimeout(atualizarStatusEmergencia, 0);
            }
        }
    }
    
    // Concatena e aplica garantia final de não duplicar nomes idênticos no painel
    const resultado = [...dadosAPI];
    emergencyEntradas.forEach((item, index) => {
        const nomeManual = normalizarTextoParaComparacao(item.nome);
        const jaExiste = resultado.some(r => normalizarTextoParaComparacao(r.nome) === nomeManual);
        if (!jaExiste) {
            resultado.push({ ...item, isEmergencia: true, emergenciaIndex: index });
        }
    });

    return resultado;
}

function parseCSV(csvText) {
    const linhas = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (linhas.length < 2) return [];
    const separador = linhas[0].includes(';') ? ';' : ',';
    const cabecalhos = linhas[0].split(separador).map(h => h.trim().toLowerCase());
    
    return linhas.slice(1).map(linha => {
        const valores = linha.split(separador);
        const item = {};
        
        cabecalhos.forEach((cabecalho, index) => {
            let valor = valores[index]?.trim() || '';
            if (cabecalho.includes('nome')) item.nome = valor;
            else if (cabecalho.includes('sala')) item.sala = valor;
            else if (cabecalho.includes('inicio') || cabecalho.includes('data_inicio')) item.data_inicio = valor;
            else if (cabecalho.includes('fim') || cabecalho.includes('termino') || cabecalho.includes('data_fim')) item.data_fim = valor;
            else if (cabecalho.includes('destino') || cabecalho.includes('quadra')) item.destino = valor;
            else if (cabecalho.includes('foto')) item.foto = valor;
        });
        
        return item;
    }).filter(item => item.nome); 
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    carregarEntradasEmergencia();
    atualizarStatusEmergencia();
    await aplicarConfiguracaoVideos();
    buscarDados();
    
    // Atualiza os dados a cada 10 minutos para não interromper a exibição completa das tabelas
    setInterval(buscarDados, 600000); 
    
    // Verifica se é final de semana na inicialização
    if (isFinalDeSemanaSoVideo()) {
        alternarConteudo();
    } else {
        setTimeout(alternarConteudo, tempoExibicaoTabela);
    }

    setInterval(() => {
        const dataReload = new Date();
        if (dataReload.getHours() === 3 && dataReload.getMinutes() === 0) {
            window.location.reload(true);
        }
    }, 60000);

    window.addEventListener('online', () => {
        atualizarStatusEmergencia();
        buscarDados();
    });

    window.addEventListener('offline', () => {
        atualizarStatusEmergencia();
        const memoriaisCache = carregarCacheDadosAPI();
        if (memoriaisCache.length > 0) {
            renderizar(mesclarEmergencia(memoriaisCache));
        }
    });
    
    const relogio = document.querySelector('.header-relogio');
    if (relogio) {
        relogio.addEventListener('dblclick', (e) => {
            e.stopPropagation(); 
            window.location.href = '/admin-videos.html';
        });
    }
    
    const btnEmergencia = document.getElementById('btn-emergencia');
    const btnExportarExcel = document.getElementById('btn-exportar-excel');
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    const overlayEmergencia = document.getElementById('emergencia-overlay');
    const fecharEmergencia = document.getElementById('fechar-emergencia');
    const btnAdicionarManual = document.getElementById('btn-adicionar-manual');
    const btnLimparEmergencia = document.getElementById('btn-limpar-emergencia');
    const btnImportarArquivo = document.getElementById('btn-importar-arquivo');
    const inputArquivo = document.getElementById('arquivo-excel');

    if (btnExportarExcel) {
        btnExportarExcel.addEventListener('click', () => {
            window.location.href = '/api/exportar/excel';
        });
    }

    if (btnExportarPdf) {
        btnExportarPdf.addEventListener('click', () => {
            window.open('/imprimir-agenda.html?autoprint=1', '_blank');
        });
    }
    
    if (btnEmergencia) {
        btnEmergencia.addEventListener('click', () => {
            overlayEmergencia.classList.add('active');
            atualizarStatusEmergencia();
            
            const hoje = new Date();
            const tzOffset = hoje.getTimezoneOffset() * 60000;
            const dataAtual = (new Date(hoje - tzOffset)).toISOString().slice(0, 16); 
            const inicioInput = document.getElementById('emergencia-inicio');
            if (inicioInput && !inicioInput.value) {
                inicioInput.value = dataAtual;
            }
        });
    }
    
    if (fecharEmergencia) {
        fecharEmergencia.addEventListener('click', () => overlayEmergencia.classList.remove('active'));
    }
    
    if (overlayEmergencia) {
        overlayEmergencia.addEventListener('click', (e) => {
            if (e.target === overlayEmergencia) overlayEmergencia.classList.remove('active');
        });
    }
    
    const editOverlay = document.getElementById('emergencia-edit-overlay');
    const editForm = document.getElementById('emergencia-edit-form');
    const btnEditCancelar = document.getElementById('btn-edit-cancelar');
    const btnEditExcluir = document.getElementById('btn-edit-excluir');
    const btnEditSalvar = document.getElementById('btn-edit-salvar');
    
    document.addEventListener('click', (e) => {
        const row = e.target.closest('.info-row--emergencia');
        if (row && row.hasAttribute('data-emergencia-index')) {
            const index = parseInt(row.getAttribute('data-emergencia-index'));
            if (index >= 0 && index < emergencyEntradas.length) {
                abrirModalEdicao(index);
            }
        }
    });
    
    if (btnEditCancelar) {
        btnEditCancelar.addEventListener('click', () => {
            editOverlay.classList.remove('active');
            editandoIndex = -1;
        });
    }
    
    if (editOverlay) {
        editOverlay.addEventListener('click', (e) => {
            if (e.target === editOverlay) {
                editOverlay.classList.remove('active');
                editandoIndex = -1;
            }
        });
    }
    
    if (btnEditSalvar) {
        btnEditSalvar.addEventListener('click', () => salvarEdicaoEmergencia());
    }
    
    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarEdicaoEmergencia();
        });
    }
    
    if (btnEditExcluir) {
        btnEditExcluir.addEventListener('click', async () => {
            if (editandoIndex >= 0 && confirm('Tem certeza que deseja excluir esta entrada?')) {
                const entrada = emergencyEntradas[editandoIndex];
                emergencyEntradas.splice(editandoIndex, 1);
                salvarEntradasEmergencia();

                try {
                    const chave = entrada.chave_cruzamento || normalizarTextoParaComparacao(entrada.nome || entrada.nome_falecido);
                    await fetch('/api/eventos/restaurar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chave_cruzamento: chave })
                    });
                } catch (err) {
                    console.warn('Backend indisponível ao excluir:', err);
                }

                await buscarDados();
                atualizarStatusEmergencia();
                editOverlay.classList.remove('active');
                editandoIndex = -1;
                alert('Entrada excluída com sucesso!');
            }
        });
    }
    
    if (btnAdicionarManual) {
        btnAdicionarManual.addEventListener('click', () => {
            const nome = document.getElementById('emergencia-nome').value.trim();
            const sala = document.getElementById('emergencia-sala').value.trim();
            const inicio = document.getElementById('emergencia-inicio').value;
            const fim = document.getElementById('emergencia-fim').value;
            const destino = document.getElementById('emergencia-destino').value.trim();
            const fotoInput = document.getElementById('emergencia-foto-upload');
            
            if (!nome || !sala || !inicio || !fim) {
                alert('Por favor, preencha pelo menos nome, sala, data/hora de início e fim.');
                return;
            }
            
            let foto = null;
            if (fotoInput && fotoInput.files && fotoInput.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    foto = e.target.result;
                    adicionarEntradaEmergencia({ nome, sala, data_inicio: inicio, data_fim: fim, destino, foto });
                };
                reader.readAsDataURL(fotoInput.files[0]);
            } else {
                adicionarEntradaEmergencia({ nome, sala, data_inicio: inicio, data_fim: fim, destino, foto });
            }
        });
    }
    
    if (btnLimparEmergencia) {
        btnLimparEmergencia.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todas as entradas locais de emergência?')) {
                emergencyEntradas = [];
                salvarEntradasEmergencia();
                buscarDados(); 
                atualizarStatusEmergencia();
                alert('Entradas locais limpas com sucesso!');
            }
        });
    }
    
    if (btnImportarArquivo) {
        btnImportarArquivo.addEventListener('click', () => {
            if (!inputArquivo.files || !inputArquivo.files[0]) {
                alert('Por favor, selecione um arquivo CSV ou Excel.');
                return;
            }
            
            const file = inputArquivo.files[0];
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    const csvText = e.target.result;
                    const dadosImportados = parseCSV(csvText);
                    
                    if (dadosImportados.length === 0) {
                        alert('Nenhum dado válido encontrado no arquivo.');
                        return;
                    }
                    
                    for (const item of dadosImportados) {
                        if (item.nome) {
                            const entradaObj = {
                                nome: item.nome,
                                sala: item.sala || 'Sala não informada',
                                data_inicio: item.data_inicio || new Date().toISOString(),
                                data_fim: item.data_fim || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                                destino: item.destino || 'Consulte a recepção',
                                foto: item.foto || null,
                                isEmergencia: true
                            };
                            emergencyEntradas.push(entradaObj);

                            try {
                                await fetch('/api/eventos/editar', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        nome_falecido: entradaObj.nome,
                                        sala: entradaObj.sala,
                                        data_inicio: entradaObj.data_inicio,
                                        data_fim: entradaObj.data_fim,
                                        destino: entradaObj.destino,
                                        foto_url: entradaObj.foto,
                                        tipo_servico: 'VELÓRIO',
                                        visivel: 1
                                    })
                                });
                            } catch (err) {}
                        }
                    }
                    
                    salvarEntradasEmergencia();
                    await buscarDados(); 
                    atualizarStatusEmergencia();
                    alert(`${dadosImportados.length} registros importados e sincronizados com sucesso!`);
                    
                } catch (err) {
                    console.error('Erro ao processar arquivo:', err);
                    alert('Erro ao processar o arquivo. Verifique o formato.');
                }
            };
            
            reader.readAsText(file);
        });
    }
});

async function adicionarEntradaEmergencia(dados) {
    emergencyEntradas.push({
        ...dados,
        isEmergencia: true
    });
    
    salvarEntradasEmergencia();

    try {
        await fetch('/api/eventos/editar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome_falecido: dados.nome,
                sala: dados.sala,
                data_inicio: dados.data_inicio,
                data_fim: dados.data_fim,
                destino: dados.destino,
                foto_url: dados.foto,
                tipo_servico: 'VELÓRIO',
                visivel: 1
            })
        });
    } catch (err) {
        console.warn('Backend offline, salvo no storage local:', err);
    }

    await buscarDados(); 
    atualizarStatusEmergencia();
    
    document.getElementById('emergencia-nome').value = '';
    document.getElementById('emergencia-sala').value = '';
    document.getElementById('emergencia-inicio').value = '';
    document.getElementById('emergencia-fim').value = '';
    document.getElementById('emergencia-destino').value = '';
    const elFoto = document.getElementById('emergencia-foto-upload');
    if (elFoto) elFoto.value = '';
    
    alert('Entrada manual adicionada com sucesso!');
    
    const overlayEmergencia = document.getElementById('emergencia-overlay');
    if (overlayEmergencia) overlayEmergencia.classList.remove('active');
}

function abrirModalEdicao(index) {
    if (index < 0 || index >= emergencyEntradas.length) return;
    
    const entrada = emergencyEntradas[index];
    editandoIndex = index;
    
    document.getElementById('edit-nome').value = entrada.nome || '';
    document.getElementById('edit-sala').value = entrada.sala || '';
    document.getElementById('edit-inicio').value = entrada.data_inicio ? new Date(entrada.data_inicio).toISOString().slice(0, 16) : '';
    document.getElementById('edit-fim').value = entrada.data_fim ? new Date(entrada.data_fim).toISOString().slice(0, 16) : '';
    document.getElementById('edit-destino').value = entrada.destino || '';
    
    document.getElementById('emergencia-edit-overlay').classList.add('active');
}

async function salvarEdicaoEmergencia() {
    if (editandoIndex < 0 || editandoIndex >= emergencyEntradas.length) return;
    
    const nome = document.getElementById('edit-nome').value.trim();
    const sala = document.getElementById('edit-sala').value.trim();
    const inicio = document.getElementById('edit-inicio').value;
    const fim = document.getElementById('edit-fim').value;
    const destino = document.getElementById('edit-destino').value.trim();
    
    if (!nome || !sala || !inicio || !fim) {
        alert('Por favor, preencha pelo menos nome, sala, data/hora de início e fim.');
        return;
    }
    
    const entradaAntiga = emergencyEntradas[editandoIndex];
    emergencyEntradas[editandoIndex] = {
        ...emergencyEntradas[editandoIndex],
        nome, sala, data_inicio: inicio, data_fim: fim, destino
    };
    
    salvarEntradasEmergencia();

    try {
        await fetch('/api/eventos/editar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chave_cruzamento: entradaAntiga.chave_cruzamento || undefined,
                nome_falecido: nome,
                sala: sala,
                data_inicio: inicio,
                data_fim: fim,
                destino: destino,
                tipo_servico: 'VELÓRIO',
                visivel: 1
            })
        });
    } catch (err) {
        console.warn('Backend offline, salvo localmente:', err);
    }

    await buscarDados();
    atualizarStatusEmergencia();
    
    document.getElementById('emergencia-edit-overlay').classList.remove('active');
    editandoIndex = -1;
    
    alert('Entrada manual atualizada com sucesso!');
}

function atualizarStatusEmergencia() {
    const timestampEl = document.getElementById('cache-timestamp');
    const conexaoEl = document.getElementById('conexao-status');
    
    if (timestampEl) {
        const agora = new Date();
        timestampEl.textContent = agora.toLocaleString('pt-BR', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit', 
            day: '2-digit', month: '2-digit', year: 'numeric' 
        });
    }
    
    if (conexaoEl) {
        conexaoEl.textContent = navigator.onLine ? 'Online' : 'Offline';
    }
}

document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => { 
            console.warn(`Erro ao tentar ativar tela cheia: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
});


