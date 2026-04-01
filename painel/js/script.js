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

// 2. BUSCA NO BACKEND (filtragem por data feita no servidor)
async function buscarDados() {
    try {
        const response = await fetch('/api/hall');

        if (!response.ok) throw new Error('Erro ao buscar dados');

        const memoriais = await response.json();
        
        console.log("Dados recebidos:", memoriais);
        renderizar(memoriais);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

// 3. RENDERIZAÇÃO
function renderizar(lista) {
    const corpo = document.getElementById('painel-corpo');
    if (!corpo) return;

    if (lista.length === 0) {
        corpo.innerHTML = '<div class="info-row"><div class="text-default" style="width:100%; text-align:center;">Nenhuma homenagem agendada para hoje.</div></div>';
        return;
    }

    corpo.innerHTML = '';

    lista.forEach(item => {
        const linha = document.createElement('div');
        linha.className = 'info-row';
        
        const nome = item.nome || "Homenageado";
        const sala = item.sala || "-";
        const horario = item.horario || "Horário a definir";
        const foto = item.foto ? `https:${item.foto}` : 'https://via.placeholder.com/56';
        
        linha.innerHTML = `
            <svg class="info-row__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8"/></svg>
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${foto}" onerror="this.src='https://via.placeholder.com/56'">
            </div>
            <div class="text-default" style="flex:2; font-weight:bold;">${nome}</div>
            <div class="text-default" style="flex:1;">Sala ${sala}</div>
            <div class="text-default" style="flex:1.5;">${horario}</div>
            <div class="text-highlight">Em andamento</div>
        `;
        corpo.appendChild(linha);
    });
}

// 4. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    buscarDados();
    setInterval(buscarDados, 60000);
});
