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
    
    // Regras de negócio para as cores e textos de status
    const trintaMinAntes = new Date(fim.getTime() - 30 * 60 * 1000);
    const vinteMinDepois = new Date(fim.getTime() + 20 * 60 * 1000);

    if (agora < inicio) {
        return { texto: 'Previsto', cor: '#3B82F6' }; // Azul
    } else if (agora < trintaMinAntes) {
        return { texto: 'Em andamento', cor: '#01813D' }; // Verde original
    } else if (agora >= trintaMinAntes && agora <= vinteMinDepois) {
        return { texto: 'Encerrando', cor: '#FAA507' }; // Laranja
    } else {
        return { texto: 'Encerrado', cor: '#666666' }; // Cinza
    }
}

// 3. FORMATA HORÁRIO
function formatarHorario(data_inicio, data_fim) {
    if (!data_inicio || !data_fim) return 'Horário a definir';
    const opcoes = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' };
    const hi = new Date(data_inicio).toLocaleTimeString('pt-BR', opcoes);
    const hf = new Date(data_fim).toLocaleTimeString('pt-BR', opcoes);
    return `${hi} às ${hf}`;
}

// 4. BUSCA NO BACKEND (CONECTADO AO SEU SERVER.JS)
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

// 5. RENDERIZAÇÃO DA TABELA
function renderizar(lista) {
    const corpo = document.getElementById('painel-corpo');
    if (!corpo) return;

    if (lista.length === 0) {
        corpo.innerHTML = '<div class="info-row"><div class="text-default" style="width:100%; text-align:center;">Nenhuma homenagem agendada para hoje.</div></div>';
        return;
    }

    corpo.innerHTML = '';

    // Ordenação:
    // - Primeiro: Encerrando (quem termina antes vem antes)
    // - Depois: Em andamento (ordem por início)
    // - Depois: Previsto (ordem por início)
    // - Por último: Encerrado
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

        if (sa === 'Encerrando') {
            return fimA - fimB || inicioA - inicioB;
        }

        if (sa === 'Em andamento' || sa === 'Previsto') {
            return inicioA - inicioB || fimA - fimB;
        }

        return fimA - fimB || inicioA - inicioB;
    });

    lista.forEach(item => {
        const linha = document.createElement('div');
        const status = calcularStatus(item.data_inicio, item.data_fim);
        const sala = item.sala ? (item.sala.toLowerCase().includes('sala') ? item.sala : `Sala ${item.sala}`) : '-';
        const foto = item.foto ? item.foto : 'videos/logo_bosque.png';

        linha.className = 'info-row' + (status.texto === 'Encerrado' ? ' info-row--encerrado' : '');
        
        if (item.isEmergencia) {
            linha.classList.add('info-row--emergencia');
            if (item.emergenciaIndex !== undefined) {
                linha.setAttribute('data-emergencia-index', item.emergenciaIndex);
            }
        }
        
        // Lógica da seta baseada no número da sala
        const salasEsquerda = ['5', '6', '7', '8'];
        const numeroApenas = String(item.sala).replace(/\D/g, '');
        const setaEsquerda = salasEsquerda.includes(numeroApenas);

        const svgSeta = setaEsquerda
            ? `<svg class="info-row__icon" viewBox="0 0 24 24"><path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`
            : `<svg class="info-row__icon" viewBox="0 0 24 24"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

        let destinoTexto = item.destino || "Cremação";
        if (!destinoTexto || destinoTexto.trim() === "" || destinoTexto.toLowerCase() === "consulte a recepção") {
            destinoTexto = "Cremação";
        }
        // Exibir exatamente como veio preenchido, sem adicionar "Quadra" automaticamente

        linha.innerHTML = `
            ${svgSeta}
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${foto}" onerror="this.src='videos/logo_bosque.png'">
            </div>
            <div class="info-nome text-default">${item.nome || 'Homenageado'}</div>
            <div class="info-sala text-default">${sala}</div>
            <div class="info-horario text-default">${formatarHorario(item.data_inicio, item.data_fim)}</div>
            <div class="info-destino text-default">${destinoTexto}</div>
            <div class="info-status text-highlight" style="color:${status.cor};">${status.texto}</div>
        `;
        corpo.appendChild(linha);
    });

    // Ajuste dinâmico para caber todos os itens na tela sem rolar
    corpo.style.transform = 'none';
    corpo.style.transformOrigin = 'top center';
    setTimeout(() => {
        const scrollHeight = corpo.scrollHeight;
        const maxHeight = corpo.parentElement ? corpo.parentElement.clientHeight : window.innerHeight * 0.8;
        
        if (scrollHeight > maxHeight && maxHeight > 0) {
            const scale = maxHeight / scrollHeight;
            corpo.style.transform = `scale(${scale * 0.96})`;
            corpo.style.marginBottom = `-${scrollHeight * (1 - scale)}px`;
        }
    }, 50);
}

// 6. INICIALIZAÇÃO E VÍDEOS
const urlParamsHall = new URLSearchParams(window.location.search);
const isModoSala = urlParamsHall.get('modo') === 'sala';

const VIDEO_CONFIG_URL = '/api/video-config';
const DEFAULT_VIDEOS_HALL = ['videos/video1.mp4', 'videos/video2.mp4'];
const DEFAULT_VIDEOS_SALA = ['videos/video-sala1.mp4', 'videos/video-sala2.mp4'];
const CACHE_VIDEO_KEY = 'painel_video_cache';

async function carregarConfiguracaoVideosServidor() {
    try {
        const response = await fetch(VIDEO_CONFIG_URL);
        if (!response.ok) throw new Error('Falha ao carregar configuração de vídeo');
        const config = await response.json();
        
        // Salva com sucesso para o cache offline
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
const tempoExibicaoTabela = 60000; // 1 minuto
let indiceVideoAtual = 0;

async function aplicarConfiguracaoVideos() {
    const config = await carregarConfiguracaoVideosServidor();
    arquivosVideos = isModoSala ? config.sala : config.hall;
    if (!Array.isArray(arquivosVideos) || arquivosVideos.length === 0) {
        arquivosVideos = isModoSala ? DEFAULT_VIDEOS_SALA : DEFAULT_VIDEOS_HALL;
    }
}

async function alternarConteudo() {
    // Atualiza a lista de vídeos silenciosamente para pegar alterações feitas no notebook remoto
    await aplicarConfiguracaoVideos();
    
    // Se a nova lista for menor e o índice ficou fora de alcance, reseta para o primeiro
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

    // Mostra o vídeo
    sourceTag.src = arquivosVideos[indiceVideoAtual];
    videoTag.load();
    overlay.style.display = 'block';
    
    videoTag.play().catch((err) => {
        console.warn("Erro ao reproduzir vídeo (pode ter sido excluído ou inválido):", err);
        overlay.style.display = 'none';
        indiceVideoAtual = (indiceVideoAtual + 1) % arquivosVideos.length;
        setTimeout(alternarConteudo, tempoExibicaoTabela); // Força a continuação do ciclo
    });

    videoTag.onended = () => {
        overlay.style.display = 'none'; // Volta para a tabela
        indiceVideoAtual = (indiceVideoAtual + 1) % arquivosVideos.length;
        setTimeout(alternarConteudo, tempoExibicaoTabela);
    };
}

// --- PAINEL DE EMERGÊNCIA ---

// Dados de emergência (armazenados localmente)
let emergencyEntradas = [];

// Constantes para localStorage
const EMERGENCY_KEY = 'painel_emergencia_dados';
const CACHE_API_KEY = 'painel_hall_cache';

// Funções de gerenciamento de emergência
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
        console.warn('Falha ao carregar cache de dados da API:', err);
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
        
        // Auto-limpeza inteligente: Mantém baseada no término real do velório.
        // Ex: Velório de 16h as 17h, some às 21h. 
        // Velório de 20h às 10h do DIA SEGUINTE, só sumirá às 14h do DIA SEGUINTE.
        const agora = new Date();
        const limite = new Date(agora.getTime() - 4 * 60 * 60 * 1000);
        emergencyEntradas = parsed.filter(e => new Date(e.data_fim) > limite);
        
        if (emergencyEntradas.length !== parsed.length) {
            salvarEntradasEmergencia(); // Atualiza o localStorage limpo
        }
        
        return emergencyEntradas;
    } catch (err) {
        console.warn('Falha ao carregar entradas de emergência:', err);
        localStorage.removeItem(EMERGENCY_KEY);
        return [];
    }
}

function mesclarEmergencia(dadosAPI) {
    if (!Array.isArray(dadosAPI)) dadosAPI = [];
    
    // Priorizar API: Se houver dados da API, verificar e remover entradas manuais conflitantes (mesma sala, sobreposição de horários)
    if (dadosAPI.length > 0) {
        let houveExclusao = false;
        const entradasValidas = emergencyEntradas.filter(manual => {
            const numSalaManual = String(manual.sala).replace(/\D/g, '');
            const inicioManual = new Date(manual.data_inicio);
            const fimManual = new Date(manual.data_fim);
            
            const conflitoComAPI = dadosAPI.some(apiItem => {
                const numSalaAPI = String(apiItem.sala).replace(/\D/g, '');
                // Se a sala for diferente ou não possuir número, não há conflito
                if (!numSalaManual || numSalaManual !== numSalaAPI) return false;
                
                const inicioAPI = new Date(apiItem.data_inicio);
                const fimAPI = new Date(apiItem.data_fim);
                
                // Verifica sobreposição de tempo (inicio1 < fim2 && fim1 > inicio1)
                return (inicioManual < fimAPI && fimManual > inicioAPI);
            });
            
            if (conflitoComAPI) {
                houveExclusao = true;
            }
            return !conflitoComAPI;
        });
        
        if (houveExclusao) {
            emergencyEntradas = entradasValidas;
            salvarEntradasEmergencia();
            // Atualizar contadores visuais do painel caso algo tenha sido excluído
            if (typeof atualizarStatusEmergencia === 'function') {
                setTimeout(atualizarStatusEmergencia, 0);
            }
        }
    }
    
    return [...dadosAPI, ...emergencyEntradas.map((item, index) => ({ ...item, isEmergencia: true, emergenciaIndex: index }))];
}

// Processar arquivo CSV/Excel
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
            
            // Mapeamento de campos comuns
            if (cabecalho.includes('nome')) item.nome = valor;
            else if (cabecalho.includes('sala')) item.sala = valor;
            else if (cabecalho.includes('inicio') || cabecalho.includes('data_inicio')) item.data_inicio = valor;
            else if (cabecalho.includes('fim') || cabecalho.includes('termino') || cabecalho.includes('data_fim')) item.data_fim = valor;
            else if (cabecalho.includes('destino') || cabecalho.includes('quadra')) item.destino = valor;
            else if (cabecalho.includes('foto')) item.foto = valor;
        });
        
        return item;
    }).filter(item => item.nome); // Só incluir itens com nome
}

// Event listeners para o painel de emergência
document.addEventListener('DOMContentLoaded', async () => {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    carregarEntradasEmergencia();
    atualizarStatusEmergencia();
    await aplicarConfiguracaoVideos();
    buscarDados();
    setInterval(buscarDados, 60000);
    setTimeout(alternarConteudo, tempoExibicaoTabela);

    // Auto-reload diário (Digital Signage): Limpa a memória da TV recarregando o painel às 03:00 AM
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
    
    // Atalho discreto para a página de administração de vídeos (Clique Duplo no Relógio)
    const relogio = document.querySelector('.header-relogio');
    if (relogio) {
        relogio.addEventListener('dblclick', (e) => {
            e.stopPropagation(); // Impede de ativar o tela-cheia junto
            window.location.href = '/admin-videos.html';
        });
    }
    
    // Botão de emergência no header
    const btnEmergencia = document.getElementById('btn-emergencia');
    const overlayEmergencia = document.getElementById('emergencia-overlay');
    const fecharEmergencia = document.getElementById('fechar-emergencia');
    const formEmergencia = document.getElementById('form-emergencia');
    const btnAdicionarManual = document.getElementById('btn-adicionar-manual');
    const btnLimparEmergencia = document.getElementById('btn-limpar-emergencia');
    const btnImportarArquivo = document.getElementById('btn-importar-arquivo');
    const inputArquivo = document.getElementById('arquivo-excel');
    
    // Abrir painel de emergência
    if (btnEmergencia) {
        btnEmergencia.addEventListener('click', () => {
            overlayEmergencia.classList.add('active');
            atualizarStatusEmergencia();
            
            // Preencher data atual automaticamente
            const hoje = new Date();
            const tzOffset = hoje.getTimezoneOffset() * 60000;
            const dataAtual = (new Date(hoje - tzOffset)).toISOString().slice(0, 16); // Formato YYYY-MM-DDTHH:MM local
            const inicioInput = document.getElementById('emergencia-inicio');
            if (inicioInput && !inicioInput.value) {
                inicioInput.value = dataAtual;
            }
        });
    }
    
    // Fechar painel de emergência
    if (fecharEmergencia) {
        fecharEmergencia.addEventListener('click', () => {
            overlayEmergencia.classList.remove('active');
        });
    }
    
    // Fechar ao clicar no overlay
    if (overlayEmergencia) {
        overlayEmergencia.addEventListener('click', (e) => {
            if (e.target === overlayEmergencia) {
                overlayEmergencia.classList.remove('active');
            }
        });
    }
    
    // Event listeners para edição de emergência
    let editandoIndex = -1;
    const editOverlay = document.getElementById('emergencia-edit-overlay');
    const editForm = document.getElementById('emergencia-edit-form');
    const btnEditCancelar = document.getElementById('btn-edit-cancelar');
    const btnEditExcluir = document.getElementById('btn-edit-excluir');
    const btnEditSalvar = document.getElementById('btn-edit-salvar');
    
    // Clique em registros de emergência
    document.addEventListener('click', (e) => {
        const row = e.target.closest('.info-row--emergencia');
        if (row && row.hasAttribute('data-emergencia-index')) {
            const index = parseInt(row.getAttribute('data-emergencia-index'));
            if (index >= 0 && index < emergencyEntradas.length) {
                abrirModalEdicao(index);
            }
        }
    });
    
    // Fechar modal de edição
    if (btnEditCancelar) {
        btnEditCancelar.addEventListener('click', () => {
            editOverlay.classList.remove('active');
            editandoIndex = -1;
        });
    }
    
    // Fechar ao clicar no overlay de edição
    if (editOverlay) {
        editOverlay.addEventListener('click', (e) => {
            if (e.target === editOverlay) {
                editOverlay.classList.remove('active');
                editandoIndex = -1;
            }
        });
    }
    
    // Salvar edição
    if (btnEditSalvar) {
        btnEditSalvar.addEventListener('click', () => {
            salvarEdicaoEmergencia();
        });
    }
    
    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarEdicaoEmergencia();
        });
    }
    
    // Excluir entrada
    if (btnEditExcluir) {
        btnEditExcluir.addEventListener('click', () => {
            if (editandoIndex >= 0 && confirm('Tem certeza que deseja excluir esta entrada de emergência?')) {
                emergencyEntradas.splice(editandoIndex, 1);
                salvarEntradasEmergencia();
                buscarDados();
                atualizarStatusEmergencia();
                editOverlay.classList.remove('active');
                editandoIndex = -1;
                alert('Entrada de emergência excluída com sucesso!');
            }
        });
    }
    
    // Adicionar entrada manual
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
            
            // Processar foto se houver
            let foto = null;
            if (fotoInput.files && fotoInput.files[0]) {
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
    
    // Limpar entradas de emergência
    if (btnLimparEmergencia) {
        btnLimparEmergencia.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todas as entradas de emergência?')) {
                emergencyEntradas = [];
                salvarEntradasEmergencia();
                buscarDados(); // Recarregar dados
                atualizarStatusEmergencia();
                alert('Entradas de emergência limpas com sucesso!');
            }
        });
    }
    
    // Importar arquivo
    if (btnImportarArquivo) {
        btnImportarArquivo.addEventListener('click', () => {
            if (!inputArquivo.files || !inputArquivo.files[0]) {
                alert('Por favor, selecione um arquivo CSV ou Excel.');
                return;
            }
            
            const file = inputArquivo.files[0];
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    const csvText = e.target.result;
                    const dadosImportados = parseCSV(csvText);
                    
                    if (dadosImportados.length === 0) {
                        alert('Nenhum dado válido encontrado no arquivo.');
                        return;
                    }
                    
                    // Adicionar dados importados
                    dadosImportados.forEach(item => {
                        if (item.nome) {
                            emergencyEntradas.push({
                                nome: item.nome,
                                sala: item.sala || 'Sala não informada',
                                data_inicio: item.data_inicio || new Date().toISOString(),
                                data_fim: item.data_fim || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                                destino: item.destino || 'Consulte a recepção',
                                foto: item.foto || null,
                                isEmergencia: true
                            });
                        }
                    });
                    
                    salvarEntradasEmergencia();
                    buscarDados(); // Recarregar dados
                    atualizarStatusEmergencia();
                    alert(`${dadosImportados.length} registros importados com sucesso!`);
                    
                } catch (err) {
                    console.error('Erro ao processar arquivo:', err);
                    alert('Erro ao processar o arquivo. Verifique o formato.');
                }
            };
            
            reader.readAsText(file);
        });
    }
});

function adicionarEntradaEmergencia(dados) {
    emergencyEntradas.push({
        ...dados,
        isEmergencia: true
    });
    
    salvarEntradasEmergencia();
    buscarDados(); // Recarregar dados
    atualizarStatusEmergencia();
    
    // Limpar formulário
    document.getElementById('emergencia-nome').value = '';
    document.getElementById('emergencia-sala').value = '';
    document.getElementById('emergencia-inicio').value = '';
    document.getElementById('emergencia-fim').value = '';
    document.getElementById('emergencia-destino').value = '';
    document.getElementById('emergencia-foto-upload').value = '';
    
    alert('Entrada de emergência adicionada com sucesso!');
    
    // Fechar o painel de emergência
    const overlayEmergencia = document.getElementById('emergencia-overlay');
    if (overlayEmergencia) {
        overlayEmergencia.classList.remove('active');
    }
}

function abrirModalEdicao(index) {
    if (index < 0 || index >= emergencyEntradas.length) return;
    
    const entrada = emergencyEntradas[index];
    editandoIndex = index;
    
    // Preencher formulário
    document.getElementById('edit-nome').value = entrada.nome || '';
    document.getElementById('edit-sala').value = entrada.sala || '';
    document.getElementById('edit-inicio').value = entrada.data_inicio ? new Date(entrada.data_inicio).toISOString().slice(0, 16) : '';
    document.getElementById('edit-fim').value = entrada.data_fim ? new Date(entrada.data_fim).toISOString().slice(0, 16) : '';
    document.getElementById('edit-destino').value = entrada.destino || '';
    
    // Abrir modal
    document.getElementById('emergencia-edit-overlay').classList.add('active');
}

function salvarEdicaoEmergencia() {
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
    
    // Atualizar entrada
    emergencyEntradas[editandoIndex] = {
        ...emergencyEntradas[editandoIndex],
        nome,
        sala,
        data_inicio: inicio,
        data_fim: fim,
        destino
    };
    
    salvarEntradasEmergencia();
    buscarDados();
    atualizarStatusEmergencia();
    
    // Fechar modal
    document.getElementById('emergencia-edit-overlay').classList.remove('active');
    editandoIndex = -1;
    
    alert('Entrada de emergência atualizada com sucesso!');
}

function atualizarStatusEmergencia() {
    const timestampEl = document.getElementById('cache-timestamp');
    const conexaoEl = document.getElementById('conexao-status');
    
    if (timestampEl) {
        const agora = new Date();
        timestampEl.textContent = agora.toLocaleString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
    }
    
    if (conexaoEl) {
        conexaoEl.textContent = navigator.onLine ? 'Online' : 'Offline';
    }
}

// --- FUNÇÃO DE TELA CHEIA (DOUBLE CLICK) ---
document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
        // Se não estiver em tela cheia, entra
        document.documentElement.requestFullscreen().catch((err) => {
            console.warn(`Erro ao tentar ativar tela cheia: ${err.message}`);
        });
    } else {
        // Se já estiver em tela cheia, sai
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});