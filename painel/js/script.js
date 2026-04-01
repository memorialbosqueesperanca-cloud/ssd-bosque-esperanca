/* ==========================================================================
   SISTEMA BOSQUE DA ESPERANÇA - VERSÃO LIVE (DIRETO GITHUB -> BUBBLE)
   ========================================================================== */

const BUBBLE_API_URL = 'https://memorialbosque.com.br/api/1.1/obj/memoriais';
const BUBBLE_TOKEN = '48535d0082b75e6ad804a8d905329089';

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

// 2. BUSCA NO BUBBLE
async function buscarDados() {
    try {
        const response = await fetch(BUBBLE_API_URL, {
            headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` }
        });

        if (!response.ok) throw new Error('Falha na autenticação');

        const data = await response.json();
        const memoriais = data.response ? data.response.results : (data.results || []);
        
        console.log("Dados recebidos:", memoriais);
        renderizar(memoriais);
    } catch (err) {
        console.error("Erro ao carregar dados do Bubble:", err);
    }
}

// 3. RENDERIZAÇÃO
function renderizar(lista) {
    const corpo = document.getElementById('painel-corpo');
    if (!corpo) return;

    // Se não houver dados, o painel fica limpo ou mostra mensagem
    if (lista.length === 0) {
        corpo.innerHTML = '<div class="info-row"><div class="text-default" style="width:100%; text-align:center;">Nenhuma homenagem agendada para hoje.</div></div>';
        return;
    }

    corpo.innerHTML = ''; // Apaga os nomes estáticos (Carlos Silva, etc)

    lista.forEach(item => {
        const linha = document.createElement('div');
        linha.className = 'info-row';
        
        // Mapeamento de campos (ajuste conforme os nomes no seu Bubble)
        const nome = item.falecido_nome || "Homenageado";
        const sala = item.sala_cerimonia || "-";
        const horario = item.periodo_velorio || "Horário a definir";
        
        linha.innerHTML = `
            <svg class="info-row__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8"/></svg>
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${item['Foto falecido'] || 'https://via.placeholder.com/56'}" onerror="this.src='https://via.placeholder.com/56'">
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
    setInterval(buscarDados, 60000); // Atualiza a cada 1 minuto
});
