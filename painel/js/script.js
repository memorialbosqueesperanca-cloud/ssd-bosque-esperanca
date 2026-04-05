/* ==========================================================================
   SISTEMA BOSQUE DA ESPERANÇA - VERSÃO LIVE
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
        return { texto: 'Previsto', cor: '#3B82F6' };
    } else if (agora < trintaMinAntes) {
        return { texto: 'Em andamento', cor: 'var(--cor-primaria)' };
    } else if (agora >= trintaMinAntes && agora <= vinteMinDepois) {
        return { texto: 'Encerrando', cor: '#FAA507' };
    } else {
        return { texto: 'Encerrado', cor: 'var(--cor-texto-principal)' };
    }
}

// 3. FORMATA HORÁRIO A PARTIR DE data_inicio E data_fim
function formatarHorario(data_inicio, data_fim) {
    if (!data_inicio || !data_fim) return 'Horário a definir';
    const opcoes = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' };
    const hi = new Date(data_inicio).toLocaleTimeString('pt-BR', opcoes);
    const hf = new Date(data_fim).toLocaleTimeString('pt-BR', opcoes);
    return `${hi} às ${hf}`;
}

// 4. BUSCA NO BACKEND
async function buscarDados() {
    try {
        const response = await fetch('/api/hall');
        if (!response.ok) throw new Error('Erro ao buscar dados');
        const memoriais = await response.json();
        renderizar(memoriais);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

// 5. RENDERIZAÇÃO
function renderizar(lista) {
    const corpo = document.getElementById('painel-corpo');
    if (!corpo) return;

    if (lista.length === 0) {
        corpo.innerHTML = '<div class="info-row"><div class="text-default" style="width:100%; text-align:center;">Nenhuma homenagem agendada para hoje.</div></div>';
        return;
    }

    corpo.innerHTML = '';

    const ordemStatus = { 'Em andamento': 0, 'Encerrando': 1, 'Previsto': 2, 'Encerrado': 3 };
    lista.sort((a, b) => {
        const sa = calcularStatus(a.data_inicio, a.data_fim).texto;
        const sb = calcularStatus(b.data_inicio, b.data_fim).texto;
        const diffStatus = (ordemStatus[sa] ?? 99) - (ordemStatus[sb] ?? 99);
        if (diffStatus !== 0) return diffStatus;
        return new Date(a.data_inicio) - new Date(b.data_inicio);
    });

    lista.forEach(item => {
        const linha = document.createElement('div');
        const nome = item.nome || 'Homenageado';
        const salaRaw = item.sala || '-';
        const sala = /^sala\s/i.test(salaRaw) ? salaRaw : `Sala ${salaRaw}`;
        const horario = formatarHorario(item.data_inicio, item.data_fim);
        const foto = item.foto ? `https:${item.foto}` : 'https://via.placeholder.com/56';
        const status = calcularStatus(item.data_inicio, item.data_fim);

        linha.className = 'info-row' + (status.texto === 'Encerrado' ? ' info-row--encerrado' : '');
        const destinoFinal = (item.destino && item.destino.trim() !== '')
            ? item.destino
            : 'Cremação';

        const salasEsquerda = ['5', '6', '7', '8'];
        const salaNumero = String(salaRaw).replace(/^sala\s*/i, '').trim();
        const setaEsquerda = salasEsquerda.includes(salaNumero);

        const svgSeta = setaEsquerda
            ? `<svg class="info-row__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
               </svg>`
            : `<svg class="info-row__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
               </svg>`;

        linha.innerHTML = `
            ${svgSeta}
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${foto}" onerror="this.src='https://via.placeholder.com/56'">
            </div>
            <div class="info-nome text-default">${nome}</div>
            <div class="info-sala text-default">${sala}</div>
            <div class="info-horario text-default">${horario}</div>
            <div class="info-destino text-default">${destinoFinal}</div>
            <div class="info-status text-highlight" style="color:${status.cor};">${status.texto}</div>
        `;
        corpo.appendChild(linha);
    });
}

// 6. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    buscarDados();
    setInterval(buscarDados, 60000);
});
