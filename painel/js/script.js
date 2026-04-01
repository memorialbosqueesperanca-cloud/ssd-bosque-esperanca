/* ==========================================================================
   SISTEMA BOSQUE DA ESPERANÇA - INTEGRAÇÃO BUBBLE + IVERTEX + STATUS DINÂMICO
   ========================================================================== */

const BUBBLE_API_URL = 'https://memorialbosque.com.br/api/1.1/obj';
const BUBBLE_TOKEN = '48535d0082b75e6ad804a8d905329089';
const IVERTEX_API_URL = 'URL_DA_API_IVERTEX'; // Substituir pela URL real do iVertex

// Placeholder em Base64 fornecido
const FOTO_PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAErklEQVRYhbWXe4hXRRTHP7+f62NLU2gsVEI0y8o1UJCiWJrMirR3RFhtL/8xpMDqDx/o7Bjh9oAK/KOgfKGZWFGSZLTqUUuh0ChlsRZSMldrZ0EtzUf6648797dn7967ZdL5Z+Y8v2fmzj1zBs6DjLNjjbPLzidG6TzAZwCLInsSGBG8HDzXOOX/CO4UOEBfoM04O/x/T8A4+yTQGNndwJ1Kvc84W3su8WqMs1OAM8DBUoWW9gVyugfwkcDiyG4OXmyUDwXaorwFGFEU45L5ttfZEnXAEKB3yTh7hq47cQL4Avioz18sa3tJKiqBU0BvoCV4GZNJbjiwL7KvBy/PKd1U4EHgduAC7Vcyzh4BLirKGPgcmBO87DTOjgE+AUYHL2eyhsbZR4C3geuBX4E3gak9xD6uE9gINAO3ATbH+Ftgyr856cbZlcDDOSoh2d1bgInA8Rql/DF4WQgsjEEmAjPpPGTjSE56U/AyuwD4fuDDjLgZeDl4aVZ2w2ICXb59L+0VvGwMXu4C+gMrlWqWcfb7HPAlGfDNwJDg5VYNnsXSCZzKW1Xwcix4eRQYDRyO4rHG2XYFvg14QrlNDl5s8HIoL6bG0mfgJPAW0Bi8HC5wxDi7BaiP7B7gAMk3BThEUhFPFPgOJKkh04F+ZA6hptVUeCwskNxdMc6uAyZnxK3By5V59oPn2ZpKmeV0/yOOF1XChyhxMla9bhS8TAF2KNG+InDjbEOlzOkccKDrGVgLzAb+ULLFxtmPC5K8XM0vLQD/AFiuRMeAOSS1pJpAWul+C16agpcBQINyusc4q1eLcfZ5YJAS1RpnZ2dsvgYeUKLHg5f+8VdPy/bZMpCe5mGpZfCy4mgNJeCHKBpvnBUVrCmO+4G9cf6iAt8ATIjsAaBf8KJ3YmAc22uAVmAUcK1ewal5QoCrjLO7gDrgJuPsLOBLIC1g8+O4BOhlnL0BuJFYZICfghf9qVIaGcfWMvBNdgc0BS9jgT8juxB4TemWBi9LlXkT8EqcnygAh+SuANhZJimVABhn7y1wqFfz6+K4Scm259hNIIeMs6MU21wOXrYqwYw8p+BlB8kloulTNV+X0a0OXnbnxQKeVnE3pL/hqjhOMs4O6u4DwLMZfruaf5XRTS+IAZD2CWugsw7MVQa5XW7wsgf4uSqo0KLUu9Rcikq5cfZVxc6tJhC87KVzi+82ztaTT+9UZyWuUcl1KJttBeBXAC9EdlPw0lpNAKAC9yn7LcbZATlx1qr5pIIkL84KBjfaGuiyY9XDXk2gw8sxutbrduNsl0sqePlOseMzOGkz21sLjbN9KhUCnbWjIXg52i2BCPA+8EZk+wJHjLM3Z4DSlmxkRp4+cqpdtXF2HMk1n1a+RcHLCu3U7TYMXmaSNJMpbTTOrjfODol8axwHZ1zTFbZH8KXATqVfFLw8k8UrfJrFVvq9jHgrYICrgY7gxSj79FJrA4Zm/BqyK0+p8GUUvKyqJP3geiWuj+DQWZ4xzl6obDT4Z8CAInDo3LZcigfzDjPfXkaJRuAppdbtebbmv0vS2v3SU/x/TCClsED2A9OAacbZOpK3w+/KpJbkIloVvHTrmHuivwEq0Jka6CArzwAAAABJRU5ErkJggg==";

// --- 1. RELÓGIO ---
function atualizarDataHora() {
    const agora = new Date();
    const opcoesData = { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' };
    document.querySelector('.painel-header__titulo').innerText = agora.toLocaleDateString('pt-BR', opcoesData).toUpperCase();
    document.querySelector('.header-relogio').innerText = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// --- 2. LÓGICA DE STATUS DINÂMICO ---
function calcularStatus(dataInicioISO, dataFimISO) {
    const agora = new Date();
    const inicio = new Date(dataInicioISO);
    const fim = new Date(dataFimISO);

    const diffAposFim = (agora - fim) / (1000 * 60); // Diferença em minutos

    if (agora < inicio) return { texto: "Previsto", cor: "#FAA507" };
    if (agora >= inicio && agora <= fim) return { texto: "Em andamento", cor: "#01813D" };
    
    // Regra dos 30 min solicitada
    if (diffAposFim > 0 && diffAposFim <= 30) return { texto: "Encerrando", cor: "#B54708" };
    
    return { texto: "Encerrado", cor: "#424543" };
}

// --- 3. BUSCA E CRUZAMENTO DE DADOS (BUBBLE + IVERTEX) ---
async function carregarDadosUnificados() {
    try {
        console.log("Buscando dados no modo LIVE...");
        const resBubble = await fetch(BUBBLE_API_URL, { 
            headers: { 'Authorization': `Bearer ${BUBBLE_TOKEN}` } 
        });
        
        if (!resBubble.ok) throw new Error(`Erro: ${resBubble.status}`);

        const jsonBubble = await resBubble.json();
        const resultados = jsonBubble.response ? jsonBubble.response.results : (jsonBubble.results || []);
        
        console.log("Recebidos do Bubble:", resultados);

        // Filtro simplificado: Verifica se o velório começou nas últimas 24h ou termina hoje
        const agora = new Date();
        const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();

        const dadosFiltrados = resultados.filter(item => {
            if (!item.data_inicio) return false;
            const dataIn = new Date(item.data_inicio).getTime();
            // Retorna se for de hoje (mesmo que o fuso varie algumas horas)
            return Math.abs(agora - dataIn) < (24 * 60 * 60 * 1000); 
        });

        renderizarPainel(dadosFiltrados);

    } catch (e) {
        console.error("O navegador bloqueou o acesso local. Erro:", e.message);
    }
}

// --- 4. RENDERIZAÇÃO ---
function renderizarPainel(lista) {
    const corpo = document.getElementById('painel-corpo');
    corpo.innerHTML = '';

    lista.forEach(item => {
        // Compatibilidade de campos entre Bubble e iVertex
        const nome = item.falecido_nome || item.nome_falecido || "Homenageado";
        const sala = item.sala_cerimonia || item.sala || "-";
        const dIn = item.data_inicio || item.previsao_inicio;
        const dFi = item.data_fim || item.previsao_fim;

        const statusObj = calcularStatus(dIn, dFi);

        // Formatação do horário (Ex: 14:00 às 18:00)
        const formatarHora = (dataString) => {
            if (!dataString) return '--:--';
            const d = new Date(dataString);
            return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        };
        const horarioTexto = `${formatarHora(dIn)} às ${formatarHora(dFi)}`;

        let fotoUrl = FOTO_PLACEHOLDER;
        if (item['Foto falecido'] || item.url_foto) {
            const rawFoto = item['Foto falecido'] || item.url_foto;
            fotoUrl = rawFoto.startsWith('http') ? rawFoto : `https:${rawFoto}`;
        }

        const linha = document.createElement('div');
        linha.className = 'info-row';
        linha.innerHTML = `
            <svg class="info-row__icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8"/></svg>
            <div class="info-row__foto-wrapper">
                <img class="info-row__foto" src="${fotoUrl}">
            </div>
            <div class="text-default">${nome}</div>
            <div class="text-default">Sala ${sala}</div>
            <div class="text-default">${horarioTexto}</div>
            <div class="text-highlight" style="color: ${statusObj.cor};">${statusObj.texto}</div>
        `;
        corpo.appendChild(linha);
    });
}

// --- 5. START ---
document.addEventListener('DOMContentLoaded', () => {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    carregarDadosUnificados();
    setInterval(carregarDadosUnificados, 30000); 
});