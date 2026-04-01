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
    const trintaMinDepois = new Date(fim.getTime() + 30 * 60 * 1000);

    if (agora < trintaMinAntes) {
        return { texto: 'Em andamento', cor: 'var(--cor-secundaria)' };
    } else if (agora >= trintaMinAntes && agora <= fim) {
        return { texto: 'Encerrando', cor: '#FAA507' };
    } else if (agora > fim && agora <= trintaMinDepois) {
        return { texto: 'Encerrado', cor: 'var(--cor-texto-principal)' };
    }
    return null;
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

    // Filtra no cliente: só exibe quem ainda está dentro do período (incluindo 30min após)
    const visiveis = lista.filter(item => calcularStatus(item.data_inicio, item.data_fim) !== null);

    if (visiveis.length === 0) {
        corpo.innerHTML = '<div class="info-row"><div class="text-default" style="width:100%; text-align:center;">Nenhuma homenagem agendada para hoje.</div></div>';
        return;
    }

    corpo.innerHTML = '';

    visiveis.forEach(item => {
        const linha = document.createElement('div');
        linha.className = 'info-row';

        const nome = item.nome || 'Homenageado';
        const sala = item.sala || '-';
        const horario = formatarHorario(item.data_inicio, item.data_fim);
        const foto = item.foto ? `https:${item.foto}` : 'https://via.placeholder.com/56';
        const status = calcularStatus(item.data_inicio, item.data_fim);

        linha.innerHTML = `
            <svg class="info-row__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8"/></svg>
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${foto}" onerror="this.src='https://via.placeholder.com/56'">
            </div>
            <div class="text-default" style="flex:2; font-weight:bold;">${nome}</div>
            <div class="text-default" style="flex:1;">Sala ${sala}</div>
            <div class="text-default" style="flex:1.5;">${horario}</div>
            <div class="text-highlight" style="color:${status.cor};">${status.texto}</div>
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
