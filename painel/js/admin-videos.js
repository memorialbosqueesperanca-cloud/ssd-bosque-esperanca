const API_VIDEO_UPLOAD = '/api/video-upload';
const API_VIDEO_CONFIG = '/api/video-config';

const state = {
    hall: null,
    sala: null
};

function atualizarDataHora() {
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const horaFormatada = agora.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const title = document.querySelector('.header-title');
    const clock = document.querySelector('.header-clock');

    if (title) title.textContent = `${dataFormatada} Segunda-Feira`;
    if (clock) clock.textContent = horaFormatada;
}

function mostrarNotificacao(mensagem, tipo = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3200);
}

function createVideoPreview(videoPath) {
    return `
        <video class="preview-video" controls muted playsinline preload="metadata">
            <source src="${videoPath}" type="video/mp4">
            Seu navegador não suporta a visualização de vídeo.
        </video>
        <div class="preview-file-name">${videoPath.split('/').pop()}</div>
    `;
}

function atualizarInterface() {
    const hallPreview = document.getElementById('hallPreview');
    const salaPreview = document.getElementById('salaPreview');
    const hallStatus = document.getElementById('hallStatus');
    const hallFileName = document.getElementById('hallFileName');
    const salaStatus = document.getElementById('salaStatus');
    const salaFileName = document.getElementById('salaFileName');

    if (state.hall) {
        hallPreview.innerHTML = createVideoPreview(state.hall);
        hallStatus.textContent = 'Carregado';
        hallFileName.textContent = state.hall.split('/').pop();
    } else {
        hallPreview.textContent = 'Nenhum vídeo carregado';
        hallStatus.textContent = 'Sem vídeo';
        hallFileName.textContent = '-';
    }

    if (state.sala) {
        salaPreview.innerHTML = createVideoPreview(state.sala);
        salaStatus.textContent = 'Carregado';
        salaFileName.textContent = state.sala.split('/').pop();
    } else {
        salaPreview.textContent = 'Nenhum vídeo carregado';
        salaStatus.textContent = 'Sem vídeo';
        salaFileName.textContent = '-';
    }
}

async function carregarConfiguracao() {
    try {
        const response = await fetch(API_VIDEO_CONFIG);
        if (!response.ok) throw new Error('Falha ao carregar configuração');

        const config = await response.json();
        state.hall = Array.isArray(config.hall) && config.hall.length > 0 ? config.hall[0] : null;
        state.sala = Array.isArray(config.sala) && config.sala.length > 0 ? config.sala[0] : null;
        atualizarInterface();
    } catch (error) {
        console.warn('Não foi possível carregar configuração:', error);
    }
}

async function uploadVideo(tipo, file) {
    if (!file.type.startsWith('video/')) {
        mostrarNotificacao('Por favor, selecione um arquivo de vídeo.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('videoFile', file);

    try {
        const response = await fetch(API_VIDEO_UPLOAD, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Falha no upload');

        const result = await response.json();
        if (!result.success) throw new Error('Retorno inválido do servidor');

        state[tipo] = result.path;
        atualizarInterface();
        mostrarNotificacao('Vídeo enviado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro no upload:', error);
        mostrarNotificacao('Falha ao enviar vídeo. Tente novamente.', 'error');
    }
}

async function salvarConfiguracao() {
    try {
        const response = await fetch(API_VIDEO_CONFIG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hall: state.hall ? [state.hall] : [],
                sala: state.sala ? [state.sala] : []
            })
        });

        if (!response.ok) throw new Error('Falha ao salvar configuração');

        mostrarNotificacao('Configuração salva com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar configuração:', error);
        mostrarNotificacao('Falha ao salvar configuração.', 'error');
    }
}

function inicializarEventos() {
    const hallInput = document.getElementById('hallInput');
    const salaInput = document.getElementById('salaInput');
    const hallDropZone = document.getElementById('hallDropZone');
    const salaDropZone = document.getElementById('salaDropZone');
    const hallButton = document.getElementById('hallSelectButton');
    const salaButton = document.getElementById('salaSelectButton');

    hallButton.addEventListener('click', () => hallInput.click());
    salaButton.addEventListener('click', () => salaInput.click());

    hallInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) await uploadVideo('hall', file);
    });

    salaInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) await uploadVideo('sala', file);
    });

    hallDropZone.addEventListener('dragover', (event) => event.preventDefault());
    salaDropZone.addEventListener('dragover', (event) => event.preventDefault());

    hallDropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) await uploadVideo('hall', file);
    });

    salaDropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) await uploadVideo('sala', file);
    });

    document.getElementById('btnSaveConfig').addEventListener('click', salvarConfiguracao);
}

function init() {
    atualizarDataHora();
    setInterval(atualizarDataHora, 1000);
    carregarConfiguracao();
    inicializarEventos();
}

document.addEventListener('DOMContentLoaded', init);
